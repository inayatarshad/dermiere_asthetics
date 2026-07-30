/**
 * Dose quantification - turns visualization slider settings into the
 * clinical quantity conversation: "move it this much" → "that is about
 * 0.8–1.0 ml of filler" or "that outcome is a 6-session course".
 *
 * Estimates are planning guidance, not prescriptions: the practitioner
 * confirms the final dose in the room. Botox is intentionally absent -
 * it has its own per-zone unit planner (botoxUnits.ts).
 */

import { getTemplate } from "./templates";
import { findTreatment } from "./capture/kb";

/** Typical full-correction volumes per filler template (total ml). */
const FILLER_MAX_ML: Record<string, number> = {
  lip_filler: 1.4,
  chin_filler: 2.0,
  cheek_filler: 2.4,
  tear_trough: 1.0,
  nasolabial_filler: 1.6,
  jawline_filler: 3.0,
  temple_filler: 1.6,
  liquid_rhino: 0.8,
};

export interface DoseEstimate {
  kind: "filler" | "course";
  /** short line for the UI, e.g. "≈ 0.8–1.0 ml filler" */
  line: string;
  /** longer sentence for the plan item */
  detail: string;
}

/** Mean absolute magnitude (0..1) of the sliders that belong to a template. */
function magnitudeFor(templateId: string, params: Record<string, number>): number {
  const template = getTemplate(templateId);
  if (!template) return 0;
  const keys = template.slider_schema.map((s) => s.key);
  const values = keys
    .map((k) => params[k])
    .filter((v): v is number => typeof v === "number" && Math.abs(v) >= 5);
  if (values.length === 0) return 0;
  const mean =
    values.reduce((sum, v) => sum + Math.abs(v), 0) / values.length / 100;
  return Math.min(1, mean);
}

/**
 * Estimate for one template given the current visualization params.
 * Returns null when there is nothing meaningful to quantify (no sliders
 * moved, or the template has no dose model).
 */
export function estimateDose(
  templateId: string | null | undefined,
  params: Record<string, number>
): DoseEstimate | null {
  if (!templateId) return null;
  const magnitude = magnitudeFor(templateId, params);
  if (magnitude === 0) return null;

  // Dermal fillers: magnitude → ml band
  const maxMl = FILLER_MAX_ML[templateId];
  if (maxMl) {
    const mid = magnitude * maxMl;
    const lo = Math.max(0.1, Math.round(mid * 0.85 * 10) / 10);
    const hi = Math.max(lo + 0.1, Math.round(mid * 1.15 * 10) / 10);
    return {
      kind: "filler",
      line: `≈ ${lo.toFixed(1)}–${hi.toFixed(1)} ml filler`,
      detail: `Estimated product for the visualized correction: about ${lo.toFixed(1)}–${hi.toFixed(1)} ml, staged as the practitioner advises. Confirmed at treatment.`,
    };
  }

  // CAPTURE signature treatments: magnitude → recommended course length
  const treatment = findTreatment(templateId);
  if (treatment?.courseSessions) {
    const sessions =
      magnitude >= 0.65
        ? treatment.courseSessions
        : magnitude >= 0.35
          ? Math.max(3, Math.round(treatment.courseSessions * 0.66))
          : Math.max(2, Math.round(treatment.courseSessions * 0.5));
    const full = sessions === treatment.courseSessions;
    return {
      kind: "course",
      line: `≈ ${sessions}-session course`,
      detail: full
        ? `The visualized outcome maps to the full ${treatment.courseSessions}-session course${treatment.coursePricePkr ? ` (Rs. ${treatment.coursePricePkr.toLocaleString("en-PK")})` : ""}.`
        : `The visualized outcome maps to roughly ${sessions} sessions; the full ${treatment.courseSessions}-session course${treatment.coursePricePkr ? ` (Rs. ${treatment.coursePricePkr.toLocaleString("en-PK")})` : ""} gives the complete result.`,
    };
  }

  return null;
}
