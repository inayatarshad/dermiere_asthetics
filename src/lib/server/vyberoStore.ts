/**
 * VYBERO integration storage — the shared appointment book + call log the
 * voice agent writes into and clinic screens sync from.
 *
 * Same demo-grade Blob pattern as boothStore.ts (which is battle-tested on
 * production, hence deliberately duplicated rather than refactored days
 * before the event): Vercel Blob when connected, a local file store for
 * dev, explicit not_configured error otherwise. Unlike booth items,
 * appointments and call logs do NOT expire.
 *
 * Layout (SINGLE blob per collection — deliberate): Vercel Blob bills per
 * operation, and the clinic screens poll. Per-record blobs cost
 * 1 list + N reads on every poll and blew through the plan's operation
 * quota in hours; a single-array blob costs exactly 1 read per poll and
 * no list calls at all. Trade-off: read-modify-write on save can lose a
 * concurrent write — acceptable at one-booth/one-desk scale, and the
 * Postgres migration in SCALABILITY_ROADMAP.md removes it for real.
 *   vybero/appointments.json  -> Appointment[]
 *   vybero/calls.json         -> VyberoCall[] (latest 500)
 *
 * Agent auth: requests from VYBERO carry "x-vybero-key" matching the
 * VYBERO_API_KEY env var. Clinic-side pulls run same-origin without a key.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { put } from "@vercel/blob";
import type { Appointment, ClinicHours, VyberoCall } from "@/lib/types";
import { DEFAULT_CLINIC_HOURS } from "@/lib/types";
import {
  pgAvailable,
  pgListAppointments,
  pgListCalls,
  pgUpsertAppointment,
  pgUpsertCall,
} from "./db";

export class VyberoStoreError extends Error {
  constructor(
    public code: "not_configured" | "store_error",
    message: string
  ) {
    super(message);
  }
}

function findBlobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  for (const [k, v] of Object.entries(process.env)) {
    if (/_READ_WRITE_TOKEN$/.test(k) && v && v.startsWith("vercel_blob_rw_")) {
      return v;
    }
  }
  return undefined;
}

function mode(): { kind: "blob"; token?: string } | { kind: "dev" } {
  const token = findBlobToken();
  if (token) return { kind: "blob", token };
  if (process.env.BLOB_STORE_ID && process.env.VERCEL) {
    return { kind: "blob" };
  }
  if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
    return { kind: "dev" };
  }
  throw new VyberoStoreError(
    "not_configured",
    "VYBERO storage is not configured. Connect a Vercel Blob store to this project (Storage tab) and redeploy."
  );
}

function tok(token?: string): { token?: string } {
  return token ? { token } : {};
}

function asStoreError(err: unknown): VyberoStoreError {
  if (err instanceof VyberoStoreError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  return new VyberoStoreError("store_error", `Blob operation failed: ${msg}`);
}

let storeAccess: "public" | "private" | undefined;

async function putAdaptive(pathname: string, body: string, token?: string) {
  const order: ("public" | "private")[] = storeAccess
    ? [storeAccess]
    : ["private", "public"];
  let lastErr: unknown;
  for (const access of order) {
    try {
      const blob = await put(pathname, body, {
        access,
        addRandomSuffix: false,
        contentType: "application/json",
        ...tok(token),
      });
      storeAccess = access;
      return blob;
    } catch (err) {
      lastErr = err;
      if (order.length === 1) throw err;
    }
  }
  throw lastErr;
}

/** Private stores answer 403 for blobs that do not exist yet — a fresh
 *  collection must read as empty, not as an error. */
function isNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /403|404|forbidden|not.?found|does not exist/i.test(msg);
}

async function readBlobJson<T>(pathname: string, token?: string): Promise<T | null> {
  const { get } = await import("@vercel/blob");
  const order: ("public" | "private")[] = storeAccess
    ? [storeAccess]
    : ["private", "public"];
  let lastErr: unknown = null;
  for (const access of order) {
    try {
      const res = await get(pathname, { access, ...tok(token) });
      if (!res) return null;
      storeAccess = access;
      const text = await new Response(res.stream).text();
      return JSON.parse(text) as T;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr && isNotFound(lastErr)) return null; // not created yet
  if (lastErr) throw lastErr;
  return null;
}

// ---------------------------------------------------------------------
// Dev file store (single file per collection, mirroring the blob layout)
// ---------------------------------------------------------------------

const DEV_DIR = join(process.cwd(), ".vybero-dev-store");

function devReadCollection<T>(name: string): T[] {
  const file = join(DEV_DIR, `${name}.json`);
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T[];
  } catch {
    return [];
  }
}

function devWriteCollection(name: string, items: unknown[]) {
  mkdirSync(DEV_DIR, { recursive: true });
  writeFileSync(join(DEV_DIR, `${name}.json`), JSON.stringify(items), "utf8");
}

// ---------------------------------------------------------------------
// Collections (1 blob read per poll — the whole point, see header)
// ---------------------------------------------------------------------

const APPTS_PATH = "vybero/appointments.json";
const CALLS_PATH = "vybero/calls.json";
const CALLS_CAP = 500;

async function readCollection<T>(pathname: string, token?: string): Promise<T[]> {
  const items = await readBlobJson<T[]>(pathname, token);
  return Array.isArray(items) ? items : [];
}

/** Read-modify-write upsert (last writer wins; see header trade-off note). */
async function upsertInto<T extends { id: string }>(
  pathname: string,
  item: T,
  token: string | undefined,
  cap?: number
): Promise<void> {
  const items = await readCollection<T>(pathname, token);
  const idx = items.findIndex((x) => x.id === item.id);
  if (idx >= 0) items[idx] = item;
  else items.push(item);
  const trimmed = cap && items.length > cap ? items.slice(-cap) : items;
  await putAdaptive(pathname, JSON.stringify(trimmed), token);
}

export async function saveAppointment(appt: Appointment): Promise<void> {
  if (pgAvailable()) {
    try {
      await pgUpsertAppointment(appt.id, appt.start, appt.status, appt);
      return;
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const m = mode();
  try {
    if (m.kind === "blob") {
      await upsertInto(APPTS_PATH, appt, m.token);
    } else {
      const items = devReadCollection<Appointment>("appointments");
      const idx = items.findIndex((x) => x.id === appt.id);
      if (idx >= 0) items[idx] = appt;
      else items.push(appt);
      devWriteCollection("appointments", items);
    }
  } catch (err) {
    throw asStoreError(err);
  }
}

export async function listAppointments(): Promise<Appointment[]> {
  if (pgAvailable()) {
    try {
      return await pgListAppointments<Appointment>();
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const m = mode();
  try {
    const items =
      m.kind === "blob"
        ? await readCollection<Appointment>(APPTS_PATH, m.token)
        : devReadCollection<Appointment>("appointments");
    return items.sort((a, b) => a.start.localeCompare(b.start));
  } catch (err) {
    throw asStoreError(err);
  }
}

export async function getAppointment(id: string): Promise<Appointment | null> {
  const items = await listAppointments();
  return items.find((a) => a.id === id) ?? null;
}

export async function saveCall(call: VyberoCall): Promise<void> {
  if (pgAvailable()) {
    try {
      await pgUpsertCall(call.id, call.started_at, call);
      return;
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const m = mode();
  try {
    if (m.kind === "blob") {
      await upsertInto(CALLS_PATH, call, m.token, CALLS_CAP);
    } else {
      const items = devReadCollection<VyberoCall>("calls");
      const idx = items.findIndex((x) => x.id === call.id);
      if (idx >= 0) items[idx] = call;
      else items.push(call);
      devWriteCollection("calls", items.slice(-CALLS_CAP));
    }
  } catch (err) {
    throw asStoreError(err);
  }
}

export async function listCalls(): Promise<VyberoCall[]> {
  if (pgAvailable()) {
    try {
      return await pgListCalls<VyberoCall>(CALLS_CAP);
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const m = mode();
  try {
    const items =
      m.kind === "blob"
        ? await readCollection<VyberoCall>(CALLS_PATH, m.token)
        : devReadCollection<VyberoCall>("calls");
    return items.sort((a, b) => b.started_at.localeCompare(a.started_at));
  } catch (err) {
    throw asStoreError(err);
  }
}

// ---------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------

/** Server-side clinic hours (env-overridable; UI mirrors the same default). */
export function clinicHours(): ClinicHours {
  const env = process.env.CLINIC_HOURS; // e.g. '{"open":"10:00","close":"19:00","slot_min":30,"days":[1,2,3,4,5,6]}'
  if (env) {
    try {
      return { ...DEFAULT_CLINIC_HOURS, ...(JSON.parse(env) as Partial<ClinicHours>) };
    } catch {
      // fall through to default
    }
  }
  return DEFAULT_CLINIC_HOURS;
}

const ACTIVE_STATUSES = new Set(["booked", "confirmed"]);

/** Free slots for a date, from clinic hours minus active appointments. */
export async function availabilityFor(
  date: string // YYYY-MM-DD
): Promise<{ start: string; end: string }[]> {
  const hours = clinicHours();
  const day = new Date(`${date}T00:00:00`);
  if (!hours.days.includes(day.getDay())) return [];

  const appts = (await listAppointments()).filter(
    (a) => a.start.slice(0, 10) === date && ACTIVE_STATUSES.has(a.status)
  );
  const busy = appts.map((a) => {
    const s = new Date(a.start).getTime();
    return { s, e: s + a.duration_min * 60_000 };
  });

  const [oh, om] = hours.open.split(":").map(Number);
  const [ch, cm] = hours.close.split(":").map(Number);
  const dayStart = new Date(day);
  dayStart.setHours(oh, om, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(ch, cm, 0, 0);

  const out: { start: string; end: string }[] = [];
  const step = hours.slot_min * 60_000;
  for (let t = dayStart.getTime(); t + step <= dayEnd.getTime(); t += step) {
    const overlaps = busy.some((b) => t < b.e && t + step > b.s);
    if (!overlaps && t > Date.now() - step) {
      out.push({
        start: new Date(t).toISOString(),
        end: new Date(t + step).toISOString(),
      });
    }
  }
  return out;
}

/** True when a proposed appointment window is free. */
export async function slotFree(
  start: string,
  durationMin: number,
  ignoreId?: string
): Promise<boolean> {
  const s = new Date(start).getTime();
  const e = s + durationMin * 60_000;
  const appts = (await listAppointments()).filter(
    (a) =>
      a.id !== ignoreId &&
      ACTIVE_STATUSES.has(a.status) &&
      a.start.slice(0, 10) === start.slice(0, 10)
  );
  return !appts.some((a) => {
    const as = new Date(a.start).getTime();
    const ae = as + a.duration_min * 60_000;
    return s < ae && e > as;
  });
}

// ---------------------------------------------------------------------
// Agent auth
// ---------------------------------------------------------------------

/**
 * Validates the voice agent's key. Same-origin clinic pulls (no key
 * header) are allowed for reads; writes from outside require the key.
 * With no VYBERO_API_KEY set, agent writes are accepted only in dev.
 */
export function agentAuthorized(req: Request): boolean {
  const key = process.env.VYBERO_API_KEY;
  const sent = req.headers.get("x-vybero-key");
  if (key) return sent === key;
  return process.env.NODE_ENV !== "production" || !process.env.VERCEL;
}
