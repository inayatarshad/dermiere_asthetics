/**
 * Dev database - a file-backed twin of the Postgres layer.
 *
 * When no DATABASE_URL is configured and we are NOT on Vercel, every pg*
 * function in db.ts routes here instead, so the full system (login,
 * bootstrap, records sync, bookings, reviews, usage metering) runs with
 * zero infrastructure. One JSON file under .dev-db/ holds everything;
 * writes are synchronous (small data, dev-only) so a Ctrl+C never loses
 * more than nothing.
 *
 * This is a deliberate reliability feature, not a shortcut: demos must
 * never depend on the network. Production deployments always carry a
 * DATABASE_URL and never touch this module.
 */

import fs from "fs";
import path from "path";
import type { ClinicRow, UserRow, UsageRow } from "./db";

const ROOT = path.join(process.cwd(), ".dev-db");
const FILE = path.join(ROOT, "data.json");

interface RecordRow {
  id: string;
  clinic_id: string;
  payload: unknown;
  created_at: string;
}

interface DevData {
  clinics: (ClinicRow<unknown> & { created_at: string })[];
  users: (UserRow<unknown> & { created_at: string })[];
  /** table -> rows (clinical record collections) */
  records: Record<string, RecordRow[]>;
  appointments: { id: string; clinic_id: string; start_at: string; status: string; payload: unknown }[];
  calls: { id: string; clinic_id: string; started_at: string; payload: unknown }[];
  booth: { id: string; clinic_id: string; created_at: string; payload: unknown }[];
  invites: { id: string; clinic_id: string; token: string; created_at: string; payload: unknown }[];
  responses: { id: string; clinic_id: string; invite_id: string; created_at: string; payload: unknown }[];
  reviewInvites: { id: string; clinic_id: string; token: string; created_at: string; payload: unknown }[];
  reviews: { id: string; clinic_id: string; created_at: string; payload: unknown }[];
  /** `${clinicId}|${month}` -> counters */
  usage: Record<string, UsageRow>;
  /** CRM table -> rows. Mirrors crm_* in Postgres, same payload shape. */
  crm: Record<string, CrmDevRow[]>;
}

export interface CrmDevRow {
  id: string;
  clinic_id: string;
  payload: unknown;
}

function empty(): DevData {
  return {
    clinics: [],
    users: [],
    records: {},
    appointments: [],
    calls: [],
    booth: [],
    invites: [],
    responses: [],
    reviewInvites: [],
    reviews: [],
    usage: {},
    crm: {},
  };
}

let cache: DevData | null = null;

function load(): DevData {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    cache = { ...empty(), ...(JSON.parse(raw) as DevData) };
  } catch {
    cache = empty();
  }
  return cache;
}

function save(): void {
  try {
    fs.mkdirSync(ROOT, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(cache), "utf8");
  } catch (err) {
    console.error("[devDb] save failed", err);
  }
}

const now = () => new Date().toISOString();

// =====================================================================
// Identity: clinics
// =====================================================================

export function upsertClinic(id: string, name: string, slug: string | null, payload: unknown): void {
  const d = load();
  const row = d.clinics.find((c) => c.id === id);
  if (row) {
    row.name = name;
    row.slug = slug;
    row.payload = payload;
  } else {
    d.clinics.push({ id, name, slug, payload, created_at: now() });
  }
  save();
}

export function getClinic<T>(id: string): ClinicRow<T> | null {
  const row = load().clinics.find((c) => c.id === id);
  return row ? ({ id: row.id, name: row.name, slug: row.slug, payload: row.payload as T }) : null;
}

export function getClinicBySlug<T>(slug: string): ClinicRow<T> | null {
  const row = load().clinics.find((c) => c.slug === slug);
  return row ? ({ id: row.id, name: row.name, slug: row.slug, payload: row.payload as T }) : null;
}

export function listClinics<T>(): ClinicRow<T>[] {
  return load()
    .clinics.slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((row) => ({ id: row.id, name: row.name, slug: row.slug, payload: row.payload as T }));
}

export function countClinics(): number {
  return load().clinics.length;
}

// =====================================================================
// Identity: users
// =====================================================================

export function upsertUser(
  id: string,
  clinicId: string,
  email: string,
  role: string,
  passwordHash: string,
  active: boolean,
  payload: unknown
): void {
  const d = load();
  const em = email.toLowerCase();
  const row = d.users.find((u) => u.id === id);
  if (row) {
    row.email = em;
    row.role = role;
    row.password_hash = passwordHash;
    row.active = active;
    row.payload = payload;
  } else {
    d.users.push({
      id,
      clinic_id: clinicId,
      email: em,
      role,
      password_hash: passwordHash,
      active,
      payload,
      created_at: now(),
    });
  }
  save();
}

export function getUserByEmail<T>(email: string): UserRow<T> | null {
  const row = load().users.find((u) => u.email === email.toLowerCase());
  return (row as UserRow<T> | undefined) ?? null;
}

export function listUsers<T>(clinicId: string): UserRow<T>[] {
  return load()
    .users.filter((u) => u.clinic_id === clinicId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at)) as unknown as UserRow<T>[];
}

export function setUserActive(clinicId: string, id: string, active: boolean): void {
  const d = load();
  const row = d.users.find((u) => u.clinic_id === clinicId && u.id === id);
  if (row) {
    row.active = active;
    save();
  }
}

export function deleteUser(clinicId: string, id: string): void {
  const d = load();
  d.users = d.users.filter((u) => !(u.clinic_id === clinicId && u.id === id));
  save();
}

// =====================================================================
// Generic clinic-scoped record collections
// =====================================================================

function tableRows(table: string): RecordRow[] {
  const d = load();
  if (!d.records[table]) d.records[table] = [];
  return d.records[table];
}

export function listRecords<T>(clinicId: string, table: string): T[] {
  return tableRows(table)
    .filter((r) => r.clinic_id === clinicId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((r) => r.payload as T);
}

export function upsertRecord(clinicId: string, table: string, id: string, payload: unknown): void {
  const rows = tableRows(table);
  const row = rows.find((r) => r.id === id);
  if (row) {
    if (row.clinic_id !== clinicId) return; // cross-tenant write refused, like the SQL WHERE
    row.payload = payload;
  } else {
    rows.push({ id, clinic_id: clinicId, payload, created_at: now() });
  }
  save();
}

export function deleteRecord(clinicId: string, table: string, id: string): void {
  const d = load();
  const rows = d.records[table];
  if (!rows) return;
  d.records[table] = rows.filter((r) => !(r.clinic_id === clinicId && r.id === id));
  save();
}

export function replaceRecords(
  clinicId: string,
  table: string,
  items: { id: string; payload: unknown }[]
): void {
  const d = load();
  const others = (d.records[table] ?? []).filter((r) => r.clinic_id !== clinicId);
  const stamp = now();
  d.records[table] = [
    ...others,
    ...items.map((it, i) => ({
      id: it.id,
      clinic_id: clinicId,
      payload: it.payload,
      // preserve list order under the created_at sort
      created_at: stamp.slice(0, -1) + String(i).padStart(3, "0") + "Z",
    })),
  ];
  save();
}

// =====================================================================
// Operational: appointments / calls / booth / portal
// =====================================================================

export function upsertAppointment(clinicId: string, id: string, startAt: string, status: string, payload: unknown): void {
  const d = load();
  const row = d.appointments.find((a) => a.id === id);
  if (row) {
    if (row.clinic_id !== clinicId) return;
    row.start_at = startAt;
    row.status = status;
    row.payload = payload;
  } else {
    d.appointments.push({ id, clinic_id: clinicId, start_at: startAt, status, payload });
  }
  save();
}

export function deleteAppointment(clinicId: string, id: string): void {
  const d = load();
  const i = d.appointments.findIndex(
    (a) => a.clinic_id === clinicId && a.id === id
  );
  if (i !== -1) {
    d.appointments.splice(i, 1);
    save();
  }
}

export function listAppointments<T>(clinicId: string): T[] {
  return load()
    .appointments.filter((a) => a.clinic_id === clinicId)
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .map((a) => a.payload as T);
}

export function upsertCall(clinicId: string, id: string, startedAt: string, payload: unknown): void {
  const d = load();
  const row = d.calls.find((c) => c.id === id);
  if (row) {
    if (row.clinic_id !== clinicId) return;
    row.started_at = startedAt;
    row.payload = payload;
  } else {
    d.calls.push({ id, clinic_id: clinicId, started_at: startedAt, payload });
  }
  save();
}

export function listCalls<T>(clinicId: string, limit = 500): T[] {
  return load()
    .calls.filter((c) => c.clinic_id === clinicId)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, limit)
    .map((c) => c.payload as T);
}

export function upsertBoothItem(clinicId: string, id: string, createdAt: string, payload: unknown): void {
  const d = load();
  const row = d.booth.find((b) => b.id === id);
  if (row) {
    if (row.clinic_id !== clinicId) return;
    row.created_at = createdAt;
    row.payload = payload;
  } else {
    d.booth.push({ id, clinic_id: clinicId, created_at: createdAt, payload });
  }
  save();
}

export function listBoothItems<T>(clinicId: string, expiryMs: number): T[] {
  const d = load();
  const cutoff = new Date(Date.now() - expiryMs).toISOString();
  const before = d.booth.length;
  d.booth = d.booth.filter((b) => !(b.clinic_id === clinicId && b.created_at < cutoff));
  if (d.booth.length !== before) save();
  return d.booth
    .filter((b) => b.clinic_id === clinicId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((b) => b.payload as T);
}

export function deleteBoothItem(clinicId: string, id: string): void {
  const d = load();
  d.booth = d.booth.filter((b) => !(b.clinic_id === clinicId && b.id === id));
  save();
}

export function upsertInvite(clinicId: string, id: string, token: string, createdAt: string, payload: unknown): void {
  const d = load();
  const row = d.invites.find((i) => i.id === id);
  if (row) {
    if (row.clinic_id !== clinicId) return;
    row.payload = payload;
  } else {
    d.invites.push({ id, clinic_id: clinicId, token, created_at: createdAt, payload });
  }
  save();
}

export function listInvites<T>(clinicId: string): T[] {
  return load()
    .invites.filter((i) => i.clinic_id === clinicId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((i) => i.payload as T);
}

export function getInviteByToken<T>(token: string): { clinic_id: string; payload: T } | null {
  const row = load().invites.find((i) => i.token === token);
  return row ? { clinic_id: row.clinic_id, payload: row.payload as T } : null;
}

export function upsertResponse(clinicId: string, id: string, inviteId: string, createdAt: string, payload: unknown): void {
  const d = load();
  const row = d.responses.find((r) => r.invite_id === inviteId);
  if (row) {
    row.payload = payload;
  } else {
    d.responses.push({ id, clinic_id: clinicId, invite_id: inviteId, created_at: createdAt, payload });
  }
  save();
}

export function listResponses<T>(clinicId: string): T[] {
  return load()
    .responses.filter((r) => r.clinic_id === clinicId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((r) => r.payload as T);
}

// =====================================================================
// Reviews (invite tokens + submitted reviews)
// =====================================================================

export function upsertReviewInvite(clinicId: string, id: string, token: string, createdAt: string, payload: unknown): void {
  const d = load();
  const row = d.reviewInvites.find((i) => i.id === id);
  if (row) {
    if (row.clinic_id !== clinicId) return;
    row.payload = payload;
  } else {
    d.reviewInvites.push({ id, clinic_id: clinicId, token, created_at: createdAt, payload });
  }
  save();
}

export function listReviewInvites<T>(clinicId: string): T[] {
  return load()
    .reviewInvites.filter((i) => i.clinic_id === clinicId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((i) => i.payload as T);
}

export function getReviewInviteByToken<T>(token: string): { clinic_id: string; payload: T } | null {
  const row = load().reviewInvites.find((i) => i.token === token);
  return row ? { clinic_id: row.clinic_id, payload: row.payload as T } : null;
}

export function upsertReview(clinicId: string, id: string, createdAt: string, payload: unknown): void {
  const d = load();
  const row = d.reviews.find((r) => r.id === id);
  if (row) {
    if (row.clinic_id !== clinicId) return;
    row.payload = payload;
  } else {
    d.reviews.push({ id, clinic_id: clinicId, created_at: createdAt, payload });
  }
  save();
}

export function listReviews<T>(clinicId: string): T[] {
  return load()
    .reviews.filter((r) => r.clinic_id === clinicId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((r) => r.payload as T);
}

// =====================================================================
// Usage metering
// =====================================================================

export function getUsage(clinicId: string, month: string): UsageRow {
  return load().usage[`${clinicId}|${month}`] ?? { generations: 0, assessments: 0 };
}

export function incrUsage(clinicId: string, month: string, kind: "generations" | "assessments"): UsageRow {
  const d = load();
  const key = `${clinicId}|${month}`;
  const row = d.usage[key] ?? { generations: 0, assessments: 0 };
  row[kind] += 1;
  d.usage[key] = row;
  save();
  return { ...row };
}

// =====================================================================
// CRM - generic clinic-scoped collections
//
// The Postgres side keeps hot columns alongside the jsonb payload for its
// indexes; here the payload IS the row, and crmStore does the same filtering
// in TypeScript. One behaviour, two backends.
// =====================================================================

export function crmList<T>(clinicId: string, table: string): T[] {
  const d = load();
  return (d.crm[table] ?? [])
    .filter((r) => r.clinic_id === clinicId)
    .map((r) => r.payload as T);
}

export function crmGet<T>(clinicId: string, table: string, id: string): T | null {
  const d = load();
  const row = (d.crm[table] ?? []).find(
    (r) => r.clinic_id === clinicId && r.id === id
  );
  return row ? (row.payload as T) : null;
}

export function crmUpsert(
  clinicId: string,
  table: string,
  id: string,
  payload: unknown
): void {
  const d = load();
  const rows = (d.crm[table] ??= []);
  const existing = rows.find((r) => r.clinic_id === clinicId && r.id === id);
  if (existing) existing.payload = payload;
  else rows.push({ id, clinic_id: clinicId, payload });
  save();
}

export function crmDelete(clinicId: string, table: string, id: string): void {
  const d = load();
  const rows = d.crm[table];
  if (!rows) return;
  const i = rows.findIndex((r) => r.clinic_id === clinicId && r.id === id);
  if (i !== -1) {
    rows.splice(i, 1);
    save();
  }
}
