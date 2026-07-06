/**
 * Anti-Aging Simulator prompts (T6) — ONE editable file, following the
 * templates.ts pattern. Two branches from the same front photo:
 *   A "natural"    — the untreated course at +5 / +10 / +20 / +30 years
 *   B "maintained" — the same ages with ongoing toxin / filler / skincare
 *
 * Tone target: quietly sobering and believable. If results read like an
 * "aging filter", soften the language here (this file is the only knob).
 */

export type AgingBranch = "natural" | "maintained";
export type AgingYears = 5 | 10 | 20 | 30;

const SHARED_GUARD = `Preserve exactly: the person's identity, facial structure and proportions, pose, camera angle, framing, hairstyle shape, clothing, lighting and background. The result must be unmistakably the SAME person, photographed the same way, simply older. Keep completely natural, realistic skin with visible pores; no blurring, no beautify filter, no stylization. Subtle and believable, never a caricature of aging. Photorealistic, consistent lighting, no artifacts.`;

const NATURAL: Record<AgingYears, string> = {
  5: `Edit this photograph to show the same person approximately 5 years older, following the natural, untreated course of facial aging. Apply subtle, realistic changes: early fine lines on the forehead and around the eyes becoming set at rest, a slightly deeper nasolabial fold, the very beginning of volume loss in the cheeks and temples, minimally duller and drier skin texture, and a barely perceptible softening along the jawline.`,
  10: `Edit this photograph to show the same person approximately 10 years older, following the natural, untreated course of facial aging. Apply realistic changes: established forehead and glabellar lines visible at rest, crow's feet, clearly deeper nasolabial folds, visible volume loss in the cheeks, temples and under-eye area giving a slightly hollowed look, mild jowling and softening of the jawline, thinner lips, and drier, more uneven skin tone with early sun damage.`,
  20: `Edit this photograph to show the same person approximately 20 years older, following the natural, untreated course of facial aging. Apply honest, substantial changes: deep static forehead and glabellar lines, pronounced crow's feet, deep nasolabial folds and emerging marionette lines, clear volume loss through the cheeks, temples and under-eye area, definite jowling that blurs the jawline, early loosening of the skin under the chin and on the neck, vertical lip lines with visibly thinner lips, slightly hooded upper eyelids, uneven pigmentation with sun spots, and hair with substantial graying while keeping the same hairstyle shape.`,
  30: `Edit this photograph to show the same person approximately 30 years older, following the natural, untreated course of facial aging into their senior years. Apply honest, significant changes while keeping them unmistakably the same person: deeply set lines across the forehead, between the brows and around the eyes and mouth, heavy nasolabial folds and marionette lines, marked loss of facial volume leaving the cheeks and temples hollowed, prominent jowls and loose, sagging skin along the jaw and neck, crepey skin texture on the cheeks and under the eyes, hooded upper eyelids, thin lips with vertical lines, scattered age spots and uneven tone, and largely gray or white hair in the same hairstyle shape.`,
};

const MAINTAINED: Record<AgingYears, string> = {
  5: `Edit this photograph to show the same person approximately 5 years older, but as someone who has maintained their skin with ongoing professional care over those years: regular botulinum toxin, judicious filler and medical skincare. They still look older, just gracefully: skin stays smooth, hydrated and even-toned with almost no set-in lines, mid-face volume is fully retained, the jawline stays defined. A rested, healthy, natural look; absolutely not frozen, shiny or overfilled.`,
  10: `Edit this photograph to show the same person approximately 10 years older, but as someone who has maintained their face with consistent professional aesthetic care over the decade: regular botulinum toxin, conservative filler replacing lost volume, and medical-grade skincare. They must look clearly and honestly 10 years older, yet aging softly: only faint expression lines, largely retained cheek and mid-face volume, a still-defined jawline with minimal jowling, and healthy, cared-for skin. Natural and believable; never frozen, waxy or overfilled.`,
  20: `Edit this photograph to show the same person approximately 20 years older, but as someone who has maintained their face with two decades of consistent professional aesthetic care: regular botulinum toxin, conservative volume replacement with filler, skin boosters and medical-grade skincare. They must look clearly and honestly 20 years older, with some graying of the hair in the same hairstyle shape, yet aged gracefully: soft rather than deep expression lines, well-preserved cheek and mid-face volume, a jawline that has softened only slightly, smooth and cared-for skin with even tone, and naturally mobile features. Elegant and believable; absolutely never frozen, waxy, shiny or overfilled.`,
  30: `Edit this photograph to show the same person approximately 30 years older, in their senior years, but as someone who has maintained their face with three decades of consistent professional aesthetic care: regular botulinum toxin, conservative filler, skin quality treatments and rigorous sun protection. They must look honestly 30 years older, with largely gray or silver hair in the same hairstyle shape and the natural features of an older person, yet visibly well-kept: lines that are present but soft rather than deeply carved, better-retained facial volume than an untreated face of the same age, a comparatively defined jawline with only mild loosening, and remarkably healthy, even-toned skin for their age. Dignified, elegant and believable; never frozen, pulled, waxy or overfilled.`,
};

export function agingPrompt(branch: AgingBranch, years: AgingYears): string {
  const body = branch === "natural" ? NATURAL[years] : MAINTAINED[years];
  return `${body}\n\n${SHARED_GUARD}`;
}

export const AGING_YEAR_STEPS: AgingYears[] = [5, 10, 20, 30];

export const AGING_VARIANTS: { branch: AgingBranch; years: AgingYears }[] =
  AGING_YEAR_STEPS.flatMap((years) => [
    { branch: "natural" as const, years },
    { branch: "maintained" as const, years },
  ]);

/** Deterministic IndexedDB key so cached variants survive reloads (offline booth insurance). */
export function timelineCacheKey(
  assetId: string,
  branch: AgingBranch,
  years: AgingYears
): string {
  return `tl_${assetId}_${branch}_${years}`;
}
