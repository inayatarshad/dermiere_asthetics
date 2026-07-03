/**
 * Sliders → prompt assembly (knowledge base / 05_ai-before-after.md §4–5).
 *
 * Sliders don't change the image directly — they tune the instruction.
 * Magnitude bands: 0–15 no change · 15–40 "very slightly" ·
 * 40–70 "moderately" · 70–100 "noticeably". Extremes stay word-capped so
 * results remain clinically plausible.
 */

import type { SliderDef, TreatmentTemplate } from "./types";

export function magnitudeBand(abs: number): string | null {
  if (abs < 15) return null;
  if (abs < 40) return "very slightly";
  if (abs < 70) return "moderately";
  return "noticeably";
}

export function phraseForSlider(
  def: SliderDef,
  value: number
): string | null {
  const abs = Math.abs(value);
  const band = magnitudeBand(abs);
  if (!band) return null;
  const phrase = value < 0 ? def.negPhrase : def.posPhrase;
  if (!phrase) return null;
  return `${band} ${phrase}`;
}

/** Comma-joined phrases from all non-neutral sliders, ending with a period. */
export function assembleSliderPhrases(
  schema: SliderDef[],
  params: Record<string, number>
): string {
  const phrases = schema
    .map((def) => phraseForSlider(def, params[def.key] ?? 0))
    .filter((p): p is string => p !== null);
  if (phrases.length === 0) return "";
  const joined = phrases.join(", ");
  return joined.charAt(0).toUpperCase() + joined.slice(1) + ".";
}

/** The full instruction sent to the identity-preserving image-edit model. */
export function assemblePrompt(
  template: TreatmentTemplate,
  params: Record<string, number>
): string {
  const phrases = assembleSliderPhrases(template.slider_schema, params);
  return template.prompt_template.replace(
    "{assembled_slider_phrases}",
    phrases || "Make only the most subtle natural refinement."
  );
}

export function hasActiveParams(
  schema: SliderDef[],
  params: Record<string, number>
): boolean {
  return schema.some((def) => Math.abs(params[def.key] ?? 0) >= 15);
}

/** Stable hash of params — used to cache generations per setting. */
export function paramsHash(
  procedure: string,
  params: Record<string, number>
): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${Math.round(v)}`)
    .join("|");
  return `${procedure}|${entries}`;
}
