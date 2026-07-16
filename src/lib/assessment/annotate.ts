"use client";

/**
 * Deterministic report annotation — draws the assessment overlays onto the
 * patient's own photo with plain canvas 2D, using landmark coordinates.
 * No generative model touches the annotated visual: same photo + same
 * findings = pixel-identical overlay, which is what makes the report
 * consistent every single time (owner's hard requirement).
 */

import type { SkinFinding } from "@/app/api/assessment/skin/route";
import type { GeometryAssessment } from "./geometry";
import { LM } from "./geometry";

const MINT = "#34d3b0";
const INK = "rgba(31, 41, 55, 0.85)";
/** Dark casing drawn under every mint stroke so lines stay distinct on
 *  any skin tone (owner: the mapping lines must be clearly visible). */
const CASING = "rgba(10, 28, 25, 0.82)";

type Pt = { x: number; y: number };

export interface AnnotationResult {
  /** The photo with proportion lines + numbered finding markers */
  annotatedDataUrl: string;
  /** Region crops keyed to numbered findings (evidence strip) */
  crops: { index: number; label: string; dataUrl: string }[];
}

/** Region -> bounding box in image px, derived from landmarks. */
function regionBox(
  region: SkinFinding["region"],
  P: (i: number) => Pt,
  w: number,
  h: number
): { x: number; y: number; w: number; h: number } {
  const faceW = P(LM.faceL).x - P(LM.faceR).x;
  const box = (cx: number, cy: number, bw: number, bh: number) => ({
    x: cx - bw / 2,
    y: cy - bh / 2,
    w: bw,
    h: bh,
  });
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  switch (region) {
    case "forehead": {
      const c = mid(P(LM.foreheadTop), P(LM.glabella));
      return box(c.x, c.y, faceW * 0.62, Math.abs(P(LM.glabella).y - P(LM.foreheadTop).y) * 0.9);
    }
    case "glabella":
      return box(P(LM.glabella).x, P(LM.glabella).y, faceW * 0.2, faceW * 0.16);
    case "eye_area": {
      const c = mid(P(LM.eyeROuter), P(LM.eyeLOuter));
      return box(c.x, c.y, faceW * 0.78, faceW * 0.2);
    }
    case "under_eye": {
      const c = mid(P(LM.eyeRInner), P(LM.eyeLInner));
      return box(c.x, c.y + faceW * 0.12, faceW * 0.6, faceW * 0.18);
    }
    case "cheeks": {
      const c = mid(P(LM.alarR), P(LM.alarL));
      return box(c.x, c.y, faceW * 0.85, faceW * 0.3);
    }
    case "nose": {
      const c = mid(P(LM.nasion), P(LM.subnasale));
      return box(c.x, c.y, faceW * 0.3, Math.abs(P(LM.subnasale).y - P(LM.nasion).y) * 1.2);
    }
    case "perioral": {
      const c = mid(P(LM.mouthR), P(LM.mouthL));
      return box(c.x, c.y, faceW * 0.45, faceW * 0.28);
    }
    case "chin":
      return box(P(LM.menton).x, P(LM.menton).y - faceW * 0.05, faceW * 0.32, faceW * 0.22);
    case "jawline": {
      const c = mid(P(LM.jawR), P(LM.jawL));
      return box(c.x, c.y + faceW * 0.08, faceW * 0.95, faceW * 0.3);
    }
    case "hairline": {
      const c = P(LM.foreheadTop);
      return box(c.x, c.y - faceW * 0.06, faceW * 0.75, faceW * 0.22);
    }
    default: {
      const c = mid(P(LM.nasion), P(LM.menton));
      return box(c.x, c.y, faceW * 1.05, (P(LM.menton).y - P(LM.foreheadTop).y) * 1.05);
    }
  }
}

export function buildAnnotatedImage(
  image: HTMLImageElement,
  landmarks: number[][],
  geometry: GeometryAssessment,
  skinFindings: SkinFinding[]
): AnnotationResult {
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const P = (i: number): Pt => ({
    x: landmarks[i][0] * w,
    y: landmarks[i][1] * h,
  });
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);

  const faceW = P(LM.faceL).x - P(LM.faceR).x;
  const lw = Math.max(2.4, w / 420);
  ctx.lineCap = "round";

  /** Cased stroke: dark under-line then mint over-line — distinct on any
   *  skin tone, screen or print. */
  const cased = (draw: () => void, dash?: number[]) => {
    ctx.setLineDash(dash ?? []);
    ctx.strokeStyle = CASING;
    ctx.lineWidth = lw * 2.1;
    draw();
    ctx.stroke();
    ctx.strokeStyle = MINT;
    ctx.lineWidth = lw * 0.95;
    draw();
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // ---- proportion scaffold: thirds + midline ------------------------------
  const xL = P(LM.faceR).x - faceW * 0.12;
  const xR = P(LM.faceL).x + faceW * 0.12;
  for (const y of [
    P(LM.foreheadTop).y,
    P(LM.glabella).y,
    P(LM.subnasale).y,
    P(LM.menton).y,
  ]) {
    cased(() => {
      ctx.beginPath();
      ctx.moveTo(xL, y);
      ctx.lineTo(xR, y);
    }, [lw * 5, lw * 3.5]);
  }
  const midX = (P(LM.nasion).x + P(LM.subnasale).x + P(LM.menton).x) / 3;
  cased(() => {
    ctx.beginPath();
    ctx.moveTo(midX, P(LM.foreheadTop).y - faceW * 0.06);
    ctx.lineTo(midX, P(LM.menton).y + faceW * 0.06);
  }, [lw * 5, lw * 3.5]);

  // ---- metric accents for the lowest-alignment geometry findings ---------
  const flagged = geometry.metrics
    .filter((m) => m.alignment < 85)
    .map((m) => m.id);
  if (flagged.includes("lip_ratio")) {
    const y0 = P(LM.lipTop).y;
    const y1 = P(LM.lipBottom).y;
    const x0 = P(LM.mouthR).x - faceW * 0.04;
    const x1 = P(LM.mouthL).x + faceW * 0.04;
    cased(() => {
      ctx.beginPath();
      ctx.rect(x0, y0 - lw * 2, x1 - x0, y1 - y0 + lw * 4);
    });
  }
  if (flagged.includes("jaw_cheek") || flagged.includes("lower_third")) {
    cased(() => {
      ctx.beginPath();
      ctx.moveTo(P(LM.jawR).x, P(LM.jawR).y);
      ctx.quadraticCurveTo(
        P(LM.menton).x,
        P(LM.menton).y + faceW * 0.06,
        P(LM.jawL).x,
        P(LM.jawL).y
      );
    });
  }
  if (flagged.includes("canthal")) {
    for (const [outer, inner] of [
      [LM.eyeROuter, LM.eyeRInner],
      [LM.eyeLOuter, LM.eyeLInner],
    ] as const) {
      cased(() => {
        ctx.beginPath();
        ctx.moveTo(P(inner).x, P(inner).y);
        ctx.lineTo(P(outer).x, P(outer).y);
      });
    }
  }

  // ---- numbered skin-finding markers --------------------------------------
  const crops: AnnotationResult["crops"] = [];
  skinFindings.forEach((finding, i) => {
    const b = regionBox(finding.region, P, w, h);
    // region ellipse: light wash + cased outline so it reads distinctly
    ctx.fillStyle = "rgba(52, 211, 176, 0.14)";
    ctx.beginPath();
    ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    cased(() => {
      ctx.beginPath();
      ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
    });
    // numbered chip: mint fill, dark ring, white numeral
    const r = Math.max(12, w / 55);
    const cx = b.x + b.w - r * 0.4;
    const cy = b.y + r * 0.4;
    ctx.fillStyle = MINT;
    ctx.strokeStyle = CASING;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${r * 1.1}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), cx, cy + r * 0.05);

    // evidence crop (padded box, clamped to image)
    const pad = b.w * 0.25;
    const cxp = Math.max(0, b.x - pad);
    const cyp = Math.max(0, b.y - pad);
    const cwp = Math.min(w - cxp, b.w + pad * 2);
    const chp = Math.min(h - cyp, b.h + pad * 2);
    const crop = document.createElement("canvas");
    const CW = 280;
    crop.width = CW;
    crop.height = Math.round((chp / cwp) * CW);
    crop
      .getContext("2d")!
      .drawImage(image, cxp, cyp, cwp, chp, 0, 0, crop.width, crop.height);
    crops.push({
      index: i + 1,
      label: finding.region.replace(/_/g, " "),
      dataUrl: crop.toDataURL("image/jpeg", 0.88),
    });
  });

  // watermark-style footer line (spec: reports carry provenance)
  ctx.fillStyle = INK;
  ctx.font = `500 ${Math.max(11, w / 70)}px system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText("CAPTURE · assessment overlay", w - w * 0.02, h - h * 0.015);

  return {
    annotatedDataUrl: canvas.toDataURL("image/jpeg", 0.92),
    crops,
  };
}
