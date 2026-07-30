/**
 * CRM schema - additive, idempotent, non-destructive.
 *
 * Called from ensureSchema() in db.ts, so it runs once per server instance
 * on the same bootstrap as the rest of the tables. Every statement is
 * CREATE ... IF NOT EXISTS: it never drops, truncates or rewrites a row, and
 * running it against a database that already has the CRM is a no-op.
 *
 * Storage style follows the rest of the repo: the full record as jsonb, plus
 * the columns queries actually filter or sort on (clinic_id always - the
 * tenant boundary - and the few keys the dashboards group by). All table
 * names here are literals in this file, never user input.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Q = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<any>;
  query: (text: string, params?: unknown[]) => Promise<any>;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Tables this module owns. Used by the fast path below. */
const CRM_TABLES = [
  "crm_contacts",
  "crm_followups",
  "crm_conversations",
  "crm_messages",
  "crm_templates",
  "crm_feedback",
  "crm_activities",
] as const;

/**
 * One round trip that answers "is the CRM schema already here?".
 *
 * Neon speaks HTTP, so every statement is a network round trip. Replaying
 * ~25 CREATE ... IF NOT EXISTS statements is correct but costs seconds
 * against a distant region, and the bootstrap memo resets whenever the
 * module is re-evaluated (which dev servers do constantly). Checking first
 * turns the common case - schema already present - into a single query.
 *
 * This is an optimisation only: if the check is inconclusive the full,
 * idempotent DDL below still runs.
 */
async function crmSchemaPresent(q: Q): Promise<boolean> {
  try {
    const rows = (await q.query(
      `SELECT count(*)::int AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [[...CRM_TABLES]]
    )) as { n: number }[];
    return (rows[0]?.n ?? 0) === CRM_TABLES.length;
  } catch {
    return false;
  }
}

export async function ensureCrmSchema(q: Q): Promise<void> {
  if (await crmSchemaPresent(q)) return;

  // --- contacts: leads and patients-as-contacts share one row ----------
  // `stage` is what separates a lead from a converted patient, so a
  // conversion is an UPDATE, never a second row - that is what keeps the
  // pipeline free of duplicates.
  await q`CREATE TABLE IF NOT EXISTS crm_contacts (
    id text PRIMARY KEY,
    clinic_id text NOT NULL,
    phone_norm text NOT NULL,
    stage text NOT NULL,
    source text,
    assigned_to text,
    branch_id text,
    patient_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL
  )`;
  // One person, one row, per clinic - the database-level dedupe guarantee.
  await q`CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_contacts_phone
    ON crm_contacts (clinic_id, phone_norm)`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_contacts_stage
    ON crm_contacts (clinic_id, stage)`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_contacts_assigned
    ON crm_contacts (clinic_id, assigned_to)`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_contacts_branch
    ON crm_contacts (clinic_id, branch_id)`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_contacts_created
    ON crm_contacts (clinic_id, created_at DESC)`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_contacts_patient
    ON crm_contacts (clinic_id, patient_id)`;

  // --- follow-ups -------------------------------------------------------
  // `status` stores only pending/completed/cancelled. Overdue is derived
  // from due_at at read time so it can never go stale in storage.
  await q`CREATE TABLE IF NOT EXISTS crm_followups (
    id text PRIMARY KEY,
    clinic_id text NOT NULL,
    contact_id text,
    patient_id text,
    status text NOT NULL,
    type text,
    priority text,
    assigned_to text,
    branch_id text,
    due_at timestamptz NOT NULL,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL
  )`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_followups_due
    ON crm_followups (clinic_id, status, due_at)`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_followups_assigned
    ON crm_followups (clinic_id, assigned_to, status)`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_followups_contact
    ON crm_followups (clinic_id, contact_id)`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_followups_branch
    ON crm_followups (clinic_id, branch_id, status)`;

  // --- conversations ----------------------------------------------------
  await q`CREATE TABLE IF NOT EXISTS crm_conversations (
    id text PRIMARY KEY,
    clinic_id text NOT NULL,
    contact_id text NOT NULL,
    channel text NOT NULL,
    status text NOT NULL,
    assigned_to text,
    branch_id text,
    unread_count int NOT NULL DEFAULT 0,
    last_message_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL
  )`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_conv_recent
    ON crm_conversations (clinic_id, last_message_at DESC)`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_conv_status
    ON crm_conversations (clinic_id, status, last_message_at DESC)`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_conv_contact
    ON crm_conversations (clinic_id, contact_id)`;
  // One open conversation per contact per channel keeps the inbox from
  // splintering when two inbound webhooks race.
  await q`CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_conv_open
    ON crm_conversations (clinic_id, contact_id, channel)
    WHERE status <> 'closed'`;

  // --- messages ---------------------------------------------------------
  await q`CREATE TABLE IF NOT EXISTS crm_messages (
    id text PRIMARY KEY,
    clinic_id text NOT NULL,
    conversation_id text NOT NULL,
    direction text NOT NULL,
    internal boolean NOT NULL DEFAULT false,
    state text NOT NULL,
    provider text NOT NULL DEFAULT 'mock',
    provider_message_id text,
    author_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL
  )`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_messages_conv
    ON crm_messages (clinic_id, conversation_id, created_at)`;
  // Idempotent ingestion: a provider redelivering the same webhook (they all
  // do, at least once) can never create a second message row.
  await q`CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_messages_provider_id
    ON crm_messages (clinic_id, provider, provider_message_id)
    WHERE provider_message_id IS NOT NULL`;

  // --- message templates ------------------------------------------------
  await q`CREATE TABLE IF NOT EXISTS crm_templates (
    id text PRIMARY KEY,
    clinic_id text NOT NULL,
    name text NOT NULL,
    status text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL
  )`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_templates_clinic
    ON crm_templates (clinic_id, status)`;

  // --- feedback ---------------------------------------------------------
  await q`CREATE TABLE IF NOT EXISTS crm_feedback (
    id text PRIMARY KEY,
    clinic_id text NOT NULL,
    contact_id text,
    patient_id text,
    branch_id text,
    doctor_id text,
    invite_token text,
    overall_rating int NOT NULL,
    recovery_status text NOT NULL DEFAULT 'none',
    assigned_to text,
    created_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL
  )`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_feedback_created
    ON crm_feedback (clinic_id, created_at DESC)`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_feedback_branch
    ON crm_feedback (clinic_id, branch_id)`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_feedback_recovery
    ON crm_feedback (clinic_id, recovery_status)`;
  // A feedback invite can only be answered once.
  await q`CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_feedback_token
    ON crm_feedback (clinic_id, invite_token)
    WHERE invite_token IS NOT NULL`;

  // --- timeline activity ------------------------------------------------
  await q`CREATE TABLE IF NOT EXISTS crm_activities (
    id text PRIMARY KEY,
    clinic_id text NOT NULL,
    contact_id text,
    patient_id text,
    kind text NOT NULL,
    actor_id text,
    ref_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL
  )`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_activities_contact
    ON crm_activities (clinic_id, contact_id, created_at DESC)`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_activities_patient
    ON crm_activities (clinic_id, patient_id, created_at DESC)`;
  await q`CREATE INDEX IF NOT EXISTS idx_crm_activities_recent
    ON crm_activities (clinic_id, created_at DESC)`;
}
