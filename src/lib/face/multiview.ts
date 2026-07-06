"use client";

/**
 * Multi-view depth refinement — this is what the three-photo capture is FOR
 * (04_consultation-canvas-3d.md §2: side photos improve the fit).
 *
 * MediaPipe's single-photo z is a weak relief estimate. The two turned
 * photos (~35 degree yaw) contain real parallax across 468 known
 * correspondences. We exploit the capture protocol directly (closed form,
 * no iterative pose/structure alternation, which is unstable when seeded
 * from noisy single-view z):
 *
 *   1. Per side view, fit the in-plane row v ~ (x, y, 1) to recover the
 *      view's scale and vertical alignment (depth barely enters v under
 *      yaw), then normalise u by that scale.
 *   2. TWO side views: the right-left difference of normalised u, with its
 *      (x, y)-linear part regressed away, isolates a clean per-landmark
 *      depth signal z_raw = (sin yawR - sin yawL) * z + noise. The noisy
 *      MediaPipe z is never used as a regressor, so no attenuation bias.
 *   3. Regress each view's u on (x, y, z_raw, 1): the x-coefficient is
 *      cos(yaw), which fixes |sin(yaw)| and therefore the absolute depth
 *      scale gamma; signs are chosen so the two views turn opposite ways
 *      and agree on gamma.
 *   4. ONE side view only: same v/u fits, with the protocol yaw (35
 *      degrees, signed by which capture it is) as the scale prior and a
 *      heavier blend toward the MediaPipe relief.
 *   5. Gate on plausible yaw + reprojection residual; on failure return
 *      null and the caller keeps the single-view mesh (booth-safe).
 *
 * Known limit: an (x, y)-LINEAR depth field (a planar tilt of the head) is
 * absorbed by the fits and comes from the MediaPipe blend instead; all
 * depth CURVATURE — nose projection, brow, cheeks, the things a profile is
 * made of — is recovered from real parallax.
 *
 * x,y stay exactly the front photo's, so UVs, the 2D warp and the morph
 * engine are untouched; only the 3D canvas gains true depth.
 */

export interface SideView {
  landmarks: number[][]; // normalized [x,y,z] of the turned photo
  width: number;
  height: number;
  /** which capture this is: "left" = patient turned to THEIR left */
  side: "left" | "right";
}

export interface ViewReport {
  side: "left" | "right";
  yawDeg: number;
  residual: number; // rms reprojection / face height
  accepted: boolean;
}

export interface MultiViewResult {
  /** refined z in front-photo pixel units, aligned with toPx() convention */
  zPx: number[];
  views: ViewReport[];
}

const N_MESH = 468; // iris points excluded from the fit
const NOSE_TIP = 1; // ANCHOR.noseTip in geometry.ts

// ---------------------------------------------------------------------
// small linear algebra: weighted least squares up to 4 unknowns
// ---------------------------------------------------------------------

function solveN(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-9) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

/** Weighted least squares: target ~ coeffs . rows[i]. */
function wlsq(
  rows: number[][],
  target: number[],
  w: number[]
): { coef: number[]; rms: number } | null {
  const n = rows[0].length;
  const AtA = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const Atb = new Array<number>(n).fill(0);
  for (let i = 0; i < rows.length; i++) {
    const wi = w[i];
    if (wi <= 0) continue;
    for (let r = 0; r < n; r++) {
      Atb[r] += wi * rows[i][r] * target[i];
      for (let c = 0; c < n; c++) AtA[r][c] += wi * rows[i][r] * rows[i][c];
    }
  }
  const coef = solveN(AtA, Atb);
  if (!coef) return null;
  let se = 0;
  let sw = 0;
  for (let i = 0; i < rows.length; i++) {
    const wi = w[i];
    if (wi <= 0) continue;
    let pred = 0;
    for (let r = 0; r < n; r++) pred += coef[r] * rows[i][r];
    se += wi * (pred - target[i]) ** 2;
    sw += wi;
  }
  return { coef, rms: Math.sqrt(se / Math.max(1e-9, sw)) };
}

// ---------------------------------------------------------------------
// the refinement
// ---------------------------------------------------------------------

/**
 * Per-view landmark visibility in FRONT-photo coordinates. When the head
 * turns to the patient's right, their LEFT half faces the camera; the left
 * half sits on the viewer-right of the front photo (x > centerX).
 * MediaPipe hallucinates the occluded half, so it gets low weight.
 */
function visibilityWeights(
  frontPx: { x: number }[],
  side: "left" | "right",
  centerX: number,
  faceW: number
): number[] {
  const towardViewerRight = side === "right" ? 1 : -1;
  return frontPx.map((p) => {
    const t = ((p.x - centerX) / (0.3 * faceW)) * towardViewerRight;
    const smooth = Math.min(1, Math.max(0, (t + 1) / 2)); // -1..1 -> 0..1
    return 0.25 + 0.75 * smooth;
  });
}

function corrCentered(a: number[], b: number[]): number {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.max(1e-9, Math.sqrt(da * db));
}

const PROTOCOL_YAW_RAD = (35 * Math.PI) / 180;

interface PreppedView {
  side: "left" | "right";
  uHat: number[]; // scale-normalised, mean-removed horizontal coords
  vis: number[];
  vRms: number; // residual of the in-plane v fit, /faceH
}

export function refineDepthMultiView(
  frontLm: number[][],
  frontW: number,
  frontH: number,
  sides: SideView[]
): MultiViewResult | null {
  if (frontLm.length < N_MESH || sides.length === 0) return null;

  // model x,y (+ mp z prior) in front-photo pixels, centered
  const X = new Array<number>(N_MESH);
  const Y = new Array<number>(N_MESH);
  const Zmp = new Array<number>(N_MESH);
  for (let i = 0; i < N_MESH; i++) {
    X[i] = frontLm[i][0] * frontW;
    Y[i] = frontLm[i][1] * frontH;
    Zmp[i] = frontLm[i][2] * frontW;
  }
  const minY = Math.min(...Y);
  const maxY = Math.max(...Y);
  const faceH = Math.max(1, maxY - minY);
  const minX = Math.min(...X);
  const maxX = Math.max(...X);
  const faceW = Math.max(1, maxX - minX);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const xc = X.map((x) => x - centerX);
  const yc = Y.map((y) => y - centerY);
  const mpMean = Zmp.reduce((a, b) => a + b, 0) / N_MESH;
  const xyRows = Array.from({ length: N_MESH }, (_, i) => [xc[i], yc[i], 1]);

  // ---- step 1: per-view scale from the in-plane v row -------------------
  const prepped: PreppedView[] = [];
  for (const sv of sides) {
    if (sv.landmarks.length < N_MESH) continue;
    const u = Array.from({ length: N_MESH }, (_, i) => sv.landmarks[i][0] * sv.width);
    const v = Array.from({ length: N_MESH }, (_, i) => sv.landmarks[i][1] * sv.height);
    const vis = visibilityWeights(
      Array.from({ length: N_MESH }, (_, i) => ({ x: X[i] })),
      sv.side,
      centerX,
      faceW
    );
    const fitV = wlsq(xyRows, v, vis);
    if (!fitV) continue;
    const s = Math.hypot(fitV.coef[0], fitV.coef[1]);
    if (s < 0.2 || s > 5) continue;
    let mu = 0;
    let mw = 0;
    for (let i = 0; i < N_MESH; i++) {
      mu += vis[i] * u[i];
      mw += vis[i];
    }
    mu /= Math.max(1e-9, mw);
    prepped.push({
      side: sv.side,
      uHat: u.map((ui) => (ui - mu) / s),
      vis,
      vRms: fitV.rms / s / faceH,
    });
  }
  if (prepped.length === 0) return null;

  let zSfm: number[] | null = null;
  const views: ViewReport[] = [];

  if (prepped.length >= 2) {
    // ---- two-view parallax: the u difference isolates depth curvature ---
    const A = prepped[0];
    const B = prepped[1];
    const wD = A.vis.map((w, i) => w * B.vis[i]);
    const d = A.uHat.map((ua, i) => ua - B.uHat[i]);
    const fitD = wlsq(xyRows, d, wD);
    if (!fitD) return null;
    const zRaw = d.map(
      (di, i) => di - (fitD.coef[0] * xc[i] + fitD.coef[1] * yc[i] + fitD.coef[2])
    );

    // per-view regression on the clean depth signal fixes cos(yaw) + scale
    const zRows = Array.from({ length: N_MESH }, (_, i) => [
      xc[i],
      yc[i],
      zRaw[i],
      1,
    ]);
    const fits = [A, B].map((view) => wlsq(zRows, view.uHat, view.vis));
    if (!fits[0] || !fits[1]) return null;

    // signs: views must turn opposite ways and agree on the depth scale
    const cosY = fits.map((f) => Math.min(0.999, Math.max(-0.999, f!.coef[0])));
    const sinAbs = cosY.map((c) => Math.sqrt(1 - c * c));
    const cz = fits.map((f) => f!.coef[2]);
    let best: { sA: 1 | -1; sB: 1 | -1; gammaD: number; err: number } | null = null;
    for (const sA of [1, -1] as const) {
      for (const sB of [1, -1] as const) {
        if (sA === sB) continue; // protocol: opposite turns
        const gA = (sA * sinAbs[0]) / (Math.abs(cz[0]) > 1e-6 ? cz[0] : 1e-6);
        const gB = (sB * sinAbs[1]) / (Math.abs(cz[1]) > 1e-6 ? cz[1] : 1e-6);
        if (gA <= 0 !== gB <= 0) continue; // must share sign
        const err = Math.abs(gA - gB) / Math.max(1e-6, Math.abs(gA) + Math.abs(gB));
        if (!best || err < best.err) best = { sA, sB, gammaD: (gA + gB) / 2, err };
      }
    }
    if (!best || best.err > 0.35 || Math.abs(best.gammaD) < 0.15) return null;

    zSfm = zRaw.map((z) => z / best!.gammaD);

    // The parallax equations admit a MIRROR solution (depth negated, both
    // yaws negated) with IDENTICAL residuals — the classic two-view Necker
    // ambiguity. The candidate loop above cannot break that tie, so which
    // mirror wins depends on arbitrary photo/order conventions; the loser is
    // an inside-out face. Anatomy breaks the tie: MediaPipe's relief is weak
    // on magnitude but reliable on direction (the nose points toward the
    // camera), so the global sign must agree with it.
    const corrMp = corrCentered(zSfm, Zmp);
    if (Math.abs(corrMp) < 0.15) return null; // cannot orient: fall back
    const flip = corrMp < 0 ? -1 : 1;
    if (flip < 0) zSfm = zSfm.map((z) => -z);

    const yawA = (Math.atan2(flip * best.sA * sinAbs[0], cosY[0]) * 180) / Math.PI;
    const yawB = (Math.atan2(flip * best.sB * sinAbs[1], cosY[1]) * 180) / Math.PI;
    const res = [fits[0]!.rms / faceH, fits[1]!.rms / faceH];
    views.push(
      {
        side: A.side,
        yawDeg: yawA,
        residual: res[0],
        accepted: Math.abs(yawA) >= 8 && Math.abs(yawA) <= 65 && res[0] <= 0.055,
      },
      {
        side: B.side,
        yawDeg: yawB,
        residual: res[1],
        accepted: Math.abs(yawB) >= 8 && Math.abs(yawB) <= 65 && res[1] <= 0.055,
      }
    );
    if (!views[0].accepted || !views[1].accepted) return null;
  } else {
    // ---- single side view: protocol yaw (35 deg) as the scale prior ------
    const A = prepped[0];
    const fitU = wlsq(xyRows, A.uHat, A.vis);
    if (!fitU) return null;
    // Degeneracy detector: a genuinely turned head leaves the depth
    // structure in u (yaw parallax) while v stays planar. Near-frontal
    // photos have u-residual ~ v-residual (both just noise) -> reject.
    const vRmsPx = A.vRms * faceH;
    if (fitU.rms < 2.0 * Math.max(vRmsPx, 1e-3)) return null;
    const resid = A.uHat.map(
      (ui, i) => ui - (fitU.coef[0] * xc[i] + fitU.coef[1] * yc[i] + fitU.coef[2])
    );
    // choose the yaw sign whose depth agrees with the MediaPipe relief
    const zPlus = resid.map((r) => r / Math.sin(PROTOCOL_YAW_RAD));
    const corrPlus = corrCentered(zPlus, Zmp);
    const sign = corrPlus >= 0 ? 1 : -1;
    if (Math.abs(corrPlus) < 0.2) return null; // too ambiguous: fall back
    zSfm = zPlus.map((z) => z * sign);
    const yawDeg = (sign * PROTOCOL_YAW_RAD * 180) / Math.PI;
    const residual = fitU.rms / faceH;
    views.push({
      side: A.side,
      yawDeg,
      residual,
      accepted: residual <= 0.12,
    });
    if (!views[0].accepted) return null;
  }

  // ---- stabilise: blend with the mp relief, clamp outliers, recenter ----
  // (single-view estimates lean harder on the MediaPipe prior)
  const sfmWeight = prepped.length >= 2 ? 0.75 : 0.5;
  const zCentered = zSfm!;
  const zMed = [...zCentered].sort((a, b) => a - b)[N_MESH >> 1];
  // Never ship an inside-out face: after sign resolution the nose tip must
  // still sit toward the camera relative to the face median (negative z in
  // the landmark convention). A fit that fails this is anatomically wrong no
  // matter how small its residual — fall back to the single-view mesh.
  if (zCentered[NOSE_TIP] > zMed - 0.02 * faceH) return null;
  const cap = 0.55 * faceH;
  const jump = 0.4 * faceH;
  const zPx = new Array<number>(frontLm.length);
  let mean = 0;
  for (let i = 0; i < N_MESH; i++) {
    let z = sfmWeight * (zCentered[i] + mpMean) + (1 - sfmWeight) * Zmp[i];
    z = Math.min(zMed + mpMean + cap, Math.max(zMed + mpMean - cap, z));
    z = Math.min(Zmp[i] + jump, Math.max(Zmp[i] - jump, z));
    zPx[i] = z;
    mean += z;
  }
  mean /= N_MESH;
  for (let i = 0; i < N_MESH; i++) zPx[i] += mpMean - mean; // keep mp centering
  // iris points (unused by the mesh triangulation) keep their mp z
  for (let i = N_MESH; i < frontLm.length; i++) zPx[i] = frontLm[i][2] * frontW;

  return { zPx, views };
}
