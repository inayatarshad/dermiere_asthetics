/**
 * Booth inbox storage (T1) — demo-grade, deliberately NOT a backend
 * migration. One env var on Vercel: BLOB_READ_WRITE_TOKEN.
 *
 * Modes:
 *  - Vercel Blob (token present): photos as public-but-unguessable blobs
 *    under booth/photos/{id}/, a small JSON item per patient under
 *    booth/inbox/{id}.json. localStorage remains the source of truth per
 *    device; this is only the courier between phone and booth screen.
 *  - Dev file store (no token, local dev): JSON files with embedded data
 *    URLs under .booth-dev-store/ so the whole flow is testable offline.
 *  - Production without a token: explicit 501-style coded error.
 *
 * Items expire after 24h (privacy) and are deleted lazily on pull.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { put, del, list, get } from "@vercel/blob";

export interface BoothPhotoIn {
  kind: string; // photo_front | photo_left | photo_right
  dataUrl: string;
}

export interface BoothItem {
  id: string;
  created_at: string;
  patient: Record<string, unknown>;
  consents: Record<string, unknown>[];
  photos: { kind: string; url: string }[]; // https: (blob) or data: (dev)
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

/**
 * Find the Blob read-write token. Vercel's store-connect dialog allows a
 * custom env prefix, so the variable is not always literally
 * BLOB_READ_WRITE_TOKEN — accept any *_READ_WRITE_TOKEN that carries a
 * Vercel Blob token value, and pass it explicitly to the SDK.
 */
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
  // Newer Vercel connect flows attach the store via BLOB_STORE_ID and
  // platform-issued credentials (no static token env). Recent @vercel/blob
  // SDKs resolve those automatically on Vercel, so run token-less.
  if (process.env.BLOB_STORE_ID && process.env.VERCEL) {
    return { kind: "blob" };
  }
  if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
    return { kind: "dev" };
  }
  // diagnostics: name (never value) of candidate keys, to debug connects
  const candidates = Object.keys(process.env).filter((k) =>
    /_READ_WRITE_TOKEN$|^BLOB_/.test(k)
  );
  throw new BoothStoreError(
    "not_configured",
    `Booth link storage is not configured. Connect a Vercel Blob store to THIS project (Storage tab) and redeploy. Blob-like env keys visible to the runtime: ${
      candidates.length > 0 ? candidates.join(", ") : "none"
    }.`
  );
}

/** Wrap SDK failures so routes forward a diagnosable message. */
function asStoreError(err: unknown): BoothStoreError {
  if (err instanceof BoothStoreError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  return new BoothStoreError("store_error", `Blob operation failed: ${msg}`);
}

// ---------------------------------------------------------------------
// Dev file store
// ---------------------------------------------------------------------

const DEV_DIR = join(process.cwd(), ".booth-dev-store");

function devPut(item: BoothItem) {
  mkdirSync(DEV_DIR, { recursive: true });
  writeFileSync(join(DEV_DIR, `${item.id}.json`), JSON.stringify(item), "utf8");
}

function devList(): BoothItem[] {
  if (!existsSync(DEV_DIR)) return [];
  const items: BoothItem[] = [];
  for (const f of readdirSync(DEV_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const item = JSON.parse(readFileSync(join(DEV_DIR, f), "utf8")) as BoothItem;
      if (Date.now() - new Date(item.created_at).getTime() > EXPIRY_MS) {
        rmSync(join(DEV_DIR, f), { force: true });
        continue;
      }
      items.push(item);
    } catch {
      // unreadable item: drop it
      rmSync(join(DEV_DIR, f), { force: true });
    }
  }
  return items;
}

function devDelete(id: string) {
  rmSync(join(DEV_DIR, `${id}.json`), { force: true });
}

// ---------------------------------------------------------------------
// Vercel Blob store
// ---------------------------------------------------------------------

function dataUrlToBuffer(dataUrl: string): { buf: Buffer; mime: string } {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) throw new BoothStoreError("store_error", "Invalid photo data URL.");
  return { buf: Buffer.from(m[2], "base64"), mime: m[1] };
}

/** SDK option bag: explicit token when we have one, platform auth otherwise. */
function tok(token?: string): { token?: string } {
  return token ? { token } : {};
}

/**
 * Stores can be created as PUBLIC or PRIVATE (the current Vercel default).
 * We prefer private (medical photos) and adapt at runtime: the first
 * successful operation pins the store's access mode for this instance.
 * Photos are never exposed by URL; the /api/booth/photo route streams them
 * same-origin after validating the path.
 */
let storeAccess: "public" | "private" | undefined;

async function putAdaptive(
  pathname: string,
  body: Buffer | string,
  contentType: string,
  token?: string
) {
  const order: ("public" | "private")[] = storeAccess
    ? [storeAccess]
    : ["private", "public"];
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

async function readBlobResponse(
  pathname: string,
  token?: string
): Promise<Response | null> {
  const order: ("public" | "private")[] = storeAccess
    ? [storeAccess]
    : ["private", "public"];
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
  if (lastErr) throw lastErr;
  return null;
}

/** Same-origin streaming for the photo route. */
export async function readBoothPhoto(
  pathname: string
): Promise<Response | null> {
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

/**
 * The inbox is ONE blob (booth/inbox.json = BoothItem[]): the desk polls
 * it, and the previous per-item layout cost 1 list + N reads per poll —
 * that pattern exhausted the plan's operation quota in hours. One array
 * blob = exactly one read per poll and zero list calls. Photos stay as
 * separate private blobs (binary, streamed on merge only).
 * Read-modify-write can lose a concurrent push in the same instant;
 * acceptable for a single booth phone, removed for real by the Postgres
 * step in SCALABILITY_ROADMAP.md.
 */
const INBOX_PATH = "booth/inbox.json";

async function readInbox(token?: string): Promise<BoothItem[]> {
  const res = await readBlobResponse(INBOX_PATH, token);
  if (!res) return [];
  try {
    const items = (await res.json()) as BoothItem[];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function writeInbox(items: BoothItem[], token?: string): Promise<void> {
  await putAdaptive(INBOX_PATH, JSON.stringify(items), "application/json", token);
}

async function blobPut(
  itemBase: Omit<BoothItem, "photos">,
  photos: BoothPhotoIn[],
  token?: string
): Promise<void> {
  const stored: { kind: string; url: string }[] = [];
  for (const photo of photos) {
    const { buf, mime } = dataUrlToBuffer(photo.dataUrl);
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const pathname = `booth/photos/${itemBase.id}/${photo.kind}.${ext}`;
    await putAdaptive(pathname, buf, mime, token);
    // same-origin API path, streamed with store credentials on demand
    stored.push({ kind: photo.kind, url: photoApiUrl(pathname) });
  }
  const item: BoothItem = { ...itemBase, photos: stored };
  const inbox = await readInbox(token);
  const next = inbox.filter((i) => i.id !== item.id);
  next.push(item);
  await writeInbox(next, token);
}

async function deletePhotos(id: string, token?: string): Promise<void> {
  const photos = await list({ prefix: `booth/photos/${id}/`, ...tok(token) });
  if (photos.blobs.length > 0) {
    await del(photos.blobs.map((b) => b.url), { ...tok(token) });
  }
}

async function blobList(token?: string): Promise<BoothItem[]> {
  const inbox = await readInbox(token);
  const fresh: BoothItem[] = [];
  const expired: BoothItem[] = [];
  for (const item of inbox) {
    if (Date.now() - new Date(item.created_at).getTime() > EXPIRY_MS) {
      expired.push(item);
    } else {
      fresh.push(item);
    }
  }
  if (expired.length > 0) {
    await writeInbox(fresh, token);
    for (const item of expired) {
      try {
        await deletePhotos(item.id, token);
      } catch {
        // photo cleanup is best-effort; the inbox entry is already gone
      }
    }
  }
  return fresh;
}

async function blobDelete(id: string, token?: string): Promise<void> {
  const inbox = await readInbox(token);
  const next = inbox.filter((i) => i.id !== id);
  if (next.length !== inbox.length) await writeInbox(next, token);
  await deletePhotos(id, token);
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

export async function putBoothItem(
  itemBase: Omit<BoothItem, "photos">,
  photos: BoothPhotoIn[]
): Promise<void> {
  const m = mode();
  try {
    if (m.kind === "blob") {
      await blobPut(itemBase, photos, m.token);
    } else {
      devPut({
        ...itemBase,
        photos: photos.map((p) => ({ kind: p.kind, url: p.dataUrl })),
      });
    }
  } catch (err) {
    throw asStoreError(err);
  }
}

export async function listBoothItems(): Promise<BoothItem[]> {
  const m = mode();
  try {
    return m.kind === "blob" ? await blobList(m.token) : devList();
  } catch (err) {
    throw asStoreError(err);
  }
}

export async function deleteBoothItem(id: string): Promise<void> {
  const m = mode();
  try {
    if (m.kind === "blob") await blobDelete(id, m.token);
    else devDelete(id);
  } catch (err) {
    throw asStoreError(err);
  }
}

export function boothStorageInfo(): { mode: "blob" | "dev" } {
  return { mode: mode().kind };
}
