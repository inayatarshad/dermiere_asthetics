"use client";

/**
 * Assessment geometry engine - the deterministic half of the Aesthetic
 * Assessment Report (spec: Contour-AI-Aesthetic-Report-Module-SPEC.md).
 *
 * Every proportion metric is computed as REAL geometry from the MediaPipe
 * landmarks we already fit for the 3D canvas - never asked of a generative
 * model - so the same photo always yields the same numbers, and the
 * numbers are defensible in front of a clinician. Ideals are gender-aware:
 * the classical/golden-ratio lens for women (lip 1:1.6, Φ face ratio,
 * tapered jaw), masculine standards for men (stronger jaw:cheek, fuller
 * chin third, flatter canthal tilt). Framing is strengths-first per the
 * spec's wellbeing guardrail: alignments, not flaws.
 */

import type { TreatmentTemplate } from "../types";

// MediaPipe FaceMesh canonical indices used by the metric suite
export const LM = {
  foreheadTop: 10,
  glabella: 9,
  nasion: 168,
  subnasale: 2,
  menton: 152,
  faceR: 234,
  faceL: 454,
  eyeROuter: 33,
  eyeRInner: 133,
  eyeLInner: 362,
  eyeLOuter: 263,
  alarR: 129,
  alarL: 358,
  lipTop: 0,
  lipUpperInner: 13,
  lipLowerInner: 14,
  lipBottom: 17,
  mouthR: 61,
  mouthL: 291,
  browR: 105,
  browL: 334,
  lidR: 159,
  lidL: 386,
  jawR: 58,
  jawL: 288,
} as const;

export type Sex = "female" | "male";

export interface MetricResult {
  id: string;
  label: string;
  /** Human-readable measured value, e.g. "1 : 1.42" */
  value: string;
  /** The reference ideal for this patient's standard, e.g. "1 : 1.6 (Φ)" */
  ideal: string;
  /** 0..100 - how closely the measurement sits to the reference */
  alignment: number;
  /** Strengths-first, single sentence */
  insight: string;
  /** Template ids this metric can motivate (controlled menu only) */
  recommends: string[];
}

export interface GeometryAssessment {
  sex: Sex;
  /** Weighted composite 0..100 - the "Golden Balance" headline */
  balanceScore: number;
  metrics: MetricResult[];
}

type Pt = { x: number; y: number };

function pt(lm: number[][], i: number, w: number, h: number): Pt {
  return { x: lm[i][0] * w, y: lm[i][1] * h };
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** 0..100 closeness of measured to ideal, with tolerance = full credit band. */
function closeness(measured: number, ideal: number, tolerance: number): number {
  const dev = Math.abs(measured - ideal);
  if (dev <= tolerance) return 100;
  const span = ideal * 0.45; // beyond ~45% off, alignment bottoms out
  return Math.max(0, Math.round(100 * (1 - (dev - tolerance) / span)));
}

const f1 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export function computeGeometry(
  landmarks: number[][],
  width: number,
  height: number,
  sex: Sex
): GeometryAssessment {
  const P = (i: number) => pt(landmarks, i, width, height);
  const F = sex === "female";
  const metrics: MetricResult[] = [];

  // ---- 1. Facial thirds --------------------------------------------------
  {
    const t1 = P(LM.glabella).y - P(LM.foreheadTop).y;
    const t2 = P(LM.subnasale).y - P(LM.glabella).y;
    const t3 = P(LM.menton).y - P(LM.subnasale).y;
    const total = Math.max(1, t1 + t2 + t3);
    const parts = [t1, t2, t3].map((t) => (t / total) * 100);
    const maxDev = Math.max(...parts.map((p) => Math.abs(p - 33.33)));
    const alignment = closeness(maxDev, 0, 2.5);
    const dominant =
      parts[2] > 36 ? "lower" : parts[0] > 36 ? "upper" : parts[1] > 36 ? "mid" : null;
    metrics.push({
      id: "thirds",
      label: "Facial thirds",
      value: `${parts.map((p) => Math.round(p)).join(" / ")}%`,
      ideal: "33 / 33 / 33%",
      alignment,
      insight:
        alignment >= 85
          ? "Vertical proportions sit close to the classical equal thirds."
          : dominant === "lower"
            ? "The lower third carries extra height; balancing focus draws the eye upward."
            : dominant === "upper"
              ? "The upper third leads; brow-area harmonising can rebalance the frame."
              : "The mid-face leads slightly; cheek and lip support can restore the classical rhythm.",
      recommends: dominant === "lower" ? [] : dominant ? ["botox"] : [],
    });
  }

  // ---- 2. Facial fifths ----------------------------------------------------
  {
    const xs = [
      P(LM.faceR).x,
      P(LM.eyeROuter).x,
      P(LM.eyeRInner).x,
      P(LM.eyeLInner).x,
      P(LM.eyeLOuter).x,
      P(LM.faceL).x,
    ];
    const total = Math.max(1, xs[5] - xs[0]);
    const parts = [];
    for (let i = 0; i < 5; i++) parts.push(((xs[i + 1] - xs[i]) / total) * 100);
    const maxDev = Math.max(...parts.map((p) => Math.abs(p - 20)));
    const alignment = closeness(maxDev, 0, 2.5);
    metrics.push({
      id: "fifths",
      label: "Facial fifths",
      value: `${parts.map((p) => Math.round(p)).join(" / ")}%`,
      ideal: "5 × 20%",
      alignment,
      insight:
        alignment >= 85
          ? "Horizontal spacing follows the classical five equal segments."
          : "One horizontal segment leads the classical five-part rhythm - mostly a framing observation, not a treatment target.",
      recommends: [],
    });
  }

  // ---- 3. Symmetry ---------------------------------------------------------
  {
    const midX =
      (P(LM.nasion).x + P(LM.subnasale).x + P(LM.menton).x) / 3;
    const pairs: [number, number][] = [
      [LM.eyeROuter, LM.eyeLOuter],
      [LM.eyeRInner, LM.eyeLInner],
      [LM.mouthR, LM.mouthL],
      [LM.alarR, LM.alarL],
      [LM.jawR, LM.jawL],
      [LM.browR, LM.browL],
    ];
    const faceW = dist(P(LM.faceR), P(LM.faceL));
    let se = 0;
    for (const [r, l] of pairs) {
      const rp = P(r);
      const lp = P(l);
      const mirroredX = 2 * midX - rp.x;
      se += ((mirroredX - lp.x) / faceW) ** 2 + ((rp.y - lp.y) / faceW) ** 2;
    }
    const rms = Math.sqrt(se / pairs.length);
    const score = Math.max(0, Math.round(100 * (1 - rms * 9)));
    metrics.push({
      id: "symmetry",
      label: "Symmetry",
      value: `${score}%`,
      ideal: "≥ 90%",
      alignment: score,
      insight:
        score >= 90
          ? "Left-right balance is a clear strength of this face."
          : score >= 80
            ? "Natural, characterful asymmetry within the range of most faces."
            : "A gentle left-right difference that targeted volume placement can soften.",
      recommends: score < 80 ? ["chin_filler", "lip_filler"] : [],
    });
  }

  // ---- 4. Lip ratio (golden 1:1.618 for women) ----------------------------
  {
    const upper = Math.max(
      1,
      P(LM.lipUpperInner).y - P(LM.lipTop).y
    );
    const lower = Math.max(1, P(LM.lipBottom).y - P(LM.lipLowerInner).y);
    const ratio = lower / upper;
    const ideal = F ? 1.618 : 1.15;
    const alignment = closeness(ratio, ideal, 0.12);
    metrics.push({
      id: "lip_ratio",
      label: "Lip ratio (upper : lower)",
      value: `1 : ${f1(ratio)}`,
      ideal: F ? "1 : 1.62 (Φ)" : "1 : 1.15",
      alignment,
      insight:
        alignment >= 85
          ? F
            ? "The upper-to-lower lip balance already sits near the golden ratio."
            : "Lip balance sits within the masculine ideal band."
          : ratio > ideal
            ? "The lower lip leads; a touch of upper-lip definition would meet the classical balance."
            : "The upper lip leads slightly; subtle lower-lip volume would complete the golden balance.",
      recommends: alignment < 85 ? ["lip_filler"] : [],
    });
  }

  // ---- 5. Canthal tilt ------------------------------------------------------
  {
    const tilt = (outer: Pt, inner: Pt) =>
      (Math.atan2(inner.y - outer.y, Math.abs(outer.x - inner.x)) * 180) /
      Math.PI;
    const right = tilt(P(LM.eyeROuter), P(LM.eyeRInner));
    const left = tilt(P(LM.eyeLOuter), P(LM.eyeLInner));
    const avg = (right + left) / 2;
    const ideal = F ? 6 : 3;
    const alignment = closeness(avg, ideal, 2.5);
    metrics.push({
      id: "canthal",
      label: "Canthal tilt",
      value: `${f1(avg)}°`,
      ideal: F ? "+5–8°" : "+2–4°",
      alignment,
      insight:
        avg >= ideal - 2.5
          ? "A naturally lifted eye axis - a widely admired feature."
          : "A flatter eye axis; a chemical brow lift opens and lifts the outer eye area without surgery.",
      recommends: avg < ideal - 2.5 ? ["botox"] : [],
    });
  }

  // ---- 6. Jaw : cheek width -------------------------------------------------
  {
    const jaw = dist(P(LM.jawR), P(LM.jawL));
    const cheek = Math.max(1, dist(P(LM.faceR), P(LM.faceL)));
    const ratio = jaw / cheek;
    const ideal = F ? 0.85 : 0.97;
    const alignment = closeness(ratio, ideal, 0.05);
    metrics.push({
      id: "jaw_cheek",
      label: "Jaw : cheekbone width",
      value: f1(ratio),
      ideal: F ? "≈ 0.85 (tapered)" : "≈ 0.97 (defined)",
      alignment,
      insight:
        alignment >= 85
          ? F
            ? "A tapered lower face that matches the classical feminine heart shape."
            : "Strong jaw-to-cheek proportion in the masculine ideal band."
          : F && ratio > ideal
            ? "A fuller lower-face width; masseter slimming refines it toward the classical taper without surgery."
            : "A lighter jawline relative to the cheekbones; structural chin/jaw support adds definition.",
      recommends:
        alignment >= 85 ? [] : F && ratio > ideal ? ["botox"] : ["chin_filler"],
    });
  }

  // ---- 7. Lower-third balance (subnasale→lips vs lips→chin, ideal 1:2) ----
  {
    const stomion = (P(LM.lipUpperInner).y + P(LM.lipLowerInner).y) / 2;
    const top = Math.max(1, stomion - P(LM.subnasale).y);
    const bottom = Math.max(1, P(LM.menton).y - stomion);
    const ratio = top / bottom;
    const alignment = closeness(ratio, 0.5, 0.06);
    metrics.push({
      id: "lower_third",
      label: "Lower-third balance",
      value: `1 : ${f1(1 / Math.max(0.2, ratio))}`,
      ideal: "1 : 2",
      alignment,
      insight:
        alignment >= 85
          ? "The lip-to-chin proportion follows the classical one-to-two rhythm."
          : ratio > 0.5
            ? "The chin reads slightly short of the classical proportion; structural chin support restores the line."
            : "A generous chin third - a strength that filler work elsewhere should respect.",
      recommends: alignment < 85 && ratio > 0.5 ? ["chin_filler"] : [],
    });
  }

  // ---- 8. Nose width vs intercanthal ---------------------------------------
  {
    const alar = dist(P(LM.alarR), P(LM.alarL));
    const inter = Math.max(1, dist(P(LM.eyeRInner), P(LM.eyeLInner)));
    const ratio = alar / inter;
    const ideal = F ? 0.98 : 1.05;
    const alignment = closeness(ratio, ideal, 0.08);
    metrics.push({
      id: "nose_width",
      label: "Nasal base width",
      value: `${f1(ratio)}× intercanthal`,
      ideal: "≈ 1.0×",
      alignment,
      insight:
        alignment >= 85
          ? "Nasal base width sits in classical proportion to the eyes."
          : ratio > ideal
            ? "The nasal base reads slightly wide of the intercanthal line - a refinement consult can review options."
            : "A narrow nasal base - typically an asset for facial harmony.",
      recommends: alignment < 85 && ratio > ideal ? ["rhinoplasty"] : [],
    });
  }

  // ---- 9. Face length : width (Φ for women) --------------------------------
  {
    const len = dist(P(LM.foreheadTop), P(LM.menton));
    const wid = Math.max(1, dist(P(LM.faceR), P(LM.faceL)));
    const ratio = len / wid;
    const ideal = F ? 1.618 : 1.5;
    const alignment = closeness(ratio, ideal, 0.09);
    metrics.push({
      id: "face_ratio",
      label: "Face length : width",
      value: f1(ratio),
      ideal: F ? "1.62 (Φ)" : "≈ 1.50",
      alignment,
      insight:
        alignment >= 85
          ? F
            ? "The overall frame sits remarkably close to the golden ratio."
            : "The overall frame sits in the masculine ideal band."
          : ratio < ideal
            ? "A broader frame; vertical emphasis (chin, mid-face definition) lengthens the read."
            : "An elongated frame; horizontal softness (cheek, jaw balance) widens the read.",
      recommends: [],
    });
  }

  // ---- composite ------------------------------------------------------------
  const WEIGHTS: Record<string, number> = F
    ? {
        symmetry: 0.2,
        lip_ratio: 0.15,
        face_ratio: 0.13,
        thirds: 0.12,
        canthal: 0.1,
        fifths: 0.1,
        jaw_cheek: 0.08,
        lower_third: 0.07,
        nose_width: 0.05,
      }
    : {
        jaw_cheek: 0.2,
        symmetry: 0.18,
        lower_third: 0.14,
        thirds: 0.13,
        face_ratio: 0.12,
        fifths: 0.08,
        canthal: 0.06,
        lip_ratio: 0.05,
        nose_width: 0.04,
      };
  let score = 0;
  let wsum = 0;
  for (const m of metrics) {
    const w = WEIGHTS[m.id] ?? 0.05;
    score += m.alignment * w;
    wsum += w;
  }

  return {
    sex,
    balanceScore: Math.round(score / Math.max(0.001, wsum)),
    metrics,
  };
}

/**
 * Controlled-menu recommendation builder: only procedures the clinic
 * actually offers (available templates) are ever suggested - spec §7.
 */
export function geometryRecommendations(
  assessment: GeometryAssessment,
  availableTemplates: TreatmentTemplate[]
): { templateId: string; name: string; motivation: string }[] {
  const available = new Map(availableTemplates.map((t) => [t.id, t]));
  const out: { templateId: string; name: string; motivation: string }[] = [];
  const seen = new Set<string>();
  const ranked = [...assessment.metrics].sort(
    (a, b) => a.alignment - b.alignment
  );
  for (const metric of ranked) {
    for (const rec of metric.recommends) {
      const t = available.get(rec);
      if (!t || seen.has(rec)) continue;
      seen.add(rec);
      out.push({
        templateId: rec,
        name: t.name,
        motivation: metric.insight,
      });
    }
  }
  return out.slice(0, 4);
}

// ---------------------------------------------------------------------
// Quantitative treatment suggestions - the doctor-support layer.
//
// The owner's requirement: the report must state HOW FAR each measurement
// deviates from the reference and translate that into a concrete starting
// quantity (ml of filler, units of toxin) for the doctor to confirm.
// Sub-procedures are named precisely (Upper lip filler, not Lip Filler):
// the metric's DIRECTION picks the target. All quantities are ranges and
// carry the physician-confirm framing on the report (spec §7 stays
// honored: ranges as a starting point, never a photo-derived prescription).
// ---------------------------------------------------------------------

export interface TreatmentSuggestion {
  id: string;
  /** Precise sub-procedure name, e.g. "Upper lip filler" */
  procedure: string;
  templateId?: string;
  bucket: "injectable" | "skin" | "structural";
  /** The deviation, stated with numbers */
  deviation: string;
  /** Suggested starting quantity range for the physician */
  dose: string;
}

const pct = (frac: number) => `${Math.round(Math.abs(frac) * 100)}%`;

/** ml band for hyaluronic lip work scaled by how far the ratio is off. */
function lipMl(devFrac: number): string {
  const d = Math.abs(devFrac);
  if (d < 0.08) return "0.3–0.5 ml";
  if (d < 0.2) return "0.5–0.8 ml";
  return "0.8–1.0 ml";
}

export function quantitativeSuggestions(
  assessment: GeometryAssessment,
  availableTemplates: TreatmentTemplate[]
): TreatmentSuggestion[] {
  const available = new Set(availableTemplates.map((t) => t.id));
  const m = new Map(assessment.metrics.map((x) => [x.id, x]));
  const F = assessment.sex === "female";
  const out: TreatmentSuggestion[] = [];

  // ---- lips: direction picks the lip -------------------------------------
  const lip = m.get("lip_ratio");
  if (lip && lip.alignment < 85 && available.has("lip_filler")) {
    const measured = Number(lip.value.replace("1 : ", ""));
    const ideal = F ? 1.618 : 1.15;
    const dev = (measured - ideal) / ideal;
    const upperDeficient = dev > 0; // lower leads -> upper needs support
    out.push({
      id: upperDeficient ? "upper_lip_filler" : "lower_lip_filler",
      procedure: upperDeficient ? "Upper lip filler" : "Lower lip filler",
      templateId: "lip_filler",
      bucket: "injectable",
      deviation: `Lip ratio measures ${lip.value} against the ${lip.ideal} reference: the ${
        upperDeficient ? "upper" : "lower"
      } lip carries ${pct(dev)} less relative height than the classical balance.`,
      dose: `Suggested starting volume ≈ ${lipMl(dev)} hyaluronic filler to the ${
        upperDeficient
          ? "upper lip body and vermilion border"
          : "lower lip body"
      }, placed conservatively across one session.`,
    });
  }

  // ---- chin: lower-third shortfall ----------------------------------------
  const lower = m.get("lower_third");
  if (lower && lower.alignment < 85 && available.has("chin_filler")) {
    const measured = Number(lower.value.replace("1 : ", ""));
    if (measured < 2) {
      const dev = (2 - measured) / 2;
      out.push({
        id: "chin_projection_filler",
        procedure: "Chin augmentation (structural filler)",
        templateId: "chin_filler",
        bucket: "injectable",
        deviation: `Lower-third balance measures ${lower.value} against the classical 1 : 2: the chin third runs ${pct(dev)} short of the reference.`,
        dose: `Suggested starting volume ≈ ${dev > 0.15 ? "1.5–2.0" : "1.0–1.5"} ml structural hyaluronic filler placed on bone at the pogonion.`,
      });
    }
  }

  // ---- jaw : cheek - direction decides the treatment ----------------------
  const jaw = m.get("jaw_cheek");
  if (jaw && jaw.alignment < 85) {
    const measured = Number(jaw.value);
    const ideal = F ? 0.85 : 0.97;
    const dev = (measured - ideal) / ideal;
    if (F && dev > 0 && available.has("botox")) {
      out.push({
        id: "masseter_slimming",
        procedure: "Masseter slimming (toxin)",
        templateId: "botox",
        bucket: "injectable",
        deviation: `Jaw-to-cheekbone width measures ${jaw.value} against the tapered ${ideal} reference, ${pct(dev)} fuller than the classical feminine taper.`,
        dose: `Suggested ≈ ${dev > 0.08 ? "25–30" : "20–25"} units of botulinum toxin per masseter.`,
      });
    } else if (dev < 0 && available.has("chin_filler")) {
      out.push({
        id: "jawline_definition",
        procedure: "Jawline definition (structural filler)",
        templateId: "chin_filler",
        bucket: "injectable",
        deviation: `Jaw-to-cheekbone width measures ${jaw.value} against the ${ideal} reference, ${pct(dev)} lighter than the ${F ? "classical" : "masculine"} standard.`,
        dose: "Suggested ≈ 1–2 ml structural filler along the gonial angle and prejowl, per side as indicated.",
      });
    }
  }

  // ---- periocular: canthal lift --------------------------------------------
  const canthal = m.get("canthal");
  if (canthal && canthal.alignment < 85 && available.has("botox")) {
    const measured = Number(canthal.value.replace("°", ""));
    const idealDeg = F ? 6 : 3;
    if (measured < idealDeg) {
      out.push({
        id: "chemical_brow_lift",
        procedure: "Chemical brow lift (toxin)",
        templateId: "botox",
        bucket: "injectable",
        deviation: `Canthal axis measures ${canthal.value} against the ${canthal.ideal} reference, ${(idealDeg - measured).toFixed(1)}° flatter than the classical lift.`,
        dose: "Suggested ≈ 4–8 units of botulinum toxin to the tail of each brow (orbicularis).",
      });
    }
  }

  // ---- symmetry: micro-volume balancing ------------------------------------
  const sym = m.get("symmetry");
  if (sym && sym.alignment < 80 && available.has("lip_filler")) {
    out.push({
      id: "symmetry_balancing",
      procedure: "Symmetry micro-balancing",
      bucket: "injectable",
      deviation: `Left-right correspondence measures ${sym.value} against the ≥ 90% reference.`,
      dose: "Suggested ≈ 0.2–0.5 ml micro-volume on the lighter side, mapped in person against animation.",
    });
  }

  // ---- nose: structural, stays a consult -----------------------------------
  const nose = m.get("nose_width");
  if (nose && nose.alignment < 85 && available.has("rhinoplasty")) {
    const measured = Number(nose.value.replace("× intercanthal", ""));
    const ideal = F ? 0.98 : 1.05;
    const dev = (measured - ideal) / ideal;
    if (dev > 0) {
      out.push({
        id: "alar_base_refinement",
        procedure: "Alar base refinement (surgical consult)",
        templateId: "rhinoplasty",
        bucket: "structural",
        deviation: `Nasal base measures ${nose.value} against the ≈ 1.0× intercanthal reference, ${pct(dev)} beyond the classical line.`,
        dose: "A surgical consult can review alar base reduction; precise planning belongs to the in-person measurement, not this photograph.",
      });
    }
  }

  return out.slice(0, 6);
}
