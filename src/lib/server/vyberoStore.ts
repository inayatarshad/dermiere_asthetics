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
 * Layout:
 *   vybero/appointments/{id}.json
 *   vybero/calls/{id}.json
 *
 * Agent auth: requests from VYBERO carry "x-vybero-key" matching the
 * VYBERO_API_KEY env var. Clinic-side pulls run same-origin without a key.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { put, list } from "@vercel/blob";
import type { Appointment, ClinicHours, VyberoCall } from "@/lib/types";
import { DEFAULT_CLINIC_HOURS } from "@/lib/types";

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
  if (lastErr) throw lastErr;
  return null;
}

// ---------------------------------------------------------------------
// Dev file store
// ---------------------------------------------------------------------

const DEV_DIR = join(process.cwd(), ".vybero-dev-store");

function devWrite(sub: string, id: string, value: unknown) {
  const dir = join(DEV_DIR, sub);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(value), "utf8");
}

function devList<T>(sub: string): T[] {
  const dir = join(DEV_DIR, sub);
  if (!existsSync(dir)) return [];
  const items: T[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      items.push(JSON.parse(readFileSync(join(dir, f), "utf8")) as T);
    } catch {
      // unreadable entry: skip
    }
  }
  return items;
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

async function blobList<T>(prefix: string, token?: string): Promise<T[]> {
  const { blobs } = await list({ prefix, limit: 500, ...tok(token) });
  const items: T[] = [];
  for (const b of blobs) {
    try {
      const item = await readBlobJson<T>(b.pathname, token);
      if (item) items.push(item);
    } catch {
      // skip unreadable entries
    }
  }
  return items;
}

export async function saveAppointment(appt: Appointment): Promise<void> {
  const m = mode();
  try {
    if (m.kind === "blob") {
      await putAdaptive(
        `vybero/appointments/${appt.id}.json`,
        JSON.stringify(appt),
        m.token
      );
    } else {
      devWrite("appointments", appt.id, appt);
    }
  } catch (err) {
    throw asStoreError(err);
  }
}

export async function listAppointments(): Promise<Appointment[]> {
  const m = mode();
  try {
    const items =
      m.kind === "blob"
        ? await blobList<Appointment>("vybero/appointments/", m.token)
        : devList<Appointment>("appointments");
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
  const m = mode();
  try {
    if (m.kind === "blob") {
      await putAdaptive(
        `vybero/calls/${call.id}.json`,
        JSON.stringify(call),
        m.token
      );
    } else {
      devWrite("calls", call.id, call);
    }
  } catch (err) {
    throw asStoreError(err);
  }
}

export async function listCalls(): Promise<VyberoCall[]> {
  const m = mode();
  try {
    const items =
      m.kind === "blob"
        ? await blobList<VyberoCall>("vybero/calls/", m.token)
        : devList<VyberoCall>("calls");
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
