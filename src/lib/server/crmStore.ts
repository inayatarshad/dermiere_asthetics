/**
 * CRM storage - every read and write is scoped by clinic_id.
 *
 * The tenant boundary lives here, at the query, exactly as it does in db.ts:
 * callers pass the clinic id they got from the verified session, never from
 * the request body. A row belonging to another clinic is invisible, and an
 * update that names it silently affects nothing.
 *
 * Table names are a fixed whitelist (CRM_TABLES) so interpolating one into a
 * query string is injection-safe; all values travel as $-params.
 *
 * Both backends behave identically: Postgres keeps hot columns beside the
 * jsonb payload for its indexes, the dev twin keeps only the payload, and the
 * refinement filtering below runs in TypeScript for both.
 */

import { neon } from "@neondatabase/serverless";
import { devDbActive, ensureSchema, pgUrl } from "./db";
import * as devDb from "./devDb";
import type {
  ContactStage,
  CrmActivity,
  CrmContact,
  CrmConversation,
  CrmFeedback,
  CrmFollowUp,
  CrmMessage,
  MessageTemplate,
} from "@/lib/crm/types";
import { normalizePhone } from "@/lib/crm/phone";
import { cancelCrmBooking, ensureConsultationBooked } from "./crmBooking";

export const CRM_TABLES = [
  "crm_contacts",
  "crm_followups",
  "crm_conversations",
  "crm_messages",
  "crm_templates",
  "crm_feedback",
  "crm_activities",
] as const;
export type CrmTable = (typeof CRM_TABLES)[number];

function table(t: string): CrmTable {
  if ((CRM_TABLES as readonly string[]).includes(t)) return t as CrmTable;
  throw new Error(`Unknown CRM table: ${t}`);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let client: any = null;
function sql(): any {
  if (!client) client = neon(pgUrl()!);
  return client;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const J = (v: unknown) => JSON.stringify(v);
const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

// ---------------------------------------------------------------------
// Generic row access
// ---------------------------------------------------------------------

/**
 * Every CRM row for a clinic. The dashboards work over hundreds of rows per
 * clinic, so pulling a collection and refining in TypeScript keeps one
 * filtering implementation for both backends; the clinic_id predicate - the
 * one that matters for isolation and for index selectivity - stays in SQL.
 */
async function listAll<T>(clinicId: string, name: CrmTable): Promise<T[]> {
  // Re-checked at runtime, not just in the type system: this is the value
  // being interpolated into a query string.
  const t = table(name);
  if (devDbActive()) return devDb.crmList<T>(clinicId, t);
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT payload FROM ${t} WHERE clinic_id = $1 ORDER BY created_at ASC`,
    [clinicId]
  )) as { payload: T }[];
  return rows.map((r) => r.payload);
}

async function getOne<T>(
  clinicId: string,
  name: CrmTable,
  id: string
): Promise<T | null> {
  const t = table(name);
  if (devDbActive()) return devDb.crmGet<T>(clinicId, t, id);
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT payload FROM ${t} WHERE clinic_id = $1 AND id = $2 LIMIT 1`,
    [clinicId, id]
  )) as { payload: T }[];
  return rows[0]?.payload ?? null;
}

async function remove(clinicId: string, name: CrmTable, id: string): Promise<void> {
  const t = table(name);
  if (devDbActive()) return devDb.crmDelete(clinicId, t, id);
  await ensureSchema();
  await sql().query(`DELETE FROM ${t} WHERE clinic_id = $1 AND id = $2`, [
    clinicId,
    id,
  ]);
}

// ---------------------------------------------------------------------
// Contacts (leads + converted patients)
// ---------------------------------------------------------------------

export async function listContacts(clinicId: string): Promise<CrmContact[]> {
  const rows = await listAll<CrmContact>(clinicId, "crm_contacts");
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getContact(
  clinicId: string,
  id: string
): Promise<CrmContact | null> {
  return getOne<CrmContact>(clinicId, "crm_contacts", id);
}

/** Duplicate detection: the normalized phone is the identity of a contact. */
export async function findContactByPhone(
  clinicId: string,
  phone: string
): Promise<CrmContact | null> {
  const norm = normalizePhone(phone);
  if (!norm) return null;
  if (devDbActive()) {
    return (
      devDb
        .crmList<CrmContact>(clinicId, "crm_contacts")
        .find((c) => c.phone_norm === norm) ?? null
    );
  }
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT payload FROM crm_contacts WHERE clinic_id = $1 AND phone_norm = $2 LIMIT 1`,
    [clinicId, norm]
  )) as { payload: CrmContact }[];
  return rows[0]?.payload ?? null;
}

export async function saveContact(contact: CrmContact): Promise<CrmContact> {
  const row: CrmContact = {
    ...contact,
    phone_norm: normalizePhone(contact.phone) || contact.id,
    updated_at: nowIso(),
  };
  if (devDbActive()) {
    devDb.crmUpsert(row.clinic_id, "crm_contacts", row.id, row);
    return row;
  }
  await ensureSchema();
  await sql().query(
    `INSERT INTO crm_contacts
       (id, clinic_id, phone_norm, stage, source, assigned_to, branch_id,
        patient_id, created_at, updated_at, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       phone_norm = EXCLUDED.phone_norm,
       stage = EXCLUDED.stage,
       source = EXCLUDED.source,
       assigned_to = EXCLUDED.assigned_to,
       branch_id = EXCLUDED.branch_id,
       patient_id = EXCLUDED.patient_id,
       updated_at = EXCLUDED.updated_at,
       payload = EXCLUDED.payload
     WHERE crm_contacts.clinic_id = $2`,
    [
      row.id,
      row.clinic_id,
      row.phone_norm,
      row.stage,
      row.source,
      row.assigned_to ?? null,
      row.branch_id ?? null,
      row.patient_id ?? null,
      row.created_at,
      row.updated_at,
      J(row),
    ]
  );
  return row;
}

export async function deleteContact(clinicId: string, id: string): Promise<void> {
  await remove(clinicId, "crm_contacts", id);
}

/**
 * Delete one row from a named CRM table. Used by seed reconciliation; the
 * table name still goes through the whitelist, and the delete is still
 * clinic-scoped.
 */
export async function deleteCrmRow(
  clinicId: string,
  tableName: CrmTable,
  id: string
): Promise<void> {
  await remove(clinicId, tableName, id);
}

// ---------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------

export async function listFollowUps(clinicId: string): Promise<CrmFollowUp[]> {
  const rows = await listAll<CrmFollowUp>(clinicId, "crm_followups");
  return rows.sort((a, b) => a.due_at.localeCompare(b.due_at));
}

export async function getFollowUp(
  clinicId: string,
  id: string
): Promise<CrmFollowUp | null> {
  return getOne<CrmFollowUp>(clinicId, "crm_followups", id);
}

export async function saveFollowUp(f: CrmFollowUp): Promise<CrmFollowUp> {
  const row: CrmFollowUp = { ...f, updated_at: nowIso() };
  if (devDbActive()) {
    devDb.crmUpsert(row.clinic_id, "crm_followups", row.id, row);
    return row;
  }
  await ensureSchema();
  await sql().query(
    `INSERT INTO crm_followups
       (id, clinic_id, contact_id, patient_id, status, type, priority,
        assigned_to, branch_id, due_at, completed_at, created_at, updated_at, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       contact_id = EXCLUDED.contact_id,
       patient_id = EXCLUDED.patient_id,
       status = EXCLUDED.status,
       type = EXCLUDED.type,
       priority = EXCLUDED.priority,
       assigned_to = EXCLUDED.assigned_to,
       branch_id = EXCLUDED.branch_id,
       due_at = EXCLUDED.due_at,
       completed_at = EXCLUDED.completed_at,
       updated_at = EXCLUDED.updated_at,
       payload = EXCLUDED.payload
     WHERE crm_followups.clinic_id = $2`,
    [
      row.id,
      row.clinic_id,
      row.contact_id ?? null,
      row.patient_id ?? null,
      row.status,
      row.type,
      row.priority,
      row.assigned_to ?? null,
      row.branch_id ?? null,
      row.due_at,
      row.completed_at ?? null,
      row.created_at,
      row.updated_at,
      J(row),
    ]
  );
  return row;
}

export async function deleteFollowUp(
  clinicId: string,
  id: string
): Promise<void> {
  await remove(clinicId, "crm_followups", id);
}

// ---------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------

export async function listConversations(
  clinicId: string
): Promise<CrmConversation[]> {
  const rows = await listAll<CrmConversation>(clinicId, "crm_conversations");
  return rows.sort((a, b) => b.last_message_at.localeCompare(a.last_message_at));
}

export async function getConversation(
  clinicId: string,
  id: string
): Promise<CrmConversation | null> {
  return getOne<CrmConversation>(clinicId, "crm_conversations", id);
}

/** The open conversation for a contact on a channel, if one exists. */
export async function findOpenConversation(
  clinicId: string,
  contactId: string,
  channel: string
): Promise<CrmConversation | null> {
  const all = await listAll<CrmConversation>(clinicId, "crm_conversations");
  return (
    all.find(
      (c) =>
        c.contact_id === contactId &&
        c.channel === channel &&
        c.status !== "closed"
    ) ?? null
  );
}

export async function saveConversation(
  c: CrmConversation
): Promise<CrmConversation> {
  const row: CrmConversation = { ...c, updated_at: nowIso() };
  if (devDbActive()) {
    devDb.crmUpsert(row.clinic_id, "crm_conversations", row.id, row);
    return row;
  }
  await ensureSchema();
  await sql().query(
    `INSERT INTO crm_conversations
       (id, clinic_id, contact_id, channel, status, assigned_to, branch_id,
        unread_count, last_message_at, created_at, updated_at, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       assigned_to = EXCLUDED.assigned_to,
       branch_id = EXCLUDED.branch_id,
       unread_count = EXCLUDED.unread_count,
       last_message_at = EXCLUDED.last_message_at,
       updated_at = EXCLUDED.updated_at,
       payload = EXCLUDED.payload
     WHERE crm_conversations.clinic_id = $2`,
    [
      row.id,
      row.clinic_id,
      row.contact_id,
      row.channel,
      row.status,
      row.assigned_to ?? null,
      row.branch_id ?? null,
      row.unread_count,
      row.last_message_at,
      row.created_at,
      row.updated_at,
      J(row),
    ]
  );
  return row;
}

// ---------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------

export async function listMessages(
  clinicId: string,
  conversationId: string
): Promise<CrmMessage[]> {
  if (devDbActive()) {
    return devDb
      .crmList<CrmMessage>(clinicId, "crm_messages")
      .filter((m) => m.conversation_id === conversationId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT payload FROM crm_messages
     WHERE clinic_id = $1 AND conversation_id = $2 ORDER BY created_at ASC`,
    [clinicId, conversationId]
  )) as { payload: CrmMessage }[];
  return rows.map((r) => r.payload);
}

export async function listAllMessages(clinicId: string): Promise<CrmMessage[]> {
  return listAll<CrmMessage>(clinicId, "crm_messages");
}

/** Look a message up by the provider's id - the idempotency check. */
export async function findMessageByProviderId(
  clinicId: string,
  provider: string,
  providerMessageId: string
): Promise<CrmMessage | null> {
  if (devDbActive()) {
    return (
      devDb
        .crmList<CrmMessage>(clinicId, "crm_messages")
        .find(
          (m) =>
            m.provider === provider &&
            m.provider_message_id === providerMessageId
        ) ?? null
    );
  }
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT payload FROM crm_messages
     WHERE clinic_id = $1 AND provider = $2 AND provider_message_id = $3 LIMIT 1`,
    [clinicId, provider, providerMessageId]
  )) as { payload: CrmMessage }[];
  return rows[0]?.payload ?? null;
}

export async function saveMessage(m: CrmMessage): Promise<CrmMessage> {
  if (devDbActive()) {
    devDb.crmUpsert(m.clinic_id, "crm_messages", m.id, m);
    return m;
  }
  await ensureSchema();
  await sql().query(
    `INSERT INTO crm_messages
       (id, clinic_id, conversation_id, direction, internal, state, provider,
        provider_message_id, author_id, created_at, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       state = EXCLUDED.state,
       provider_message_id = EXCLUDED.provider_message_id,
       payload = EXCLUDED.payload
     WHERE crm_messages.clinic_id = $2`,
    [
      m.id,
      m.clinic_id,
      m.conversation_id,
      m.direction,
      m.internal,
      m.state,
      m.provider,
      m.provider_message_id ?? null,
      m.author_id ?? null,
      m.created_at,
      J(m),
    ]
  );
  return m;
}

// ---------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------

export async function listTemplates(
  clinicId: string
): Promise<MessageTemplate[]> {
  return listAll<MessageTemplate>(clinicId, "crm_templates");
}

export async function saveTemplate(
  t: MessageTemplate
): Promise<MessageTemplate> {
  if (devDbActive()) {
    devDb.crmUpsert(t.clinic_id, "crm_templates", t.id, t);
    return t;
  }
  await ensureSchema();
  await sql().query(
    `INSERT INTO crm_templates (id, clinic_id, name, status, created_at, payload)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, status = EXCLUDED.status, payload = EXCLUDED.payload
     WHERE crm_templates.clinic_id = $2`,
    [t.id, t.clinic_id, t.name, t.status, t.created_at, J(t)]
  );
  return t;
}

// ---------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------

export async function listFeedback(clinicId: string): Promise<CrmFeedback[]> {
  const rows = await listAll<CrmFeedback>(clinicId, "crm_feedback");
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getFeedback(
  clinicId: string,
  id: string
): Promise<CrmFeedback | null> {
  return getOne<CrmFeedback>(clinicId, "crm_feedback", id);
}

export async function saveFeedback(f: CrmFeedback): Promise<CrmFeedback> {
  if (devDbActive()) {
    devDb.crmUpsert(f.clinic_id, "crm_feedback", f.id, f);
    return f;
  }
  await ensureSchema();
  await sql().query(
    `INSERT INTO crm_feedback
       (id, clinic_id, contact_id, patient_id, branch_id, doctor_id,
        invite_token, overall_rating, recovery_status, assigned_to, created_at, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       recovery_status = EXCLUDED.recovery_status,
       assigned_to = EXCLUDED.assigned_to,
       payload = EXCLUDED.payload
     WHERE crm_feedback.clinic_id = $2`,
    [
      f.id,
      f.clinic_id,
      f.contact_id ?? null,
      f.patient_id ?? null,
      f.branch_id ?? null,
      f.doctor_id ?? null,
      f.invite_token ?? null,
      f.overall_rating,
      f.recovery_status,
      f.assigned_to ?? null,
      f.created_at,
      J(f),
    ]
  );
  return f;
}

// ---------------------------------------------------------------------
// Activities (timeline)
// ---------------------------------------------------------------------

export async function listActivities(
  clinicId: string
): Promise<CrmActivity[]> {
  const rows = await listAll<CrmActivity>(clinicId, "crm_activities");
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function listActivitiesFor(
  clinicId: string,
  opts: { contactId?: string; patientId?: string }
): Promise<CrmActivity[]> {
  const all = await listActivities(clinicId);
  return all.filter(
    (a) =>
      (opts.contactId && a.contact_id === opts.contactId) ||
      (opts.patientId && a.patient_id === opts.patientId)
  );
}

export async function addActivity(
  a: Omit<CrmActivity, "id" | "created_at"> & Partial<Pick<CrmActivity, "id" | "created_at">>
): Promise<CrmActivity> {
  const row: CrmActivity = {
    ...a,
    id: a.id ?? newId(),
    created_at: a.created_at ?? nowIso(),
  } as CrmActivity;
  if (devDbActive()) {
    devDb.crmUpsert(row.clinic_id, "crm_activities", row.id, row);
    return row;
  }
  await ensureSchema();
  await sql().query(
    `INSERT INTO crm_activities
       (id, clinic_id, contact_id, patient_id, kind, actor_id, ref_id, created_at, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [
      row.id,
      row.clinic_id,
      row.contact_id ?? null,
      row.patient_id ?? null,
      row.kind,
      row.actor_id ?? null,
      row.ref_id ?? null,
      row.created_at,
      J(row),
    ]
  );
  return row;
}

// ---------------------------------------------------------------------
// Stage transition helper - the one place a stage change is recorded
// ---------------------------------------------------------------------

export async function moveContactStage(
  clinicId: string,
  contactId: string,
  stage: ContactStage,
  actorId: string | undefined,
  extra?: { lost_reason?: CrmContact["lost_reason"]; lost_note?: string }
): Promise<CrmContact | null> {
  const contact = await getContact(clinicId, contactId);
  if (!contact) return null;
  if (contact.stage === stage && !extra) return contact;
  const from = contact.stage;
  const updated = await saveContact({
    ...contact,
    stage,
    lost_reason: stage === "lost" ? extra?.lost_reason : undefined,
    lost_note: stage === "lost" ? extra?.lost_note : undefined,
  });
  await addActivity({
    clinic_id: clinicId,
    contact_id: contactId,
    patient_id: contact.patient_id,
    kind: stage === "won" ? "converted" : "stage_change",
    summary: `Stage moved to ${stage.replace(/_/g, " ")}`,
    detail: `From ${from.replace(/_/g, " ")}`,
    actor_id: actorId,
    branch_id: contact.branch_id,
    ref_id: contactId,
  });

  // A booking is only real once it is on the calendar. Booking-related
  // stages put it there; giving up releases the slot again.
  try {
    if (stage === "consult_booked") {
      await ensureConsultationBooked(clinicId, updated, { actorId });
    } else if (stage === "lost" || stage === "archived") {
      await cancelCrmBooking(clinicId, contactId);
    }
  } catch (err) {
    // The stage change is the user's action and must stand; a calendar
    // failure is logged rather than rolled back into their face.
    console.error("[crm] calendar sync failed", err);
  }

  return updated;
}
