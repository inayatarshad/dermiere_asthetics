/**
 * Booth inbox storage (T1) — the courier between a clinic's booth phone and
 * its desktop. Every item is clinic-scoped: Postgres rows carry clinic_id;
 * the Blob and dev-file fallbacks namespace their paths by clinic. Both the
 * phone (push) and the desktop (pull) are authenticated clinic sessions, so
 * scoping is by the caller's clinic_id — never a shared inbox.
 *
 * Items expire after 24h (privacy) and are purged lazily on pull.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { put, del, list, get } from "@vercel/blob";
import {
  pgAvailable,
  pgDeleteBoothItem,
  pgListBoothItems,
  pgUpsertBoothItem,
} from "./db";

export interface BoothPhotoIn {
  kind: string; // photo_front | photo_left | photo_right
  dataUrl: string;
}

export interface BoothItem {
  id: string;
  created_at: string;
  patient: Record<string, unknown>;
  consents: Record<string, unknown>[];
  photos: { kind: string; url: string }[]; // https: (blob) or data: (dev/pg)
}

const EXPIRY_MS = 24 * 60 * 60 * 1000;

export class BoothStoreError extends Error {
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
  const candidates = Object.keys(process.env).filter((k) =>
    /_READ_WRITE_TOKEN$|^BLOB_/.test(k)
  );
  throw new BoothStoreError(
    "not_configured",
    `Booth link storage is not configured. Connect Postgres or a Vercel Blob store to THIS project and redeploy. Blob-like env keys visible: ${
      candidates.length > 0 ? candidates.join(", ") : "none"
    }.`
  );
}

function asStoreError(err: unknown): BoothStoreError {
  if (err instanceof BoothStoreError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  return new BoothStoreError("store_error", `Blob operation failed: ${msg}`);
}

// --- dev file store (per-clinic subfolder) ----------------------------

const DEV_ROOT = join(process.cwd(), ".booth-dev-store");
const devDir = (clinicId: string) => join(DEV_ROOT, clinicId);

function devPut(clinicId: string, item: BoothItem) {
  const dir = devDir(clinicId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${item.id}.json`), JSON.stringify(item), "utf8");
}

function devList(clinicId: string): BoothItem[] {
  const dir = devDir(clinicId);
  if (!existsSync(dir)) return [];
  const items: BoothItem[] = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const item = JSON.parse(readFileSync(join(dir, f), "utf8")) as BoothItem;
      if (Date.now() - new Date(item.created_at).getTime() > EXPIRY_MS) {
        rmSync(join(dir, f), { force: true });
        continue;
      }
      items.push(item);
    } catch {
      rmSync(join(dir, f), { force: true });
    }
  }
  return items;
}

function devDelete(clinicId: string, id: string) {
  rmSync(join(devDir(clinicId), `${id}.json`), { force: true });
}

// --- Vercel Blob store (per-clinic paths) -----------------------------

function dataUrlToBuffer(dataUrl: string): { buf: Buffer; mime: string } {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) throw new BoothStoreError("store_error", "Invalid photo data URL.");
  return { buf: Buffer.from(m[2], "base64"), mime: m[1] };
}

function tok(token?: string): { token?: string } {
  return token ? { token } : {};
}

let storeAccess: "public" | "private" | undefined;

async function putAdaptive(
  pathname: string,
  body: Buffer | string,
  contentType: string,
  token?: string
) {
  const order: ("public" | "private")[] = storeAccess ? [storeAccess] : ["private", "public"];
  let lastErr: unknown;
  for (const access of order) {
    try {
      const blob = await put(pathname, body, {
        access,
        addRandomSuffix: false,
        contentType,
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

async function readBlobResponse(pathname: string, token?: string): Promise<Response | null> {
  const order: ("public" | "private")[] = storeAccess ? [storeAccess] : ["private", "public"];
  let lastErr: unknown = null;
  for (const access of order) {
    try {
      const res = await get(pathname, { access, ...tok(token) });
      if (!res) return null;
      storeAccess = access;
      return new Response(res.stream);
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr && isNotFound(lastErr)) return null;
  if (lastErr) throw lastErr;
  return null;
}

/**
 * Same-origin streaming for the photo route — clinic-scoped: the path must
 * live under this clinic's prefix, so one clinic cannot stream another's
 * booth photos even by guessing a path.
 */
export async function readBoothPhoto(
  clinicId: string,
  pathname: string
): Promise<Response | null> {
  if (!pathname.startsWith(`booth/${clinicId}/photos/`)) return null;
  const m = mode();
  if (m.kind !== "blob") return null;
  try {
    return await readBlobResponse(pathname, m.token);
  } catch (err) {
    throw asStoreError(err);
  }
}

function photoApiUrl(pathname: string): string {
  return `/api/booth/photo?path=${encodeURIComponent(pathname)}`;
}

const inboxPath = (clinicId: string) => `booth/${clinicId}/inbox.json`;

async function readInbox(clinicId: string, token?: string): Promise<BoothItem[]> {
  const res = await readBlobResponse(inboxPath(clinicId), token);
  if (!res) return [];
  try {
    const items = (await res.json()) as BoothItem[];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function writeInbox(clinicId: string, items: BoothItem[], token?: string): Promise<void> {
  await putAdaptive(inboxPath(clinicId), JSON.stringify(items), "application/json", token);
}

async function blobPut(
  clinicId: string,
  itemBase: Omit<BoothItem, "photos">,
  photos: BoothPhotoIn[],
  token?: string
): Promise<void> {
  const stored: { kind: string; url: string }[] = [];
  for (const photo of photos) {
    const { buf, mime } = dataUrlToBuffer(photo.dataUrl);
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const pathname = `booth/${clinicId}/photos/${itemBase.id}/${photo.kind}.${ext}`;
    await putAdaptive(pathname, buf, mime, token);
    stored.push({ kind: photo.kind, url: photoApiUrl(pathname) });
  }
  const item: BoothItem = { ...itemBase, photos: stored };
  const inbox = await readInbox(clinicId, token);
  const next = inbox.filter((i) => i.id !== item.id);
  next.push(item);
  await writeInbox(clinicId, next, token);
}

async function deletePhotos(clinicId: string, id: string, token?: string): Promise<void> {
  const photos = await list({ prefix: `booth/${clinicId}/photos/${id}/`, ...tok(token) });
  if (photos.blobs.length > 0) {
    await del(photos.blobs.map((b) => b.url), { ...tok(token) });
  }
}

async function blobList(clinicId: string, token?: string): Promise<BoothItem[]> {
  const inbox = await readInbox(clinicId, token);
  const fresh: BoothItem[] = [];
  const expired: BoothItem[] = [];
  for (const item of inbox) {
    if (Date.now() - new Date(item.created_at).getTime() > EXPIRY_MS) expired.push(item);
    else fresh.push(item);
  }
  if (expired.length > 0) {
    await writeInbox(clinicId, fresh, token);
    for (const item of expired) {
      try {
        await deletePhotos(clinicId, item.id, token);
      } catch {
        // best-effort
      }
    }
  }
  return fresh;
}

async function blobDelete(clinicId: string, id: string, token?: string): Promise<void> {
  const inbox = await readInbox(clinicId, token);
  const next = inbox.filter((i) => i.id !== id);
  if (next.length !== inbox.length) await writeInbox(clinicId, next, token);
  await deletePhotos(clinicId, id, token);
}

// --- Public API (all clinic-scoped) -----------------------------------

export async function putBoothItem(
  clinicId: string,
  itemBase: Omit<BoothItem, "photos">,
  photos: BoothPhotoIn[]
): Promise<void> {
  if (pgAvailable()) {
    try {
      const item: BoothItem = {
        ...itemBase,
        photos: photos.map((p) => ({ kind: p.kind, url: p.dataUrl })),
      };
      await pgUpsertBoothItem(clinicId, item.id, item.created_at, item);
      return;
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const m = mode();
  try {
    if (m.kind === "blob") {
      await blobPut(clinicId, itemBase, photos, m.token);
    } else {
      devPut(clinicId, {
        ...itemBase,
        photos: photos.map((p) => ({ kind: p.kind, url: p.dataUrl })),
      });
    }
  } catch (err) {
    throw asStoreError(err);
  }
}

export async function listBoothItems(clinicId: string): Promise<BoothItem[]> {
  if (pgAvailable()) {
    try {
      return await pgListBoothItems<BoothItem>(clinicId, EXPIRY_MS);
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const m = mode();
  try {
    return m.kind === "blob" ? await blobList(clinicId, m.token) : devList(clinicId);
  } catch (err) {
    throw asStoreError(err);
  }
}

export async function deleteBoothItem(clinicId: string, id: string): Promise<void> {
  if (pgAvailable()) {
    try {
      await pgDeleteBoothItem(clinicId, id);
      return;
    } catch (err) {
      throw asStoreError(err);
    }
  }
  const m = mode();
  try {
    if (m.kind === "blob") await blobDelete(clinicId, id, m.token);
    else devDelete(clinicId, id);
  } catch (err) {
    throw asStoreError(err);
  }
}

export function boothStorageInfo(): { mode: "pg" | "blob" | "dev" } {
  if (pgAvailable()) return { mode: "pg" };
  return { mode: mode().kind };
}
