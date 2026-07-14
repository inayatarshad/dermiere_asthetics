/**
 * Brand Discovery Portal storage — invites + responses
 * (spec: Brand-Discovery-Portal-BUILD-SPEC.md, Mythos vault).
 *
 * Same single-blob collection pattern as vyberoStore (1 read per poll,
 * zero list calls; the Postgres step in SCALABILITY_ROADMAP.md replaces
 * it wholesale). Dev file fallback keeps the whole flow testable offline.
 *
 * Layout:
 *   portal/invites.json    -> PortalInvite[]
 *   portal/responses.json  -> PortalResponse[]
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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
  token: string; // 16-char URL-safe, unguessable
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
    if (/_READ_WRITE_TOKEN$/.test(k) && v && v.startsWith("vercel_blob_rw_")) {
      return v;
    }
  }
  return undefined;
}

function mode(): { kind: "blob"; token?: string } | { kind: "dev" } {
  const token = findBlobToken();
  if (token) return { kind: "blob", token };
  if (process.env.BLOB_STORE_ID && process.env.VERCEL) return { kind: "blob" };
  if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
    return { kind: "dev" };
  }
  throw new PortalStoreError(
    "not_configured",
    "Portal storage is not configured. Connect a Vercel Blob store to this project and redeploy."
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

/** Private stores answer 403 for blobs that simply do not exist yet —
 *  a fresh collection must read as empty, not as an error. */
function isNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /403|404|forbidden|not.?found|does not exist/i.test(msg);
}

async function readCollection<T>(pathname: string, token?: string): Promise<T[]> {
  const { get } = await import("@vercel/blob");
  const order: ("public" | "private")[] = storeAccess
    ? [storeAccess]
    : ["private", "public"];
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
  if (lastErr && isNotFound(lastErr)) return []; // collection not created yet
  if (lastErr) throw lastErr;
  return [];
}

// ---- dev file fallback -------------------------------------------------

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

// ---- collections ---------------------------------------------------------

const INVITES = "portal/invites.json";
const RESPONSES = "portal/responses.json";

async function readInvites(): Promise<PortalInvite[]> {
  const m = mode();
  try {
    return m.kind === "blob"
      ? await readCollection<PortalInvite>(INVITES, m.token)
      : devRead<PortalInvite>("invites");
  } catch (err) {
    throw asStoreError(err);
  }
}

async function writeInvites(items: PortalInvite[]): Promise<void> {
  const m = mode();
  try {
    if (m.kind === "blob") {
      await putAdaptive(INVITES, JSON.stringify(items), m.token);
    } else {
      devWrite("invites", items);
    }
  } catch (err) {
    throw asStoreError(err);
  }
}

export async function listInvites(): Promise<PortalInvite[]> {
  if (pgAvailable()) {
    try {
      return await pgListInvites<PortalInvite>();
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const items = await readInvites();
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getInviteByToken(
  token: string
): Promise<PortalInvite | null> {
  if (pgAvailable()) {
    try {
      return await pgGetInviteByToken<PortalInvite>(token);
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const items = await readInvites();
  return items.find((i) => i.token === token) ?? null;
}

export async function saveInvite(invite: PortalInvite): Promise<void> {
  if (pgAvailable()) {
    try {
      await pgUpsertInvite(invite.id, invite.token, invite.createdAt, invite);
      return;
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const items = await readInvites();
  const idx = items.findIndex((i) => i.id === invite.id);
  if (idx >= 0) items[idx] = invite;
  else items.push(invite);
  await writeInvites(items);
}

export async function listResponses(): Promise<PortalResponse[]> {
  if (pgAvailable()) {
    try {
      return await pgListResponses<PortalResponse>();
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const m = mode();
  try {
    const items =
      m.kind === "blob"
        ? await readCollection<PortalResponse>(RESPONSES, m.token)
        : devRead<PortalResponse>("responses");
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    throw asStoreError(err);
  }
}

export async function saveResponse(response: PortalResponse): Promise<void> {
  if (pgAvailable()) {
    try {
      // invite_id is unique in the table: a re-submit before lock updates
      await pgUpsertResponse(
        response.id,
        response.inviteId,
        response.createdAt,
        response
      );
      return;
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const m = mode();
  try {
    const items =
      m.kind === "blob"
        ? await readCollection<PortalResponse>(RESPONSES, m.token)
        : devRead<PortalResponse>("responses");
    const idx = items.findIndex((r) => r.inviteId === response.inviteId);
    if (idx >= 0) {
      response.id = items[idx].id; // re-submits before lock update in place
      items[idx] = response;
    } else {
      items.push(response);
    }
    if (m.kind === "blob") {
      await putAdaptive(RESPONSES, JSON.stringify(items), m.token);
    } else {
      devWrite("responses", items);
    }
  } catch (err) {
    throw asStoreError(err);
  }
}

// ---- helpers --------------------------------------------------------------

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

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
