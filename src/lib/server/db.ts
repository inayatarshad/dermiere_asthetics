/**
 * Neon Postgres layer - the multi-tenant system of record.
 *
 * Every row is clinic-scoped: identity (clinics, users), the operational
 * collections the voice agent / booth / portal write into, the per-clinic
 * clinical records synced from the app, and AI usage counters. Every read,
 * write and delete is filtered by clinic_id - the tenant boundary lives
 * here, at the query, not in the UI.
 *
 * Storage style: one table per collection, the full record as jsonb plus
 * the few columns queries actually need (clinic_id always; a sort column
 * where we order or expire). Table names are a fixed whitelist (never user
 * input), so parameterized `sql.query()` with an interpolated table name is
 * injection-safe; all values travel as $-params.
 *
 * Driver: @neondatabase/serverless over HTTP - no pool to manage in
 * serverless functions.
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import * as devDb from "./devDb";
import { ensureCrmSchema } from "./crmSchema";

let cachedUrl: string | null | undefined;

/**
 * Vercel's database connect flow can prefix every injected env name
 * (e.g. contourdb_DATABASE_URL). Prefer the exact names, then scan for any
 * *_DATABASE_URL / *_POSTGRES_URL carrying a postgres:// value, skipping
 * unpooled variants (serverless functions want the pooler).
 */
export function pgUrl(): string | undefined {
  if (cachedUrl !== undefined) return cachedUrl ?? undefined;
  const direct = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (direct) {
    cachedUrl = direct;
    return direct;
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (!v || !/^postgres(ql)?:\/\//.test(v)) continue;
    if (
      /(^|_)(DATABASE_URL|POSTGRES_URL)$/.test(k) &&
      !/UNPOOLED|NON_POOLING/i.test(k)
    ) {
      cachedUrl = v;
      return v;
    }
  }
  cachedUrl = null;
  return undefined;
}

export function pgAvailable(): boolean {
  return !!pgUrl();
}

/**
 * Dev fallback: with no Postgres configured and not running on Vercel,
 * every pg* helper below routes to the file-backed devDb twin, so the
 * whole system works with zero infrastructure (demo-grade reliability).
 * On Vercel the filesystem is ephemeral, so this never activates there.
 */
export function devDbActive(): boolean {
  return !pgAvailable() && !process.env.VERCEL;
}

/** True when SOME durable store is available (Postgres or the dev twin). */
export function dbAvailable(): boolean {
  return pgAvailable() || devDbActive();
}

type Sql = NeonQueryFunction<false, false>;

let rawClient: Sql | null = null;
let wrapped: Sql | null = null;
let schemaReady: Promise<void> | null = null;

/** Retry transient network failures (Neon serverless HTTP can drop a
 *  connection cold). Real SQL errors are not retried. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const msg = err instanceof Error ? err.message : String(err);
      const transient =
        /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network|connect|Connection|terminated/i.test(
          msg
        );
      if (!transient) throw err;
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  throw last;
}

/**
 * A neon() client whose tagged-template calls AND .query() calls are
 * wrapped in withRetry, so every helper in this file inherits transient-
 * failure resilience without changing a single call site.
 */
function sql(): Sql {
  if (wrapped) return wrapped;
  if (!rawClient) rawClient = neon(pgUrl()!);
  const base = rawClient;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const fn = ((strings: TemplateStringsArray, ...values: unknown[]) =>
    withRetry(() => (base as any)(strings, ...values))) as any;
  fn.query = (text: string, params?: unknown[]) =>
    withRetry(() => (base as any).query(text, params));
  fn.unsafe = (raw: string) => (base as any).unsafe(raw);
  fn.transaction = (...args: unknown[]) => (base as any).transaction(...args);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  wrapped = fn as Sql;
  return wrapped;
}

/**
 * Per-clinic clinical record collections - all share the same shape
 * (id, clinic_id, payload jsonb, created_at) and are synced from the app.
 * The set is a fixed whitelist: `record()` rejects anything not here, so
 * the table name is always safe to interpolate into a query string.
 */
export const RECORD_TABLES = [
  "patients",
  "consents",
  "assets",
  "consultations",
  "visualizations",
  "plans",
  "plan_items",
  "reports",
  "invoices",
  "rewards",
] as const;
export type RecordTable = (typeof RECORD_TABLES)[number];

function record(table: string): RecordTable {
  if ((RECORD_TABLES as readonly string[]).includes(table)) {
    return table as RecordTable;
  }
  throw new Error(`Unknown record table: ${table}`);
}

/** Idempotent bootstrap; runs once per server instance. */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const q = sql();

      // --- identity -------------------------------------------------
      await q`CREATE TABLE IF NOT EXISTS clinics (
        id text PRIMARY KEY,
        name text NOT NULL,
        slug text UNIQUE,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await q`CREATE TABLE IF NOT EXISTS users (
        id text PRIMARY KEY,
        clinic_id text NOT NULL,
        email text UNIQUE NOT NULL,
        role text NOT NULL,
        password_hash text NOT NULL,
        active boolean NOT NULL DEFAULT true,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await q`CREATE INDEX IF NOT EXISTS idx_users_clinic ON users (clinic_id)`;

      // --- operational (agent / booth / portal) ---------------------
      // Tables first (no clinic_id index yet), THEN migrate legacy tables to
      // add clinic_id, THEN build the clinic_id indexes - an existing DB's
      // pre-tenancy tables won't have the column until the ALTER runs.
      await q`CREATE TABLE IF NOT EXISTS appointments (
        id text PRIMARY KEY,
        clinic_id text NOT NULL,
        start_at timestamptz NOT NULL,
        status text NOT NULL,
        payload jsonb NOT NULL
      )`;
      await q`CREATE TABLE IF NOT EXISTS vybero_calls (
        id text PRIMARY KEY,
        clinic_id text NOT NULL,
        started_at timestamptz NOT NULL,
        payload jsonb NOT NULL
      )`;
      await q`CREATE TABLE IF NOT EXISTS booth_items (
        id text PRIMARY KEY,
        clinic_id text NOT NULL,
        created_at timestamptz NOT NULL,
        payload jsonb NOT NULL
      )`;
      await q`CREATE TABLE IF NOT EXISTS portal_invites (
        id text PRIMARY KEY,
        clinic_id text NOT NULL,
        token text UNIQUE NOT NULL,
        created_at timestamptz NOT NULL,
        payload jsonb NOT NULL
      )`;
      await q`CREATE TABLE IF NOT EXISTS portal_responses (
        id text PRIMARY KEY,
        clinic_id text NOT NULL,
        invite_id text UNIQUE NOT NULL,
        created_at timestamptz NOT NULL,
        payload jsonb NOT NULL
      )`;

      // --- migrate pre-existing (pre-tenancy) tables ---------------
      // The first schema shipped these operational tables WITHOUT a
      // clinic_id. On an existing database CREATE ... IF NOT EXISTS is a
      // no-op, so add the column idempotently and assign legacy rows to the
      // demo clinic (which ensureSeedClinic creates with this exact id).
      for (const t of [
        "appointments",
        "vybero_calls",
        "booth_items",
        "portal_invites",
        "portal_responses",
      ]) {
        await q.query(
          `ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS clinic_id text NOT NULL DEFAULT 'clinic_meridian'`
        );
      }

      // clinic_id indexes (now the column is guaranteed to exist)
      await q`CREATE INDEX IF NOT EXISTS idx_appointments_clinic_start ON appointments (clinic_id, start_at)`;
      await q`CREATE INDEX IF NOT EXISTS idx_calls_clinic_started ON vybero_calls (clinic_id, started_at)`;
      await q`CREATE INDEX IF NOT EXISTS idx_booth_clinic_created ON booth_items (clinic_id, created_at)`;
      await q`CREATE INDEX IF NOT EXISTS idx_invites_clinic ON portal_invites (clinic_id, created_at)`;
      await q`CREATE INDEX IF NOT EXISTS idx_responses_clinic ON portal_responses (clinic_id, created_at)`;

      // --- reviews (public token capture -> monitoring) -------------
      await q`CREATE TABLE IF NOT EXISTS review_invites (
        id text PRIMARY KEY,
        clinic_id text NOT NULL,
        token text UNIQUE NOT NULL,
        created_at timestamptz NOT NULL,
        payload jsonb NOT NULL
      )`;
      await q`CREATE TABLE IF NOT EXISTS reviews (
        id text PRIMARY KEY,
        clinic_id text NOT NULL,
        created_at timestamptz NOT NULL,
        payload jsonb NOT NULL
      )`;
      await q`CREATE INDEX IF NOT EXISTS idx_review_invites_clinic ON review_invites (clinic_id, created_at)`;
      await q`CREATE INDEX IF NOT EXISTS idx_reviews_clinic ON reviews (clinic_id, created_at)`;

      // --- usage metering ------------------------------------------
      await q`CREATE TABLE IF NOT EXISTS usage_counters (
        clinic_id text NOT NULL,
        month text NOT NULL,
        generations int NOT NULL DEFAULT 0,
        assessments int NOT NULL DEFAULT 0,
        PRIMARY KEY (clinic_id, month)
      )`;

      // --- per-clinic clinical records (synced from app) -----------
      for (const t of RECORD_TABLES) {
        await q.query(
          `CREATE TABLE IF NOT EXISTS ${t} (
            id text PRIMARY KEY,
            clinic_id text NOT NULL,
            payload jsonb NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
          )`
        );
        await q.query(
          `CREATE INDEX IF NOT EXISTS idx_${t}_clinic ON ${t} (clinic_id)`
        );
      }

      // Same wrapped client, so the CRM tables inherit the retry behaviour.
      await ensureCrmSchema(q as unknown as Parameters<typeof ensureCrmSchema>[0]);
    })();
    // a failed bootstrap must not poison every later request
    schemaReady = schemaReady.catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

const S = () => JSON.stringify;

// =====================================================================
// Identity: clinics
// =====================================================================

export interface ClinicRow<T = unknown> {
  id: string;
  name: string;
  slug: string | null;
  payload: T;
}

export async function pgUpsertClinic(
  id: string,
  name: string,
  slug: string | null,
  payload: unknown
): Promise<void> {
  if (devDbActive()) return devDb.upsertClinic(id, name, slug, payload);
  await ensureSchema();
  await sql().query(
    `INSERT INTO clinics (id, name, slug, payload) VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, payload = EXCLUDED.payload`,
    [id, name, slug, S()(payload)]
  );
}

export async function pgGetClinic<T>(id: string): Promise<ClinicRow<T> | null> {
  if (devDbActive()) return devDb.getClinic<T>(id);
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT id, name, slug, payload FROM clinics WHERE id = $1 LIMIT 1`,
    [id]
  )) as ClinicRow<T>[];
  return rows[0] ?? null;
}

export async function pgGetClinicBySlug<T>(
  slug: string
): Promise<ClinicRow<T> | null> {
  if (devDbActive()) return devDb.getClinicBySlug<T>(slug);
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT id, name, slug, payload FROM clinics WHERE slug = $1 LIMIT 1`,
    [slug]
  )) as ClinicRow<T>[];
  return rows[0] ?? null;
}

export async function pgListClinics<T>(): Promise<ClinicRow<T>[]> {
  if (devDbActive()) return devDb.listClinics<T>();
  await ensureSchema();
  return (await sql().query(
    `SELECT id, name, slug, payload FROM clinics ORDER BY created_at ASC`
  )) as ClinicRow<T>[];
}

export async function pgCountClinics(): Promise<number> {
  if (devDbActive()) return devDb.countClinics();
  await ensureSchema();
  const rows = (await sql().query(`SELECT count(*)::int AS n FROM clinics`)) as {
    n: number;
  }[];
  return rows[0]?.n ?? 0;
}

// =====================================================================
// Identity: users
// =====================================================================

export interface UserRow<T = unknown> {
  id: string;
  clinic_id: string;
  email: string;
  role: string;
  password_hash: string;
  active: boolean;
  payload: T;
}

export async function pgUpsertUser(
  id: string,
  clinicId: string,
  email: string,
  role: string,
  passwordHash: string,
  active: boolean,
  payload: unknown
): Promise<void> {
  if (devDbActive())
    return devDb.upsertUser(id, clinicId, email, role, passwordHash, active, payload);
  await ensureSchema();
  await sql().query(
    `INSERT INTO users (id, clinic_id, email, role, password_hash, active, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = EXCLUDED.role,
       password_hash = EXCLUDED.password_hash, active = EXCLUDED.active, payload = EXCLUDED.payload`,
    [id, clinicId, email.toLowerCase(), role, passwordHash, active, S()(payload)]
  );
}

export async function pgGetUserByEmail<T>(
  email: string
): Promise<UserRow<T> | null> {
  if (devDbActive()) return devDb.getUserByEmail<T>(email);
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT id, clinic_id, email, role, password_hash, active, payload
     FROM users WHERE email = $1 LIMIT 1`,
    [email.toLowerCase()]
  )) as UserRow<T>[];
  return rows[0] ?? null;
}

export async function pgListUsers<T>(clinicId: string): Promise<UserRow<T>[]> {
  if (devDbActive()) return devDb.listUsers<T>(clinicId);
  await ensureSchema();
  return (await sql().query(
    `SELECT id, clinic_id, email, role, password_hash, active, payload
     FROM users WHERE clinic_id = $1 ORDER BY created_at ASC`,
    [clinicId]
  )) as UserRow<T>[];
}

export async function pgSetUserActive(
  clinicId: string,
  id: string,
  active: boolean
): Promise<void> {
  if (devDbActive()) return devDb.setUserActive(clinicId, id, active);
  await ensureSchema();
  await sql().query(
    `UPDATE users SET active = $3 WHERE clinic_id = $1 AND id = $2`,
    [clinicId, id, active]
  );
}

export async function pgDeleteUser(clinicId: string, id: string): Promise<void> {
  if (devDbActive()) return devDb.deleteUser(clinicId, id);
  await ensureSchema();
  await sql().query(`DELETE FROM users WHERE clinic_id = $1 AND id = $2`, [clinicId, id]);
}

// =====================================================================
// Generic clinic-scoped record collections
// =====================================================================

export async function pgListRecords<T>(
  clinicId: string,
  table: string
): Promise<T[]> {
  if (devDbActive()) return devDb.listRecords<T>(clinicId, record(table));
  await ensureSchema();
  const t = record(table);
  const rows = (await sql().query(
    `SELECT payload FROM ${t} WHERE clinic_id = $1 ORDER BY created_at ASC`,
    [clinicId]
  )) as { payload: T }[];
  return rows.map((r) => r.payload);
}

export async function pgUpsertRecord(
  clinicId: string,
  table: string,
  id: string,
  payload: unknown
): Promise<void> {
  if (devDbActive()) return devDb.upsertRecord(clinicId, record(table), id, payload);
  await ensureSchema();
  const t = record(table);
  await sql().query(
    `INSERT INTO ${t} (id, clinic_id, payload) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload
     WHERE ${t}.clinic_id = $2`,
    [id, clinicId, S()(payload)]
  );
}

export async function pgDeleteRecord(
  clinicId: string,
  table: string,
  id: string
): Promise<void> {
  if (devDbActive()) return devDb.deleteRecord(clinicId, record(table), id);
  await ensureSchema();
  const t = record(table);
  await sql().query(`DELETE FROM ${t} WHERE clinic_id = $1 AND id = $2`, [
    clinicId,
    id,
  ]);
}

/** Replace a whole collection for a clinic (used by full-state sync). */
export async function pgReplaceRecords(
  clinicId: string,
  table: string,
  items: { id: string; payload: unknown }[]
): Promise<void> {
  if (devDbActive()) return devDb.replaceRecords(clinicId, record(table), items);
  await ensureSchema();
  const t = record(table);
  const q = sql();
  await q.query(`DELETE FROM ${t} WHERE clinic_id = $1`, [clinicId]);
  for (const it of items) {
    await q.query(
      `INSERT INTO ${t} (id, clinic_id, payload) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload`,
      [it.id, clinicId, S()(it.payload)]
    );
  }
}

// =====================================================================
// Operational: appointments
// =====================================================================

export async function pgUpsertAppointment(
  clinicId: string,
  id: string,
  startAt: string,
  status: string,
  payload: unknown
): Promise<void> {
  if (devDbActive()) return devDb.upsertAppointment(clinicId, id, startAt, status, payload);
  await ensureSchema();
  await sql().query(
    `INSERT INTO appointments (id, clinic_id, start_at, status, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (id) DO UPDATE SET start_at = EXCLUDED.start_at,
       status = EXCLUDED.status, payload = EXCLUDED.payload
     WHERE appointments.clinic_id = $2`,
    [id, clinicId, startAt, status, S()(payload)]
  );
}

/** Remove one appointment. Clinic-scoped, like every other write here. */
export async function pgDeleteAppointment(
  clinicId: string,
  id: string
): Promise<void> {
  if (devDbActive()) return devDb.deleteAppointment(clinicId, id);
  await ensureSchema();
  await sql().query(
    `DELETE FROM appointments WHERE clinic_id = $1 AND id = $2`,
    [clinicId, id]
  );
}

export async function pgListAppointments<T>(clinicId: string): Promise<T[]> {
  if (devDbActive()) return devDb.listAppointments<T>(clinicId);
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT payload FROM appointments WHERE clinic_id = $1 ORDER BY start_at ASC`,
    [clinicId]
  )) as { payload: T }[];
  return rows.map((r) => r.payload);
}

// =====================================================================
// Operational: vybero calls
// =====================================================================

export async function pgUpsertCall(
  clinicId: string,
  id: string,
  startedAt: string,
  payload: unknown
): Promise<void> {
  if (devDbActive()) return devDb.upsertCall(clinicId, id, startedAt, payload);
  await ensureSchema();
  await sql().query(
    `INSERT INTO vybero_calls (id, clinic_id, started_at, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (id) DO UPDATE SET started_at = EXCLUDED.started_at, payload = EXCLUDED.payload
     WHERE vybero_calls.clinic_id = $2`,
    [id, clinicId, startedAt, S()(payload)]
  );
}

export async function pgListCalls<T>(
  clinicId: string,
  limit = 500
): Promise<T[]> {
  if (devDbActive()) return devDb.listCalls<T>(clinicId, limit);
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT payload FROM vybero_calls WHERE clinic_id = $1 ORDER BY started_at DESC LIMIT $2`,
    [clinicId, limit]
  )) as { payload: T }[];
  return rows.map((r) => r.payload);
}

// =====================================================================
// Operational: booth items
// =====================================================================

export async function pgUpsertBoothItem(
  clinicId: string,
  id: string,
  createdAt: string,
  payload: unknown
): Promise<void> {
  if (devDbActive()) return devDb.upsertBoothItem(clinicId, id, createdAt, payload);
  await ensureSchema();
  await sql().query(
    `INSERT INTO booth_items (id, clinic_id, created_at, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (id) DO UPDATE SET created_at = EXCLUDED.created_at, payload = EXCLUDED.payload
     WHERE booth_items.clinic_id = $2`,
    [id, clinicId, createdAt, S()(payload)]
  );
}

/** Lists fresh items for a clinic and prunes that clinic's expired ones. */
export async function pgListBoothItems<T>(
  clinicId: string,
  expiryMs: number
): Promise<T[]> {
  if (devDbActive()) return devDb.listBoothItems<T>(clinicId, expiryMs);
  await ensureSchema();
  const cutoff = new Date(Date.now() - expiryMs).toISOString();
  await sql().query(
    `DELETE FROM booth_items WHERE clinic_id = $1 AND created_at < $2`,
    [clinicId, cutoff]
  );
  const rows = (await sql().query(
    `SELECT payload FROM booth_items WHERE clinic_id = $1 ORDER BY created_at ASC`,
    [clinicId]
  )) as { payload: T }[];
  return rows.map((r) => r.payload);
}

export async function pgDeleteBoothItem(
  clinicId: string,
  id: string
): Promise<void> {
  if (devDbActive()) return devDb.deleteBoothItem(clinicId, id);
  await ensureSchema();
  await sql().query(
    `DELETE FROM booth_items WHERE clinic_id = $1 AND id = $2`,
    [clinicId, id]
  );
}

// =====================================================================
// Operational: portal invites + responses
// =====================================================================

export async function pgUpsertInvite(
  clinicId: string,
  id: string,
  token: string,
  createdAt: string,
  payload: unknown
): Promise<void> {
  if (devDbActive()) return devDb.upsertInvite(clinicId, id, token, createdAt, payload);
  await ensureSchema();
  await sql().query(
    `INSERT INTO portal_invites (id, clinic_id, token, created_at, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload
     WHERE portal_invites.clinic_id = $2`,
    [id, clinicId, token, createdAt, S()(payload)]
  );
}

export async function pgListInvites<T>(clinicId: string): Promise<T[]> {
  if (devDbActive()) return devDb.listInvites<T>(clinicId);
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT payload FROM portal_invites WHERE clinic_id = $1 ORDER BY created_at DESC`,
    [clinicId]
  )) as { payload: T }[];
  return rows.map((r) => r.payload);
}

/**
 * Public token lookup (patient opens their link). The token is the
 * capability; we return the payload plus the owning clinic_id so the
 * caller can scope the matching response write.
 */
export async function pgGetInviteByToken<T>(
  token: string
): Promise<{ clinic_id: string; payload: T } | null> {
  if (devDbActive()) return devDb.getInviteByToken<T>(token);
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT clinic_id, payload FROM portal_invites WHERE token = $1 LIMIT 1`,
    [token]
  )) as { clinic_id: string; payload: T }[];
  return rows[0] ?? null;
}

export async function pgUpsertResponse(
  clinicId: string,
  id: string,
  inviteId: string,
  createdAt: string,
  payload: unknown
): Promise<void> {
  if (devDbActive()) return devDb.upsertResponse(clinicId, id, inviteId, createdAt, payload);
  await ensureSchema();
  await sql().query(
    `INSERT INTO portal_responses (id, clinic_id, invite_id, created_at, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (invite_id) DO UPDATE SET payload = EXCLUDED.payload`,
    [id, clinicId, inviteId, createdAt, S()(payload)]
  );
}

export async function pgListResponses<T>(clinicId: string): Promise<T[]> {
  if (devDbActive()) return devDb.listResponses<T>(clinicId);
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT payload FROM portal_responses WHERE clinic_id = $1 ORDER BY created_at DESC`,
    [clinicId]
  )) as { payload: T }[];
  return rows.map((r) => r.payload);
}

// =====================================================================
// Reviews: invite tokens + submitted reviews (same pattern as portal)
// =====================================================================

export async function pgUpsertReviewInvite(
  clinicId: string,
  id: string,
  token: string,
  createdAt: string,
  payload: unknown
): Promise<void> {
  if (devDbActive()) return devDb.upsertReviewInvite(clinicId, id, token, createdAt, payload);
  await ensureSchema();
  await sql().query(
    `INSERT INTO review_invites (id, clinic_id, token, created_at, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload
     WHERE review_invites.clinic_id = $2`,
    [id, clinicId, token, createdAt, S()(payload)]
  );
}

export async function pgListReviewInvites<T>(clinicId: string): Promise<T[]> {
  if (devDbActive()) return devDb.listReviewInvites<T>(clinicId);
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT payload FROM review_invites WHERE clinic_id = $1 ORDER BY created_at DESC`,
    [clinicId]
  )) as { payload: T }[];
  return rows.map((r) => r.payload);
}

/** Public token lookup (client opens their review link). */
export async function pgGetReviewInviteByToken<T>(
  token: string
): Promise<{ clinic_id: string; payload: T } | null> {
  if (devDbActive()) return devDb.getReviewInviteByToken<T>(token);
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT clinic_id, payload FROM review_invites WHERE token = $1 LIMIT 1`,
    [token]
  )) as { clinic_id: string; payload: T }[];
  return rows[0] ?? null;
}

export async function pgUpsertReview(
  clinicId: string,
  id: string,
  createdAt: string,
  payload: unknown
): Promise<void> {
  if (devDbActive()) return devDb.upsertReview(clinicId, id, createdAt, payload);
  await ensureSchema();
  await sql().query(
    `INSERT INTO reviews (id, clinic_id, created_at, payload)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload
     WHERE reviews.clinic_id = $2`,
    [id, clinicId, createdAt, S()(payload)]
  );
}

export async function pgListReviews<T>(clinicId: string): Promise<T[]> {
  if (devDbActive()) return devDb.listReviews<T>(clinicId);
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT payload FROM reviews WHERE clinic_id = $1 ORDER BY created_at DESC`,
    [clinicId]
  )) as { payload: T }[];
  return rows.map((r) => r.payload);
}

// =====================================================================
// Usage metering
// =====================================================================

export interface UsageRow {
  generations: number;
  assessments: number;
}

export async function pgGetUsage(
  clinicId: string,
  month: string
): Promise<UsageRow> {
  if (devDbActive()) return devDb.getUsage(clinicId, month);
  await ensureSchema();
  const rows = (await sql().query(
    `SELECT generations, assessments FROM usage_counters WHERE clinic_id = $1 AND month = $2 LIMIT 1`,
    [clinicId, month]
  )) as UsageRow[];
  return rows[0] ?? { generations: 0, assessments: 0 };
}

export async function pgIncrUsage(
  clinicId: string,
  month: string,
  kind: "generations" | "assessments"
): Promise<UsageRow> {
  if (devDbActive()) return devDb.incrUsage(clinicId, month, kind);
  await ensureSchema();
  const col = kind === "generations" ? "generations" : "assessments";
  const rows = (await sql().query(
    `INSERT INTO usage_counters (clinic_id, month, ${col})
     VALUES ($1, $2, 1)
     ON CONFLICT (clinic_id, month) DO UPDATE SET ${col} = usage_counters.${col} + 1
     RETURNING generations, assessments`,
    [clinicId, month]
  )) as UsageRow[];
  return rows[0] ?? { generations: 0, assessments: 0 };
}

/** All clinics' usage for a month (admin/platform view). */
export async function pgListUsage(
  month: string
): Promise<(UsageRow & { clinic_id: string })[]> {
  if (devDbActive()) return [];
  await ensureSchema();
  return (await sql().query(
    `SELECT clinic_id, generations, assessments FROM usage_counters WHERE month = $1`,
    [month]
  )) as (UsageRow & { clinic_id: string })[];
}
