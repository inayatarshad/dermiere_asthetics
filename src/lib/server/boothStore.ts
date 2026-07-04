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
import { put, del, list } from "@vercel/blob";

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

function mode(): "blob" | "dev" {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) return "dev";
  throw new BoothStoreError(
    "not_configured",
    "Booth link storage is not configured. Add the BLOB_READ_WRITE_TOKEN env var (Vercel: Storage, Create Blob store, connect to this project)."
  );
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

async function blobPut(
  itemBase: Omit<BoothItem, "photos">,
  photos: BoothPhotoIn[]
): Promise<void> {
  const stored: { kind: string; url: string }[] = [];
  for (const photo of photos) {
    const { buf, mime } = dataUrlToBuffer(photo.dataUrl);
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const blob = await put(
      `booth/photos/${itemBase.id}/${photo.kind}.${ext}`,
      buf,
      { access: "public", addRandomSuffix: false, contentType: mime }
    );
    stored.push({ kind: photo.kind, url: blob.url });
  }
  const item: BoothItem = { ...itemBase, photos: stored };
  await put(`booth/inbox/${itemBase.id}.json`, JSON.stringify(item), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

async function blobList(): Promise<BoothItem[]> {
  const { blobs } = await list({ prefix: "booth/inbox/", limit: 100 });
  const items: BoothItem[] = [];
  for (const b of blobs) {
    try {
      const res = await fetch(b.url, { cache: "no-store" });
      if (!res.ok) continue;
      const item = (await res.json()) as BoothItem;
      if (Date.now() - new Date(item.created_at).getTime() > EXPIRY_MS) {
        await blobDelete(item.id);
        continue;
      }
      items.push(item);
    } catch {
      // skip unreadable entries
    }
  }
  return items;
}

async function blobDelete(id: string): Promise<void> {
  const urls: string[] = [];
  const inbox = await list({ prefix: `booth/inbox/${id}` });
  urls.push(...inbox.blobs.map((b) => b.url));
  const photos = await list({ prefix: `booth/photos/${id}/` });
  urls.push(...photos.blobs.map((b) => b.url));
  if (urls.length > 0) await del(urls);
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

export async function putBoothItem(
  itemBase: Omit<BoothItem, "photos">,
  photos: BoothPhotoIn[]
): Promise<void> {
  if (mode() === "blob") {
    await blobPut(itemBase, photos);
  } else {
    devPut({
      ...itemBase,
      photos: photos.map((p) => ({ kind: p.kind, url: p.dataUrl })),
    });
  }
}

export async function listBoothItems(): Promise<BoothItem[]> {
  return mode() === "blob" ? blobList() : devList();
}

export async function deleteBoothItem(id: string): Promise<void> {
  if (mode() === "blob") await blobDelete(id);
  else devDelete(id);
}

export function boothStorageInfo(): { mode: "blob" | "dev" } {
  return { mode: mode() };
}
