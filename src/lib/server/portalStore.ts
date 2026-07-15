/**
 * Brand Discovery Portal storage — invites + responses, clinic-scoped.
 * The admin dashboard reads only its own clinic's invites/responses; the
 * public token lookup returns the invite plus its owning clinic so the
 * response is filed to the right tenant. Postgres is the source of truth;
 * the Blob / dev-file fallbacks namespace paths per clinic.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { put } from "@vercel/blob";
import {
  pgAvailable,
  pgGetInviteByToken,
  pgListInvites,
  pgListResponses,
  pgUpsertInvite,
  pgUpsertResponse,
} from "./db";

export type InviteStatus = "PENDING" | "OPENED" | "COMPLETED";

export interface PortalInvite {
  id: string;
  token: string;
  clinicName?: string;
  doctorName?: string;
  city?: string;
  brandTheme?: { primary?: string; brandName?: string };
  status: InviteStatus;
  createdAt: string;
  openedAt?: string;
  completedAt?: string;
}

export interface PortalResponse {
  id: string;
  inviteId: string;
  token: string;
  clinicName: string;
  doctorName: string;
  cityArea?: string;
  whatsapp?: string;
  instagram?: string;
  website?: string;
  patientsPerDay?: string;
  monthlyBudget?: string;
  bookingMethods: string[];
  painPoints: string[];
  interests: string[];
  servicesInDemand?: string;
  helpNotes?: string;
  consent: boolean;
  createdAt: string;
}

export class PortalStoreError extends Error {
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
    if (/_READ_WRITE_TOKEN$/.test(k) && v && v.startsWith("vercel_blob_rw_")) return v;
  }
  return undefined;
}

function mode(): { kind: "blob"; token?: string } | { kind: "dev" } {
  const token = findBlobToken();
  if (token) return { kind: "blob", token };
  if (process.env.BLOB_STORE_ID && process.env.VERCEL) return { kind: "blob" };
  if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) return { kind: "dev" };
  throw new PortalStoreError(
    "not_configured",
    "Portal storage is not configured. Connect Postgres or a Vercel Blob store and redeploy."
  );
}

function tok(token?: string): { token?: string } {
  return token ? { token } : {};
}

function asStoreError(err: unknown): PortalStoreError {
  if (err instanceof PortalStoreError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  return new PortalStoreError("store_error", `Blob operation failed: ${msg}`);
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

async function readCollection<T>(pathname: string, token?: string): Promise<T[]> {
  const { get } = await import("@vercel/blob");
  const order: ("public" | "private")[] = storeAccess ? [storeAccess] : ["private", "public"];
  let lastErr: unknown = null;
  for (const access of order) {
    try {
      const res = await get(pathname, { access, ...tok(token) });
      if (!res) return [];
      storeAccess = access;
      const items = JSON.parse(await new Response(res.stream).text()) as T[];
      return Array.isArray(items) ? items : [];
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr && isNotFound(lastErr)) return [];
  if (lastErr) throw lastErr;
  return [];
}

// ---- dev file fallback (namespaced per clinic) -----------------------

const DEV_DIR = join(process.cwd(), ".portal-dev-store");

function devRead<T>(name: string): T[] {
  const file = join(DEV_DIR, `${name}.json`);
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T[];
  } catch {
    return [];
  }
}

function devWrite(name: string, items: unknown[]) {
  mkdirSync(DEV_DIR, { recursive: true });
  writeFileSync(join(DEV_DIR, `${name}.json`), JSON.stringify(items), "utf8");
}

// ---- per-clinic paths ------------------------------------------------

const invitesPath = (clinicId: string) => `portal/${clinicId}/invites.json`;
const responsesPath = (clinicId: string) => `portal/${clinicId}/responses.json`;
const invitesDev = (clinicId: string) => `invites_${clinicId}`;
const responsesDev = (clinicId: string) => `responses_${clinicId}`;

async function readInvites(clinicId: string): Promise<PortalInvite[]> {
  const m = mode();
  try {
    return m.kind === "blob"
      ? await readCollection<PortalInvite>(invitesPath(clinicId), m.token)
      : devRead<PortalInvite>(invitesDev(clinicId));
  } catch (err) {
    throw asStoreError(err);
  }
}

async function writeInvites(clinicId: string, items: PortalInvite[]): Promise<void> {
  const m = mode();
  try {
    if (m.kind === "blob") await putAdaptive(invitesPath(clinicId), JSON.stringify(items), m.token);
    else devWrite(invitesDev(clinicId), items);
  } catch (err) {
    throw asStoreError(err);
  }
}

export async function listInvites(clinicId: string): Promise<PortalInvite[]> {
  if (pgAvailable()) {
    try {
      return await pgListInvites<PortalInvite>(clinicId);
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const items = await readInvites(clinicId);
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Public token lookup — returns the invite plus its owning clinic id. */
export async function getInviteByToken(
  token: string
): Promise<{ clinicId: string; invite: PortalInvite } | null> {
  if (pgAvailable()) {
    try {
      const row = await pgGetInviteByToken<PortalInvite>(token);
      return row ? { clinicId: row.clinic_id, invite: row.payload } : null;
    } catch (err) {
      throw asStoreError(err);
    }
  }
  // Fallback: scan namespaced dev files for the token.
  if (!existsSync(DEV_DIR)) return null;
  for (const f of readdirSync(DEV_DIR)) {
    const m = /^invites_(.+)\.json$/.exec(f);
    if (!m) continue;
    const clinicId = m[1];
    const invite = devRead<PortalInvite>(invitesDev(clinicId)).find((i) => i.token === token);
    if (invite) return { clinicId, invite };
  }
  return null;
}

export async function saveInvite(clinicId: string, invite: PortalInvite): Promise<void> {
  if (pgAvailable()) {
    try {
      await pgUpsertInvite(clinicId, invite.id, invite.token, invite.createdAt, invite);
      return;
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const items = await readInvites(clinicId);
  const idx = items.findIndex((i) => i.id === invite.id);
  if (idx >= 0) items[idx] = invite;
  else items.push(invite);
  await writeInvites(clinicId, items);
}

export async function listResponses(clinicId: string): Promise<PortalResponse[]> {
  if (pgAvailable()) {
    try {
      return await pgListResponses<PortalResponse>(clinicId);
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const m = mode();
  try {
    const items =
      m.kind === "blob"
        ? await readCollection<PortalResponse>(responsesPath(clinicId), m.token)
        : devRead<PortalResponse>(responsesDev(clinicId));
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    throw asStoreError(err);
  }
}

export async function saveResponse(clinicId: string, response: PortalResponse): Promise<void> {
  if (pgAvailable()) {
    try {
      await pgUpsertResponse(clinicId, response.id, response.inviteId, response.createdAt, response);
      return;
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const m = mode();
  try {
    const items =
      m.kind === "blob"
        ? await readCollection<PortalResponse>(responsesPath(clinicId), m.token)
        : devRead<PortalResponse>(responsesDev(clinicId));
    const idx = items.findIndex((r) => r.inviteId === response.inviteId);
    if (idx >= 0) {
      response.id = items[idx].id;
      items[idx] = response;
    } else {
      items.push(response);
    }
    if (m.kind === "blob") await putAdaptive(responsesPath(clinicId), JSON.stringify(items), m.token);
    else devWrite(responsesDev(clinicId), items);
  } catch (err) {
    throw asStoreError(err);
  }
}

// ---- helpers ----------------------------------------------------------

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** nanoid-style 16-char URL-safe token (crypto-random, unguessable). */
export function newToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Best-effort per-IP limiter (instance-local; enough to blunt bots). */
const hits = new Map<string, number[]>();
export function rateLimited(ip: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(ip, list);
  return list.length > max;
}
