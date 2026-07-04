/**
 * Anti-Aging Simulator prompts (T6) — ONE editable file, following the
 * templates.ts pattern. Two branches from the same front photo:
 *   A "natural"    — the untreated course at +5 / +10 years
 *   B "maintained" — the same ages with ongoing toxin / filler / skincare
 *
 * Tone target: quietly sobering and believable. If results read like an
 * "aging filter", soften the language here (this file is the only knob).
 */

export type AgingBranch = "natural" | "maintained";
export type AgingYears = 5 | 10;

const SHARED_GUARD = `Preserve exactly: the person's identity, facial structure and proportions, pose, camera angle, framing, hairstyle shape, clothing, lighting and background. The result must be unmistakably the SAME person, photographed the same way, simply older. Keep completely natural, realistic skin with visible pores; no blurring, no beautify filter, no stylization. Subtle and believable, never a caricature of aging. Photorealistic, consistent lighting, no artifacts.`;

const NATURAL: Record<AgingYears, string> = {
  5: `Edit this photograph to show the same person approximately 5 years older, following the natural, untreated course of facial aging. Apply subtle, realistic changes: early fine lines on the forehead and around the eyes becoming set at rest, a slightly deeper nasolabial fold, the very beginning of volume loss in the cheeks and temples, minimally duller and drier skin texture, and a barely perceptible softening along the jawline.`,
  10: `Edit this photograph to show the same person approximately 10 years older, following the natural, untreated course of facial aging. Apply realistic changes: established forehead and glabellar lines visible at rest, crow's feet, clearly deeper nasolabial folds, visible volume loss in the cheeks, temples and under-eye area giving a slightly hollowed look, mild jowling and softening of the jawline, thinner lips, and drier, more uneven skin tone with early sun damage.`,
};

const MAINTAINED: Record<AgingYears, string> = {
  5: `Edit this photograph to show the same person approximately 5 years older, but as someone who has maintained their skin with ongoing professional care over those years: regular botulinum toxin, judicious filler and medical skincare. They still look older, just gracefully: skin stays smooth, hydrated and even-toned with almost no set-in lines, mid-face volume is fully retained, the jawline stays defined. A rested, healthy, natural look; absolutely not frozen, shiny or overfilled.`,
  10: `Edit this photograph to show the same person approximately 10 years older, but as someone who has maintained their face with consistent professional aesthetic care over the decade: regular botulinum toxin, conservative filler replacing lost volume, and medical-grade skincare. They must look clearly and honestly 10 years older, yet aging softly: only faint expression lines, largely retained cheek and mid-face volume, a still-defined jawline with minimal jowling, and healthy, cared-for skin. Natural and believable; never frozen, waxy or overfilled.`,
};

export function agingPrompt(branch: AgingBranch, years: AgingYears): string {
  const body = branch === "natural" ? NATURAL[years] : MAINTAINED[years];
  return `${body}\n\n${SHARED_GUARD}`;
}

export const AGING_VARIANTS: { branch: AgingBranch; years: AgingYears }[] = [
  { branch: "natural", years: 5 },
  { branch: "maintained", years: 5 },
  { branch: "natural", years: 10 },
  { branch: "maintained", years: 10 },
];

/** Deterministic IndexedDB key so cached variants survive reloads (offline booth insurance). */
export function timelineCacheKey(
  assetId: string,
  branch: AgingBranch,
  years: AgingYears
): string {
  return `tl_${assetId}_${branch}_${years}`;
}
