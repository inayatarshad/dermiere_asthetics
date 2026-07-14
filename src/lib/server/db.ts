/**
 * Neon Postgres layer — Phase 1 of SCALABILITY_ROADMAP.md, provisioned
 * 2026-07-14. Every shared JSON collection that used to live on Vercel
 * Blob (and hit its operation quota, then its suspension) now lives in
 * proper rows with per-row atomicity, which also retires the single-blob
 * read-modify-write races for good.
 *
 * Storage style: one table per collection, full record as jsonb plus the
 * few columns queries need. Store modules keep their public APIs; they
 * just prefer this driver when DATABASE_URL/POSTGRES_URL is present
 * (Blob, then dev files, remain as fallbacks).
 *
 * Driver: @neondatabase/serverless over HTTP — no TCP pool management in
 * serverless functions, parameterized by template tag.
 */

import { neon } from "@neondatabase/serverless";

export function pgUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL;
}

export function pgAvailable(): boolean {
  return !!pgUrl();
}

type Sql = ReturnType<typeof neon>;

let client: Sql | null = null;
let schemaReady: Promise<void> | null = null;

function sql(): Sql {
  if (!client) client = neon(pgUrl()!);
  return client;
}

/** Idempotent bootstrap; runs once per server instance. */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const q = sql();
      await q`CREATE TABLE IF NOT EXISTS appointments (
        id text PRIMARY KEY,
        start_at timestamptz NOT NULL,
        status text NOT NULL,
        payload jsonb NOT NULL
      )`;
      await q`CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments (start_at)`;
      await q`CREATE TABLE IF NOT EXISTS vybero_calls (
        id text PRIMARY KEY,
        started_at timestamptz NOT NULL,
        payload jsonb NOT NULL
      )`;
      await q`CREATE INDEX IF NOT EXISTS idx_calls_started ON vybero_calls (started_at)`;
      await q`CREATE TABLE IF NOT EXISTS booth_items (
        id text PRIMARY KEY,
        created_at timestamptz NOT NULL,
        payload jsonb NOT NULL
      )`;
      await q`CREATE TABLE IF NOT EXISTS portal_invites (
        id text PRIMARY KEY,
        token text UNIQUE NOT NULL,
        created_at timestamptz NOT NULL,
        payload jsonb NOT NULL
      )`;
      await q`CREATE TABLE IF NOT EXISTS portal_responses (
        id text PRIMARY KEY,
        invite_id text UNIQUE NOT NULL,
        created_at timestamptz NOT NULL,
        payload jsonb NOT NULL
      )`;
    })();
    // a failed bootstrap must not poison every later request
    schemaReady = schemaReady.catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

// ---------------------------------------------------------------------
// Collection helpers (payload-in, payload-out; stores own their types)
// ---------------------------------------------------------------------

export async function pgUpsertAppointment(
  id: string,
  startAt: string,
  status: string,
  payload: unknown
): Promise<void> {
  await ensureSchema();
  await sql()`INSERT INTO appointments (id, start_at, status, payload)
    VALUES (${id}, ${startAt}, ${status}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT (id) DO UPDATE
    SET start_at = EXCLUDED.start_at, status = EXCLUDED.status, payload = EXCLUDED.payload`;
}

export async function pgListAppointments<T>(): Promise<T[]> {
  await ensureSchema();
  const rows = (await sql()`SELECT payload FROM appointments ORDER BY start_at ASC`) as {
    payload: T;
  }[];
  return rows.map((r) => r.payload);
}

export async function pgUpsertCall(
  id: string,
  startedAt: string,
  payload: unknown
): Promise<void> {
  await ensureSchema();
  await sql()`INSERT INTO vybero_calls (id, started_at, payload)
    VALUES (${id}, ${startedAt}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT (id) DO UPDATE
    SET started_at = EXCLUDED.started_at, payload = EXCLUDED.payload`;
}

export async function pgListCalls<T>(limit = 500): Promise<T[]> {
  await ensureSchema();
  const rows = (await sql()`SELECT payload FROM vybero_calls
    ORDER BY started_at DESC LIMIT ${limit}`) as { payload: T }[];
  return rows.map((r) => r.payload);
}

export async function pgUpsertBoothItem(
  id: string,
  createdAt: string,
  payload: unknown
): Promise<void> {
  await ensureSchema();
  await sql()`INSERT INTO booth_items (id, created_at, payload)
    VALUES (${id}, ${createdAt}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT (id) DO UPDATE
    SET created_at = EXCLUDED.created_at, payload = EXCLUDED.payload`;
}

/** Lists fresh items and prunes expired ones atomically. */
export async function pgListBoothItems<T>(expiryMs: number): Promise<T[]> {
  await ensureSchema();
  const cutoff = new Date(Date.now() - expiryMs).toISOString();
  await sql()`DELETE FROM booth_items WHERE created_at < ${cutoff}`;
  const rows = (await sql()`SELECT payload FROM booth_items ORDER BY created_at ASC`) as {
    payload: T;
  }[];
  return rows.map((r) => r.payload);
}

export async function pgDeleteBoothItem(id: string): Promise<void> {
  await ensureSchema();
  await sql()`DELETE FROM booth_items WHERE id = ${id}`;
}

export async function pgUpsertInvite(
  id: string,
  token: string,
  createdAt: string,
  payload: unknown
): Promise<void> {
  await ensureSchema();
  await sql()`INSERT INTO portal_invites (id, token, created_at, payload)
    VALUES (${id}, ${token}, ${createdAt}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload`;
}

export async function pgListInvites<T>(): Promise<T[]> {
  await ensureSchema();
  const rows = (await sql()`SELECT payload FROM portal_invites ORDER BY created_at DESC`) as {
    payload: T;
  }[];
  return rows.map((r) => r.payload);
}

export async function pgGetInviteByToken<T>(token: string): Promise<T | null> {
  await ensureSchema();
  const rows = (await sql()`SELECT payload FROM portal_invites WHERE token = ${token} LIMIT 1`) as {
    payload: T;
  }[];
  return rows[0]?.payload ?? null;
}

export async function pgUpsertResponse(
  id: string,
  inviteId: string,
  createdAt: string,
  payload: unknown
): Promise<void> {
  await ensureSchema();
  await sql()`INSERT INTO portal_responses (id, invite_id, created_at, payload)
    VALUES (${id}, ${inviteId}, ${createdAt}, ${JSON.stringify(payload)}::jsonb)
    ON CONFLICT (invite_id) DO UPDATE SET payload = EXCLUDED.payload`;
}

export async function pgListResponses<T>(): Promise<T[]> {
  await ensureSchema();
  const rows = (await sql()`SELECT payload FROM portal_responses ORDER BY created_at DESC`) as {
    payload: T;
  }[];
  return rows.map((r) => r.payload);
}
