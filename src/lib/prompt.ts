/**
 * Sliders → prompt assembly (knowledge base / 05_ai-before-after.md §4–5).
 *
 * Sliders don't change the image directly - they tune the instruction.
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
  // on/off choices (bandless) read as instructions, not graded changes
  return def.bandless ? phrase : `${band} ${phrase}`;
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

// ---------------------------------------------------------------------
// Multi-procedure prompt assembly (T2): several treatments, ONE combined
// instruction with ONE merged preservation footer. A single active
// template returns assemblePrompt() output byte-identical, so the
// single-procedure pipeline (and its cache) is untouched.
// ---------------------------------------------------------------------

/** Area-scoping language per procedure, used in the labeled blocks. */
const AREA_SCOPE: Record<string, string> = {
  rhinoplasty: "the nose",
  lip_filler: "the lips and immediate perioral area",
  chin_filler: "the chin and lower jawline",
  botox:
    "the specific botox treatment areas described, as settled about two weeks after injection",
  hair_transplant:
    "the hair, hairline and scalp, shown fully grown in about 12 months after a hair transplant",
};

const MULTI_OPENING =
  "Edit ONLY the following facial areas to visualize the combined, fully settled result of these aesthetic treatments:";

const MULTI_FOOTER = `Preserve exactly, with no changes: the person's identity, every untreated facial feature, natural skin tone and texture with visible pores (do NOT blur, airbrush or beautify the whole face; only the specific changes described above), facial proportions, hairstyle, lighting, camera angle, and background. The result must look like the SAME person with every described change healed and fully settled: natural, proportionate and believable, never overfilled, frozen or artificial. Photorealistic, consistent lighting, no artifacts.`;

/**
 * Combined instruction for the active templates. Templates whose sliders
 * are all neutral are skipped; if exactly one template remains active the
 * output is byte-identical to assemblePrompt for that template.
 */
export function assembleMultiPrompt(
  templates: TreatmentTemplate[],
  params: Record<string, number>
): string {
  const withPhrases = templates
    .map((t) => ({ t, phrases: assembleSliderPhrases(t.slider_schema, params) }))
    .filter((x) => x.phrases.length > 0);

  if (withPhrases.length === 0) {
    // nothing active: fall back to the primary's own template (neutral copy)
    return templates.length > 0 ? assemblePrompt(templates[0], params) : "";
  }
  if (withPhrases.length === 1) {
    return assemblePrompt(withPhrases[0].t, params);
  }

  const blocks = withPhrases.map(({ t, phrases }) => {
    const scope = AREA_SCOPE[t.id] ?? `the ${t.region.replace(/_/g, " ")} area`;
    return `${t.name.toUpperCase()} (edit ${scope}): ${phrases}`;
  });

  return `${MULTI_OPENING}\n\n${blocks.join("\n\n")}\n\n${MULTI_FOOTER}`;
}

/** Stable hash of params - used to cache generations per setting. */
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
