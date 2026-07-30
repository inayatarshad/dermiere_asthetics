/**
 * Device-local image storage. Structured records live in the zustand store
 * (localStorage); images are far too large for that, so they live in
 * IndexedDB keyed by asset id. Asset.storage_url of the form "idb:<key>"
 * resolves here; anything else is treated as a URL/public path.
 */

import { get, set, del } from "idb-keyval";

const memoryCache = new Map<string, string>(); // key -> object URL

export async function saveImage(key: string, blob: Blob): Promise<string> {
  await set(`img:${key}`, blob);
  return `idb:${key}`;
}

export async function deleteImage(key: string) {
  const url = memoryCache.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    memoryCache.delete(key);
  }
  await del(`img:${key}`);
}

/** Resolve an Asset.storage_url to something an <img> can display. */
export async function resolveImageUrl(
  storageUrl: string
): Promise<string | null> {
  if (!storageUrl.startsWith("idb:")) return storageUrl;
  const key = storageUrl.slice(4);
  const cached = memoryCache.get(key);
  if (cached) return cached;
  const blob = (await get(`img:${key}`)) as Blob | undefined;
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  memoryCache.set(key, url);
  return url;
}

/** Landmark cache - computed once per photo, reused by canvas + warp. */
export async function saveLandmarks(assetId: string, landmarks: number[][]) {
  await set(`lm:${assetId}`, landmarks);
}

export async function loadLandmarks(
  assetId: string
): Promise<number[][] | null> {
  const lm = (await get(`lm:${assetId}`)) as number[][] | undefined;
  return lm ?? null;
}

/** Small JSON cache (multi-view depth metadata etc.). */
export async function saveJson(key: string, value: unknown) {
  await set(`json:${key}`, value);
}

export async function loadJson<T>(key: string): Promise<T | null> {
  const v = (await get(`json:${key}`)) as T | undefined;
  return v ?? null;
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}
