"use client";

/**
 * Client side of the AI before/after loop: caches generations by params hash
 * (revisiting a setting is instant) and reports precise, human-readable
 * failure reasons so the UI can fall back to the on-device simulation.
 */

import { toModelInput } from "./img";

export interface GenerateSuccess {
  ok: true;
  imageDataUrl: string;
  model: string;
  provider: string;
}

export interface GenerateFailure {
  ok: false;
  code: string;
  message: string;
}

export type GenerateOutcome = GenerateSuccess | GenerateFailure;

const cache = new Map<string, GenerateSuccess>();

export function cachedGeneration(key: string): GenerateSuccess | undefined {
  return cache.get(key);
}

/** Stable cache-key fragment for the admin model choices. */
export function modelsKey(models?: Record<string, string>): string {
  const entries = Object.entries(models ?? {}).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return entries.length === 0
    ? "default"
    : entries.map(([k, v]) => `${k}:${v}`).join(",");
}

export async function generateAfterImage(
  beforeSrc: string,
  prompt: string,
  cacheKey: string,
  procedure: string,
  /** Admin-selected provider; omit or "auto" for server auto-detect. */
  provider?: string,
  /** Admin-selected model per provider (Settings model picker). */
  models?: Record<string, string>
): Promise<GenerateOutcome> {
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  let imageDataUrl: string;
  try {
    imageDataUrl = await toModelInput(beforeSrc);
  } catch {
    return {
      ok: false,
      code: "image_load_failed",
      message: "Could not load the before photo.",
    };
  }

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl,
        prompt,
        procedure,
        provider: provider && provider !== "auto" ? provider : undefined,
        models:
          models && Object.keys(models).length > 0 ? models : undefined,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      image?: string;
      model?: string;
      provider?: string;
      error?: string;
      message?: string;
    };
    if (!res.ok || !data.image) {
      return {
        ok: false,
        code: data.error ?? `http_${res.status}`,
        message:
          data.message ?? "The AI service could not generate this preview.",
      };
    }
    const success: GenerateSuccess = {
      ok: true,
      imageDataUrl: data.image,
      model: data.model ?? "unknown",
      provider: data.provider ?? "unknown",
    };
    cache.set(cacheKey, success);
    return success;
  } catch {
    return {
      ok: false,
      code: "network",
      message: "Could not reach the AI service. Check the connection.",
    };
  }
}
