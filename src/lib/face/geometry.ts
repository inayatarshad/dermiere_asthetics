"use client";

/**
 * Face-mesh geometry: triangulation, semantic region weights, and the morph
 * engine shared by the 3D canvas and the 2D preview warp
 * (knowledge base / 04_consultation-canvas-3d.md §3 "feature selection").
 *
 * The mesh is semantic — the app knows which landmarks are nose, lips, jaw —
 * so tools act on anatomically sensible regions with soft falloff, never raw
 * vertex chaos.
 */

import { FaceLandmarker } from "@mediapipe/tasks-vision";

export interface Pt {
  x: number;
  y: number;
  z: number;
}

/** High-confidence canonical MediaPipe indices used as anatomical anchors. */
export const ANCHOR = {
  noseTip: 1,
  supratip: 4,
  subnasale: 2,
  nasion: 168,
  dorsum: [6, 197, 195, 5],
  chin: 152,
  eyeOuterR: 33, // subject's right eye (viewer left)
  eyeOuterL: 263,
  mouthCornerR: 61,
  mouthCornerL: 291,
};

// ---------------------------------------------------------------------
// Triangulation — derived from the official tessellation edge list by
// 3-clique detection, so we never ship a hardcoded 2,640-number table.
// Computed once and cached.
// ---------------------------------------------------------------------

let triCache: number[] | null = null;

export function faceTriangles(): number[] {
  if (triCache) return triCache;
  const edges = FaceLandmarker.FACE_LANDMARKS_TESSELATION;
  const adj = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const { start, end } of edges) {
    link(start, end);
    link(end, start);
  }
  const seen = new Set<string>();
  const tris: number[] = [];
  for (const { start: a, end: b } of edges) {
    const na = adj.get(a);
    const nb = adj.get(b);
    if (!na || !nb) continue;
    for (const c of na) {
      if (!nb.has(c)) continue;
      const t = [a, b, c].sort((x, y) => x - y);
      const key = t.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      tris.push(t[0], t[1], t[2]);
    }
  }
  triCache = tris;
  return tris;
}

export function lipIndexSet(): Set<number> {
  const set = new Set<number>();
  for (const { start, end } of FaceLandmarker.FACE_LANDMARKS_LIPS) {
    set.add(start);
    set.add(end);
  }
  return set;
}

export function ovalIndexSet(): Set<number> {
  const set = new Set<number>();
  for (const { start, end } of FaceLandmarker.FACE_LANDMARKS_FACE_OVAL) {
    set.add(start);
    set.add(end);
  }
  return set;
}

// ---------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------

/** Normalized landmarks → pixel space (z scaled like x, per MediaPipe docs). */
export function toPx(landmarks: number[][], w: number, h: number): Pt[] {
  return landmarks.map(([x, y, z]) => ({ x: x * w, y: y * h, z: z * w }));
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** 1 inside `inner`, fades to 0 at `outer`. */
function fall(d: number, inner: number, outer: number) {
  return 1 - smoothstep(inner, outer, d);
}

// ---------------------------------------------------------------------
// The nose frame — everything nose-related is measured against it
// ---------------------------------------------------------------------

export interface NoseFrame {
  axisX: number;
  cx: number;
  cy: number;
  noseH: number;
  tip: Pt;
  nasion: Pt;
  subnasale: Pt;
}

export function noseFrame(px: Pt[]): NoseFrame {
  const tip = px[ANCHOR.noseTip];
  const nasion = px[ANCHOR.nasion];
  const subnasale = px[ANCHOR.subnasale];
  const noseH = Math.abs(subnasale.y - nasion.y) || 1;
  return {
    axisX: tip.x,
    cx: tip.x,
    cy: (nasion.y + subnasale.y) / 2,
    noseH,
    tip,
    nasion,
    subnasale,
  };
}

/** Soft elliptical membership of a point in the nose region (0..1). */
export function noseWeight(p: Pt, f: NoseFrame): number {
  const ex = (p.x - f.axisX) / (0.62 * f.noseH);
  const ey = (p.y - f.cy) / (0.88 * f.noseH);
  const e = Math.hypot(ex, ey);
  return fall(e, 0.55, 1.18);
}

function tipWeight(p: Pt, f: NoseFrame): number {
  const d = Math.hypot(p.x - f.tip.x, p.y - f.tip.y);
  return fall(d, 0.16 * f.noseH, 0.42 * f.noseH);
}

function alarWeight(p: Pt, f: NoseFrame): number {
  const lateral = Math.abs(p.x - f.axisX);
  if (lateral < 0.1 * f.noseH) return 0;
  const yBand =
    fall(Math.abs(p.y - (f.subnasale.y - 0.22 * f.noseH)), 0.18 * f.noseH, 0.45 * f.noseH);
  return noseWeight(p, f) * yBand;
}

function dorsumWeight(p: Pt, f: NoseFrame): number {
  const lateral = Math.abs(p.x - f.axisX);
  const xBand = fall(lateral, 0.1 * f.noseH, 0.3 * f.noseH);
  const yTop = f.nasion.y + 0.05 * f.noseH;
  const yBot = f.tip.y - 0.1 * f.noseH;
  const within = p.y > yTop && p.y < yBot ? 1 : 0;
  const yEdge = within
    ? 1
    : fall(Math.min(Math.abs(p.y - yTop), Math.abs(p.y - yBot)), 0, 0.15 * f.noseH);
  return xBand * Math.max(within, yEdge * 0.6);
}

function radixWeight(p: Pt, f: NoseFrame): number {
  const d = Math.hypot(p.x - f.nasion.x, p.y - f.nasion.y);
  return fall(d, 0.14 * f.noseH, 0.4 * f.noseH);
}

// ---------------------------------------------------------------------
// Other feature regions (for highlight + feature-scale tools)
// ---------------------------------------------------------------------

export type FeatureId = "nose" | "lips" | "cheeks" | "jaw" | "chin" | "under_eye";

export interface FeatureFrame {
  px: Pt[];
  nose: NoseFrame;
  lipSet: Set<number>;
  ovalSet: Set<number>;
  lipCenter: Pt;
  lipRadius: number;
  faceH: number;
}

export function featureFrame(px: Pt[]): FeatureFrame {
  const nose = noseFrame(px);
  const lipSet = lipIndexSet();
  const ovalSet = ovalIndexSet();
  let lx = 0,
    ly = 0,
    lz = 0;
  lipSet.forEach((i) => {
    lx += px[i].x;
    ly += px[i].y;
    lz += px[i].z;
  });
  const n = lipSet.size || 1;
  const lipCenter = { x: lx / n, y: ly / n, z: lz / n };
  let lipRadius = 0;
  lipSet.forEach((i) => {
    lipRadius = Math.max(
      lipRadius,
      Math.hypot(px[i].x - lipCenter.x, px[i].y - lipCenter.y)
    );
  });
  const chin = px[ANCHOR.chin];
  const faceH = Math.abs(chin.y - px[ANCHOR.nasion].y) * 1.8 || 1;
  return { px, nose, lipSet, ovalSet, lipCenter, lipRadius, faceH };
}

export function featureWeight(i: number, p: Pt, ff: FeatureFrame): Record<FeatureId, number> {
  const { nose, lipCenter, lipRadius, faceH } = ff;
  const lipD = Math.hypot(p.x - lipCenter.x, p.y - lipCenter.y);
  const lips = fall(lipD, lipRadius * 0.75, lipRadius * 1.35);

  const chin = ff.px[ANCHOR.chin];
  const chinD = Math.hypot(p.x - chin.x, p.y - chin.y);
  const chinW = fall(chinD, faceH * 0.08, faceH * 0.2);

  // jaw: lower face band along the oval, excluding lips/chin core
  const jawBandY = fall(Math.abs(p.y - (chin.y - faceH * 0.08)), faceH * 0.1, faceH * 0.24);
  const lateral = Math.abs(p.x - nose.axisX);
  const jaw = jawBandY * smoothstep(faceH * 0.06, faceH * 0.16, lateral);

  // cheeks: two soft blobs between eye outer corner and mouth corner
  const cl = cheekCenter(ff, "L");
  const cr = cheekCenter(ff, "R");
  const cheekR = faceH * 0.16;
  const cheeks = Math.max(
    fall(Math.hypot(p.x - cl.x, p.y - cl.y), cheekR * 0.5, cheekR * 1.25),
    fall(Math.hypot(p.x - cr.x, p.y - cr.y), cheekR * 0.5, cheekR * 1.25)
  );

  // under-eye: below each eye outer/inner region
  const el = ff.px[ANCHOR.eyeOuterL];
  const er = ff.px[ANCHOR.eyeOuterR];
  const ueL = { x: (el.x + nose.nasion.x) / 2, y: el.y + faceH * 0.075 };
  const ueR = { x: (er.x + nose.nasion.x) / 2, y: er.y + faceH * 0.075 };
  const ueRad = faceH * 0.09;
  const under_eye = Math.max(
    fall(Math.hypot(p.x - ueL.x, p.y - ueL.y), ueRad * 0.5, ueRad * 1.4),
    fall(Math.hypot(p.x - ueR.x, p.y - ueR.y), ueRad * 0.5, ueRad * 1.4)
  );

  return {
    nose: noseWeight(p, nose),
    lips,
    cheeks,
    jaw,
    chin: chinW,
    under_eye,
  };
}

function cheekCenter(ff: FeatureFrame, side: "L" | "R") {
  const eye = ff.px[side === "L" ? ANCHOR.eyeOuterL : ANCHOR.eyeOuterR];
  const mouth = ff.px[side === "L" ? ANCHOR.mouthCornerL : ANCHOR.mouthCornerR];
  return {
    x: eye.x + (mouth.x - eye.x) * 0.42 + (side === "L" ? 1 : -1) * ff.faceH * 0.02,
    y: eye.y + (mouth.y - eye.y) * 0.48,
  };
}

// ---------------------------------------------------------------------
// The morph engine — slider params → displaced landmarks.
// Same math powers the 3D mesh and the 2D photo warp, so what the doctor
// sculpts and what the preview shows always agree.
// Magnitudes are deliberately capped to stay clinically plausible.
// ---------------------------------------------------------------------

export interface MorphParams {
  [key: string]: number; // -100..100 (or 0..100), see templates.ts
}

export function applyMorphs(basePx: Pt[], params: MorphParams): Pt[] {
  const active = Object.entries(params).filter(([, v]) => Math.abs(v) > 0.5);
  if (active.length === 0) return basePx;

  const f = noseFrame(basePx);
  const ff =
    active.some(([k]) => k.startsWith("scale_")) ? featureFrame(basePx) : null;

  const k = (key: string) => (params[key] ?? 0) / 100;

  return basePx.map((p, i) => {
    let { x, y, z } = p;
    const nw = noseWeight(p, f);

    if (nw > 0.001) {
      // --- Nostril / alar base width ---------------------------------
      const vAlar = k("alar_width");
      if (vAlar !== 0) {
        const w = alarWeight(p, f);
        x += (x - f.axisX) * (0.16 * vAlar) * w;
      }

      // --- Tip refinement (0..100 → narrower, neater tip) -------------
      const vRef = k("tip_refinement");
      if (vRef > 0) {
        const w = tipWeight(p, f);
        x += (f.tip.x - x) * (0.14 * vRef) * w;
        y += (f.tip.y - y) * (0.05 * vRef) * w;
      }

      // --- Tip rotation (up = negative y in image space) --------------
      const vRot = k("tip_rotation");
      if (vRot !== 0) {
        const w = tipWeight(p, f);
        y -= 0.075 * f.noseH * vRot * w;
        z -= 0.03 * f.noseH * vRot * w; // slight forward with upward rotation
      }

      // --- Tip projection (mostly a z / profile change) ----------------
      const vProj = k("tip_projection");
      if (vProj !== 0) {
        const w = tipWeight(p, f);
        z -= 0.1 * f.noseH * vProj * w; // MediaPipe z: negative = toward camera
        x += (x - f.tip.x) * 0.03 * vProj * w;
      }

      // --- Dorsum / bridge --------------------------------------------
      const vDor = k("dorsum");
      if (vDor !== 0) {
        const w = dorsumWeight(p, f);
        z -= 0.09 * f.noseH * vDor * w; // augment = forward, reduce = back
        // frontal cue: hump reduction slims the dorsal aesthetic lines
        x += (f.axisX - x) * (0.08 * Math.max(0, -vDor)) * w;
      }

      // --- Radix height -------------------------------------------------
      const vRad = k("radix");
      if (vRad !== 0) {
        const w = radixWeight(p, f);
        z -= 0.08 * f.noseH * vRad * w;
        x += (f.axisX - x) * (0.05 * Math.max(0, -vRad)) * w;
      }

      // --- Overall size --------------------------------------------------
      const vSize = k("overall_size");
      if (vSize !== 0) {
        const s = 0.1 * vSize * nw;
        x += (x - f.cx) * s;
        y += (y - f.cy) * s;
        z += (z - f.tip.z) * s * 0.5;
      }
    }

    // --- Feature scale tools (canvas Scale tool) -----------------------
    if (ff) {
      for (const [key, raw] of active) {
        if (!key.startsWith("scale_")) continue;
        const feature = key.slice(6) as FeatureId;
        const weights = featureWeight(i, p, ff);
        const w = weights[feature] ?? 0;
        if (w < 0.001) continue;
        const v = raw / 100;
        const c = featureCentroid(feature, ff);
        const s = 0.22 * v * w;
        x += (x - c.x) * s;
        y += (y - c.y) * s;
      }
    }

    return x === p.x && y === p.y && z === p.z ? p : { x, y, z };
  });
}

function featureCentroid(feature: FeatureId, ff: FeatureFrame): { x: number; y: number } {
  switch (feature) {
    case "nose":
      return { x: ff.nose.cx, y: ff.nose.cy };
    case "lips":
      return ff.lipCenter;
    case "chin":
      return ff.px[ANCHOR.chin];
    case "jaw":
      return { x: ff.px[ANCHOR.chin].x, y: ff.px[ANCHOR.chin].y - ff.faceH * 0.06 };
    case "cheeks":
      return { x: ff.nose.axisX, y: ff.lipCenter.y - ff.faceH * 0.18 };
    case "under_eye":
      return { x: ff.nose.axisX, y: ff.nose.nasion.y + ff.faceH * 0.08 };
  }
}

/**
 * Map the doctor's canvas morphs to AI visualization slider presets —
 * the canvas is the sketch; the AI image is the render
 * (04_consultation-canvas-3d.md §4 handoff).
 */
export function canvasMorphsToAiParams(
  morphs: MorphParams
): Record<string, number> {
  const out: Record<string, number> = {};
  const passthrough = [
    "alar_width",
    "tip_rotation",
    "tip_projection",
    "tip_refinement",
    "dorsum",
    "radix",
    "overall_size",
  ];
  for (const key of passthrough) {
    const v = morphs[key];
    if (v !== undefined && Math.abs(v) > 2) out[key] = Math.round(v);
  }
  if (morphs["scale_nose"] !== undefined && Math.abs(morphs["scale_nose"]) > 2) {
    out["overall_size"] = Math.round(
      Math.max(-100, Math.min(100, (out["overall_size"] ?? 0) + morphs["scale_nose"]))
    );
  }
  return out;
}
