"use client";

/**
 * Face-mesh geometry: triangulation, semantic region weights, and the morph
 * engine shared by the 3D canvas and the 2D preview warp
 * (knowledge base / 04_consultation-canvas-3d.md §3 "feature selection").
 *
 * The mesh is semantic - the app knows which landmarks are nose, lips, jaw -
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
  upperLipTop: 0, // upper vermilion top center
  lowerLipBottom: 17, // lower vermilion bottom center
  upperLipInner: 13, // oral line, upper
  lowerLipInner: 14, // oral line, lower
  bowPeakR: 37, // cupid's bow peaks flanking the top center
  bowPeakL: 267,
};

// ---------------------------------------------------------------------
// Triangulation - derived from the official tessellation edge list by
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

// ---------------------------------------------------------------------
// Eye fill - the tessellation leaves the eye openings unfilled, which
// renders as "empty" (see-through) eyes on a textured mesh. Fill each eye
// with a triangle fan from its centroid so the photo's own eyes show
// through. The centroid UV is the average of the eyelid ring, so it samples
// the eyeball region of the photo. (The mouth has the same hole but reads
// fine on closed-mouth portraits.)
// ---------------------------------------------------------------------

function ringFromConnections(
  conns: { start: number; end: number }[]
): number[] {
  const set = new Set<number>();
  for (const { start, end } of conns) {
    set.add(start);
    set.add(end);
  }
  return [...set];
}

export interface EyeFill {
  points: Pt[]; // centroid vertices to append after the base points
  triangles: number[]; // indices into [...basePx, ...points]
}

export function buildEyeFill(basePx: Pt[]): EyeFill {
  const points: Pt[] = [];
  const triangles: number[] = [];
  const eyes = [
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
  ];
  for (const conns of eyes) {
    const ring = ringFromConnections(conns).filter((i) => basePx[i]);
    if (ring.length < 3) continue;
    let cx = 0,
      cy = 0,
      cz = 0;
    for (const i of ring) {
      cx += basePx[i].x;
      cy += basePx[i].y;
      cz += basePx[i].z;
    }
    cx /= ring.length;
    cy /= ring.length;
    cz /= ring.length;
    // order the ring by angle so the fan is a valid, non-self-intersecting polygon
    const ordered = ring
      .slice()
      .sort(
        (a, b) =>
          Math.atan2(basePx[a].y - cy, basePx[a].x - cx) -
          Math.atan2(basePx[b].y - cy, basePx[b].x - cx)
      );
    // apex vertex; nudge a hair toward camera (more negative z) so the fill
    // sits cleanly over the socket rim
    const apex = basePx.length + points.length;
    points.push({ x: cx, y: cy, z: cz - 1 });
    for (let k = 0; k < ordered.length; k++) {
      triangles.push(ordered[k], ordered[(k + 1) % ordered.length], apex);
    }
  }
  return { points, triangles };
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
// The nose frame - everything nose-related is measured against it
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

/** Soft round blob weight: 1 near (cx, cy), fading to 0 at radius r. */
function blobW(p: Pt, cx: number, cy: number, r: number): number {
  return fall(Math.hypot(p.x - cx, p.y - cy), 0.35 * r, r);
}

// ---------------------------------------------------------------------
// Lip frame - drives the lip-filler morph fields: vermilion volume,
// upper/lower ratio, cupid's bow, border, corners, projection, philtrum,
// and the botox lip flip.
// ---------------------------------------------------------------------

export interface LipFrame {
  centerX: number;
  innerY: number; // the oral line between the lips
  lipW: number; // corner-to-corner width
  lipH: number; // top of upper vermilion to bottom of lower vermilion
  cornerR: Pt;
  cornerL: Pt;
  peakR: Pt;
  peakL: Pt;
  top: Pt;
  bot: Pt;
}

export function lipFrame(px: Pt[]): LipFrame {
  const cornerR = px[ANCHOR.mouthCornerR];
  const cornerL = px[ANCHOR.mouthCornerL];
  const top = px[ANCHOR.upperLipTop];
  const bot = px[ANCHOR.lowerLipBottom];
  const innerY =
    (px[ANCHOR.upperLipInner].y + px[ANCHOR.lowerLipInner].y) / 2;
  return {
    centerX: (cornerR.x + cornerL.x) / 2,
    innerY,
    lipW: Math.max(1, Math.hypot(cornerL.x - cornerR.x, cornerL.y - cornerR.y)),
    lipH: Math.max(1, bot.y - top.y),
    cornerR,
    cornerL,
    peakR: px[ANCHOR.bowPeakR],
    peakL: px[ANCHOR.bowPeakL],
    top,
    bot,
  };
}

/** Soft elliptical membership of a point in the lip region (0..1). */
function lipMemberWeight(p: Pt, lf: LipFrame): number {
  const ex = (p.x - lf.centerX) / (0.62 * lf.lipW);
  const ey = (p.y - lf.innerY) / (0.95 * lf.lipH);
  return fall(Math.hypot(ex, ey), 0.5, 1.1);
}

/** 1 above the oral line, smoothly crossing to 0 below (and the reverse). */
function upperSide(p: Pt, lf: LipFrame): number {
  return smoothstep(-0.1 * lf.lipH, 0.1 * lf.lipH, lf.innerY - p.y);
}
function lowerSide(p: Pt, lf: LipFrame): number {
  return smoothstep(-0.1 * lf.lipH, 0.1 * lf.lipH, p.y - lf.innerY);
}

// ---------------------------------------------------------------------
// Chin frame - drives the chin-filler fields: projection, vertical length,
// width/taper, labiomental crease, prejowl blend. The chin unit L is the
// lower-lip-to-menton distance, so magnitudes scale with the face.
// ---------------------------------------------------------------------

export interface ChinFrame {
  menton: Pt;
  axisX: number;
  L: number;
}

export function chinFrame(px: Pt[]): ChinFrame {
  const menton = px[ANCHOR.chin];
  const lipBot = px[ANCHOR.lowerLipBottom];
  return {
    menton,
    axisX: menton.x,
    L: Math.max(1, menton.y - lipBot.y),
  };
}

/** Soft blob over the chin pad, centered slightly above the menton. */
function chinPadWeight(p: Pt, cf: ChinFrame): number {
  return blobW(p, cf.menton.x, cf.menton.y - 0.3 * cf.L, 1.35 * cf.L);
}

// ---------------------------------------------------------------------
// Brow + jaw frame - drives the geometric botox fields: chemical brow lift
// (brow tails from the eyebrow landmark sets) and masseter slimming (the
// widest jawline points between mouth and chin height on the face oval).
// ---------------------------------------------------------------------

export interface BrowJawFrame {
  browTailR: Pt;
  browTailL: Pt;
  browMidR: Pt;
  browMidL: Pt;
  gonialR: Pt | null;
  gonialL: Pt | null;
  axisX: number;
  faceH: number;
}

export function browJawFrame(px: Pt[]): BrowJawFrame {
  const axisX = px[ANCHOR.noseTip].x;
  const chin = px[ANCHOR.chin];
  const faceH = Math.abs(chin.y - px[ANCHOR.nasion].y) * 1.8 || 1;
  const mouthY = px[ANCHOR.lowerLipBottom].y;

  const browSide = (conns: { start: number; end: number }[]) => {
    const set = new Set<number>();
    for (const { start, end } of conns) {
      set.add(start);
      set.add(end);
    }
    let tail: Pt = px[ANCHOR.nasion];
    let cx = 0,
      cy = 0,
      n = 0;
    set.forEach((i) => {
      const q = px[i];
      if (!q) return;
      cx += q.x;
      cy += q.y;
      n++;
      if (Math.abs(q.x - axisX) > Math.abs(tail.x - axisX)) tail = q;
    });
    return { tail, mid: { x: cx / (n || 1), y: cy / (n || 1), z: 0 } };
  };
  const r = browSide(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW);
  const l = browSide(FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW);

  // gonial (jaw-angle) point per side: widest oval point between the mouth
  // line and just above the chin tip
  let gR: Pt | null = null;
  let gL: Pt | null = null;
  ovalIndexSet().forEach((i) => {
    const q = px[i];
    if (!q) return;
    if (q.y < mouthY - 0.12 * faceH || q.y > chin.y - 0.03 * faceH) return;
    if (q.x < axisX) {
      if (!gR || q.x < gR.x) gR = q;
    } else if (!gL || q.x > gL.x) {
      gL = q;
    }
  });

  return {
    browTailR: r.tail,
    browTailL: l.tail,
    browMidR: r.mid,
    browMidL: l.mid,
    gonialR: gR,
    gonialL: gL,
    axisX,
    faceH,
  };
}

// ---------------------------------------------------------------------
// Other feature regions (for highlight + feature-scale tools)
// ---------------------------------------------------------------------

export type FeatureId =
  | "nose"
  | "lips"
  | "cheeks"
  | "jaw"
  | "chin"
  | "under_eye"
  | "brow";

export interface FeatureFrame {
  px: Pt[];
  nose: NoseFrame;
  lipSet: Set<number>;
  ovalSet: Set<number>;
  lipCenter: Pt;
  lipRadius: number;
  faceH: number;
  browMidR: { x: number; y: number };
  browMidL: { x: number; y: number };
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

  const browMid = (conns: { start: number; end: number }[]) => {
    const set = new Set<number>();
    for (const { start, end } of conns) {
      set.add(start);
      set.add(end);
    }
    let bx = 0,
      by = 0,
      n = 0;
    set.forEach((i) => {
      const q = px[i];
      if (!q) return;
      bx += q.x;
      by += q.y;
      n++;
    });
    return { x: bx / (n || 1), y: by / (n || 1) };
  };

  return {
    px,
    nose,
    lipSet,
    ovalSet,
    lipCenter,
    lipRadius,
    faceH,
    browMidR: browMid(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW),
    browMidL: browMid(FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW),
  };
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

  // brow: two soft blobs over the eyebrow regions
  const browR = faceH * 0.13;
  const brow = Math.max(
    fall(Math.hypot(p.x - ff.browMidR.x, p.y - ff.browMidR.y), browR * 0.5, browR * 1.4),
    fall(Math.hypot(p.x - ff.browMidL.x, p.y - ff.browMidL.y), browR * 0.5, browR * 1.4)
  );

  return {
    nose: noseWeight(p, nose),
    lips,
    cheeks,
    jaw,
    chin: chinW,
    under_eye,
    brow,
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
// The morph engine - slider params → displaced landmarks.
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

  const keys = new Set(active.map(([key]) => key));
  const has = (...ks: string[]) => ks.some((kk) => keys.has(kk));

  const f = noseFrame(basePx);
  const ff =
    active.some(([k]) => k.startsWith("scale_")) ? featureFrame(basePx) : null;
  const lf = has(
    "lip_upper_volume",
    "lip_lower_volume",
    "lip_ratio",
    "cupids_bow",
    "lip_definition",
    "lip_corners",
    "lip_projection",
    "philtrum",
    "lip_flip"
  )
    ? lipFrame(basePx)
    : null;
  const cf = has(
    "chin_projection",
    "chin_length",
    "chin_width",
    "labiomental",
    "prejowl"
  )
    ? chinFrame(basePx)
    : null;
  const bf = has("brow_lift", "masseter_slim") ? browJawFrame(basePx) : null;

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

    // =================================================================
    // LIP FILLER fields (05: lip architecture control set)
    // =================================================================
    if (lf) {
      const mw = lipMemberWeight(p, lf);
      if (mw > 0.001) {
        const up = upperSide(p, lf);
        const lo = lowerSide(p, lf);

        // Volumes + upper:lower balance. Vertical vermilion expansion about
        // the oral line plus gentle forward eversion (the "soft pillow"
        // read of settled HA filler).
        const rat = k("lip_ratio");
        const uv = Math.min(
          1.2,
          Math.max(0, k("lip_upper_volume")) + Math.max(0, -rat) * 0.55
        );
        const lv = Math.min(
          1.2,
          Math.max(0, k("lip_lower_volume")) + Math.max(0, rat) * 0.55
        );
        if (uv > 0) {
          const w = mw * up;
          y = lf.innerY + (y - lf.innerY) * (1 + 0.3 * uv * w);
          z -= 0.13 * lf.lipH * uv * w;
        }
        if (lv > 0) {
          const w = mw * lo;
          y = lf.innerY + (y - lf.innerY) * (1 + 0.3 * lv * w);
          z -= 0.13 * lf.lipH * lv * w;
        }

        // Cupid's bow: lift and sharpen the two peaks, keep the central dip
        const cb = k("cupids_bow");
        if (cb > 0) {
          const rp = 0.17 * lf.lipW;
          const gPeak = Math.max(
            blobW(p, lf.peakR.x, lf.peakR.y, rp),
            blobW(p, lf.peakL.x, lf.peakL.y, rp)
          );
          const gDip = blobW(p, lf.top.x, lf.top.y, 0.1 * lf.lipW);
          y -= 0.14 * lf.lipH * cb * gPeak * up;
          y += 0.05 * lf.lipH * cb * gDip * up;
          z -= 0.05 * lf.lipH * cb * gPeak;
        }

        // Mouth corners: downturn correction (or relaxed droop)
        const cc = k("lip_corners");
        if (cc !== 0) {
          const rc = 0.3 * lf.lipW;
          const g = Math.max(
            blobW(p, lf.cornerR.x, lf.cornerR.y, rc),
            blobW(p, lf.cornerL.x, lf.cornerL.y, rc)
          );
          y -= 0.16 * lf.lipH * cc * g;
        }

        // Projection / pout: whole lip body toward the camera
        const pj = k("lip_projection");
        if (pj > 0) z -= 0.2 * lf.lipH * pj * mw;

        // Vermilion border: slight outward crisping of the outline
        const df = k("lip_definition");
        if (df > 0) {
          const s = 0.05 * df * mw;
          x += (x - lf.centerX) * s;
          y += (y - lf.innerY) * s * 0.7;
        }

        // Botox lip flip: slight upper-lip eversion, no volume
        const fl = k("lip_flip");
        if (fl > 0) {
          const w = mw * up;
          y = lf.innerY + (y - lf.innerY) * (1 + 0.1 * fl * w);
          z -= 0.06 * lf.lipH * fl * w;
        }
      }

      // Philtral columns: two soft ridges above the bow peaks (outside the
      // vermilion blob, so evaluated independently of lip membership)
      const ph = k("philtrum");
      if (ph > 0) {
        const ry = 0.45 * lf.lipH;
        const gy = lf.top.y - 0.5 * lf.lipH;
        const g = Math.max(
          blobW(p, lf.peakR.x, gy, ry),
          blobW(p, lf.peakL.x, gy, ry)
        );
        if (g > 0.001) z -= 0.06 * lf.lipH * ph * g;
      }
    }

    // =================================================================
    // CHIN FILLER fields (projection / length / width / crease / prejowl)
    // =================================================================
    if (cf) {
      const w = chinPadWeight(p, cf);
      if (w > 0.001) {
        // Forward projection toward the E-line (deep, on-bone support)
        const pr = k("chin_projection");
        if (pr > 0) {
          z -= 0.5 * cf.L * pr * w;
          y += 0.05 * cf.L * pr * w;
        }
        // Vertical lengthening, biased toward the lower half of the pad
        const ln = k("chin_length");
        if (ln > 0) {
          const lowBias = smoothstep(
            -0.6 * cf.L,
            0.3 * cf.L,
            p.y - (cf.menton.y - 0.5 * cf.L)
          );
          y += 0.42 * cf.L * ln * w * lowBias;
        }
        // Width: taper toward a point or broaden the base
        const wd = k("chin_width");
        if (wd !== 0) {
          x = cf.axisX + (x - cf.axisX) * (1 + 0.16 * wd * w);
        }
        // Labiomental crease fill (just under the lower lip)
        const lb = k("labiomental");
        if (lb > 0) {
          const g = blobW(p, cf.axisX, cf.menton.y - 0.8 * cf.L, 0.6 * cf.L);
          z -= 0.25 * cf.L * lb * g;
        }
      }
      // Prejowl sulcus fill, lateral of the chin along the jawline
      const pjw = k("prejowl");
      if (pjw > 0) {
        const r = 0.85 * cf.L;
        const g = Math.max(
          blobW(p, cf.axisX - 1.5 * cf.L, cf.menton.y - 0.45 * cf.L, r),
          blobW(p, cf.axisX + 1.5 * cf.L, cf.menton.y - 0.45 * cf.L, r)
        );
        if (g > 0.001) z -= 0.22 * cf.L * pjw * g;
      }
    }

    // =================================================================
    // BOTOX geometric fields (brow lift + masseter slimming; the line
    // sliders are texture effects rendered by the AI pass)
    // =================================================================
    if (bf) {
      const bl = k("brow_lift");
      if (bl > 0) {
        const r = 0.14 * bf.faceH;
        const g = Math.max(
          blobW(p, bf.browTailR.x, bf.browTailR.y, r),
          blobW(p, bf.browTailL.x, bf.browTailL.y, r),
          0.55 * blobW(p, bf.browMidR.x, bf.browMidR.y, r),
          0.55 * blobW(p, bf.browMidL.x, bf.browMidL.y, r)
        );
        y -= 0.045 * bf.faceH * bl * g; // tails lift most, mids follow
      }
      const ms = k("masseter_slim");
      if (ms > 0 && bf.gonialR && bf.gonialL) {
        const r = 0.2 * bf.faceH;
        const g = Math.max(
          blobW(p, bf.gonialR.x, bf.gonialR.y, r),
          blobW(p, bf.gonialL.x, bf.gonialL.y, r)
        );
        x += (bf.axisX - x) * 0.16 * ms * g;
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
    case "brow":
      return {
        x: ff.nose.axisX,
        y: (ff.browMidR.y + ff.browMidL.y) / 2,
      };
  }
}

/**
 * Map the doctor's canvas morphs to AI visualization slider presets -
 * the canvas is the sketch; the AI image is the render
 * (04_consultation-canvas-3d.md §4 handoff).
 */
export function canvasMorphsToAiParams(
  morphs: MorphParams,
  /** The active template's slider keys - the handoff is procedure-agnostic. */
  allowedKeys: string[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of allowedKeys) {
    const v = morphs[key];
    if (v !== undefined && Math.abs(v) > 2) out[key] = Math.round(v);
  }
  // Legacy nicety: the whole-nose Scale tool folds into rhinoplasty's size
  if (
    allowedKeys.includes("overall_size") &&
    morphs["scale_nose"] !== undefined &&
    Math.abs(morphs["scale_nose"]) > 2
  ) {
    out["overall_size"] = Math.round(
      Math.max(-100, Math.min(100, (out["overall_size"] ?? 0) + morphs["scale_nose"]))
    );
  }
  return out;
}
