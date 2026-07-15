/**
 * VYBERO integration storage — the per-clinic appointment book + call log
 * the voice agent writes into and clinic screens sync from. Every function
 * is clinic-scoped: Postgres rows carry clinic_id and every query filters on
 * it; the Blob / dev-file fallbacks namespace their paths by clinic so one
 * clinic can never read another's bookings or callers.
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
    "VYBERO storage is not configured. Connect Postgres or a Vercel Blob store and redeploy."
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
  const order: ("public" | "private")[] = storeAccess ? [storeAccess] : ["private", "public"];
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

function isNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /403|404|forbidden|not.?found|does not exist/i.test(msg);
}

async function readBlobJson<T>(pathname: string, token?: string): Promise<T | null> {
  const { get } = await import("@vercel/blob");
  const order: ("public" | "private")[] = storeAccess ? [storeAccess] : ["private", "public"];
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
  if (lastErr && isNotFound(lastErr)) return null;
  if (lastErr) throw lastErr;
  return null;
}

// --- dev file store (namespaced per clinic) ---------------------------

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

// --- per-clinic paths --------------------------------------------------

const CALLS_CAP = 500;
const apptsPath = (clinicId: string) => `vybero/${clinicId}/appointments.json`;
const callsPath = (clinicId: string) => `vybero/${clinicId}/calls.json`;
const apptsDev = (clinicId: string) => `appointments_${clinicId}`;
const callsDev = (clinicId: string) => `calls_${clinicId}`;

async function readCollection<T>(pathname: string, token?: string): Promise<T[]> {
  const items = await readBlobJson<T[]>(pathname, token);
  return Array.isArray(items) ? items : [];
}

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

export async function saveAppointment(clinicId: string, appt: Appointment): Promise<void> {
  if (pgAvailable()) {
    try {
      await pgUpsertAppointment(clinicId, appt.id, appt.start, appt.status, appt);
      return;
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const m = mode();
  try {
    if (m.kind === "blob") {
      await upsertInto(apptsPath(clinicId), appt, m.token);
    } else {
      const items = devReadCollection<Appointment>(apptsDev(clinicId));
      const idx = items.findIndex((x) => x.id === appt.id);
      if (idx >= 0) items[idx] = appt;
      else items.push(appt);
      devWriteCollection(apptsDev(clinicId), items);
    }
  } catch (err) {
    throw asStoreError(err);
  }
}

export async function listAppointments(clinicId: string): Promise<Appointment[]> {
  if (pgAvailable()) {
    try {
      return await pgListAppointments<Appointment>(clinicId);
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const m = mode();
  try {
    const items =
      m.kind === "blob"
        ? await readCollection<Appointment>(apptsPath(clinicId), m.token)
        : devReadCollection<Appointment>(apptsDev(clinicId));
    return items.sort((a, b) => a.start.localeCompare(b.start));
  } catch (err) {
    throw asStoreError(err);
  }
}

export async function getAppointment(
  clinicId: string,
  id: string
): Promise<Appointment | null> {
  const items = await listAppointments(clinicId);
  return items.find((a) => a.id === id) ?? null;
}

export async function saveCall(clinicId: string, call: VyberoCall): Promise<void> {
  if (pgAvailable()) {
    try {
      await pgUpsertCall(clinicId, call.id, call.started_at, call);
      return;
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const m = mode();
  try {
    if (m.kind === "blob") {
      await upsertInto(callsPath(clinicId), call, m.token, CALLS_CAP);
    } else {
      const items = devReadCollection<VyberoCall>(callsDev(clinicId));
      const idx = items.findIndex((x) => x.id === call.id);
      if (idx >= 0) items[idx] = call;
      else items.push(call);
      devWriteCollection(callsDev(clinicId), items.slice(-CALLS_CAP));
    }
  } catch (err) {
    throw asStoreError(err);
  }
}

export async function listCalls(clinicId: string): Promise<VyberoCall[]> {
  if (pgAvailable()) {
    try {
      return await pgListCalls<VyberoCall>(clinicId, CALLS_CAP);
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const m = mode();
  try {
    const items =
      m.kind === "blob"
        ? await readCollection<VyberoCall>(callsPath(clinicId), m.token)
        : devReadCollection<VyberoCall>(callsDev(clinicId));
    return items.sort((a, b) => b.started_at.localeCompare(a.started_at));
  } catch (err) {
    throw asStoreError(err);
  }
}

// --- availability ------------------------------------------------------

/** Fallback clinic hours (per-clinic hours come from config via the route). */
export function clinicHours(): ClinicHours {
  return DEFAULT_CLINIC_HOURS;
}

const ACTIVE_STATUSES = new Set(["booked", "confirmed"]);

/** Free slots for a date, from the clinic's hours minus its active appts. */
export async function availabilityFor(
  clinicId: string,
  date: string,
  hours: ClinicHours = DEFAULT_CLINIC_HOURS
): Promise<{ start: string; end: string }[]> {
  const day = new Date(`${date}T00:00:00`);
  if (!hours.days.includes(day.getDay())) return [];

  const appts = (await listAppointments(clinicId)).filter(
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

/** True when a proposed appointment window is free for this clinic. */
export async function slotFree(
  clinicId: string,
  start: string,
  durationMin: number,
  ignoreId?: string
): Promise<boolean> {
  const s = new Date(start).getTime();
  const e = s + durationMin * 60_000;
  const appts = (await listAppointments(clinicId)).filter(
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
