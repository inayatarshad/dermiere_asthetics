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

export async function generateAfterImage(
  beforeSrc: string,
  prompt: string,
  cacheKey: string,
  procedure: string
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
      body: JSON.stringify({ imageDataUrl, prompt, procedure }),
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
