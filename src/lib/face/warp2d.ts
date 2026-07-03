"use client";

/**
 * 2D landmark-driven photo warp — the instant, on-device preview layer of
 * the AI before/after loop (05_ai-before-after.md §6 "live preview").
 *
 * The photo is treated as a triangulated texture (same triangulation as the
 * 3D canvas). Sliders displace the nose landmarks via the shared morph
 * engine; each affected triangle is redrawn with the affine transform that
 * maps its source triangle to its displaced destination. Runs in
 * milliseconds, fully offline — the booth-reliable half of the hero moment.
 * The photoreal, identity-preserving pass is the server-side model call.
 */

import type { Pt } from "./geometry";
import { applyMorphs, faceTriangles } from "./geometry";

export interface WarpResult {
  canvas: HTMLCanvasElement;
  moved: boolean;
}

export function warpPhoto(
  image: HTMLImageElement | HTMLCanvasElement,
  basePx: Pt[],
  params: Record<string, number>
): WarpResult {
  const w = image.width;
  const h = image.height;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, w, h);

  const dstPx = applyMorphs(basePx, params);
  if (dstPx === basePx) return { canvas: out, moved: false };

  const tris = faceTriangles();
  const EPS = 0.05;
  let movedAny = false;

  for (let t = 0; t < tris.length; t += 3) {
    const i0 = tris[t];
    const i1 = tris[t + 1];
    const i2 = tris[t + 2];
    const s0 = basePx[i0];
    const s1 = basePx[i1];
    const s2 = basePx[i2];
    const d0 = dstPx[i0];
    const d1 = dstPx[i1];
    const d2 = dstPx[i2];
    if (!s0 || !s1 || !s2) continue;

    const moved =
      Math.abs(d0.x - s0.x) > EPS ||
      Math.abs(d0.y - s0.y) > EPS ||
      Math.abs(d1.x - s1.x) > EPS ||
      Math.abs(d1.y - s1.y) > EPS ||
      Math.abs(d2.x - s2.x) > EPS ||
      Math.abs(d2.y - s2.y) > EPS;
    if (!moved) continue;
    movedAny = true;

    drawWarpedTriangle(ctx, image, s0, s1, s2, d0, d1, d2);
  }

  return { canvas: out, moved: movedAny };
}

function drawWarpedTriangle(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement,
  s0: Pt,
  s1: Pt,
  s2: Pt,
  d0: Pt,
  d1: Pt,
  d2: Pt
) {
  // Expand the clip slightly from the centroid to hide anti-aliased seams.
  const cx = (d0.x + d1.x + d2.x) / 3;
  const cy = (d0.y + d1.y + d2.y) / 3;
  const grow = (p: Pt) => ({
    x: cx + (p.x - cx) * 1.03 + Math.sign(p.x - cx) * 0.35,
    y: cy + (p.y - cy) * 1.03 + Math.sign(p.y - cy) * 0.35,
  });
  const g0 = grow(d0);
  const g1 = grow(d1);
  const g2 = grow(d2);

  // Affine M mapping source triangle -> destination triangle.
  const a00 = s1.x - s0.x;
  const a01 = s2.x - s0.x;
  const a10 = s1.y - s0.y;
  const a11 = s2.y - s0.y;
  const det = a00 * a11 - a01 * a10;
  if (Math.abs(det) < 1e-6) return;
  const b00 = d1.x - d0.x;
  const b01 = d2.x - d0.x;
  const b10 = d1.y - d0.y;
  const b11 = d2.y - d0.y;

  // M = B * A^-1
  const m00 = (b00 * a11 - b01 * a10) / det;
  const m01 = (-b00 * a01 + b01 * a00) / det;
  const m10 = (b10 * a11 - b11 * a10) / det;
  const m11 = (-b10 * a01 + b11 * a00) / det;
  const tx = d0.x - (m00 * s0.x + m01 * s0.y);
  const ty = d0.y - (m10 * s0.x + m11 * s0.y);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(g0.x, g0.y);
  ctx.lineTo(g1.x, g1.y);
  ctx.lineTo(g2.x, g2.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(m00, m10, m01, m11, tx, ty);
  ctx.drawImage(image, 0, 0, image.width, image.height);
  ctx.restore();
}

/**
 * Burn the standing disclaimer into a generated after-image
 * (05_ai-before-after.md §8: disclaimer on every output).
 */
export function burnDisclaimer(
  source: HTMLCanvasElement | HTMLImageElement,
  text: string
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source, 0, 0);

  const barH = Math.max(26, Math.round(canvas.height * 0.045));
  const grad = ctx.createLinearGradient(0, canvas.height - barH * 2, 0, canvas.height);
  grad.addColorStop(0, "rgba(14, 42, 38, 0)");
  grad.addColorStop(1, "rgba(14, 42, 38, 0.62)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, canvas.height - barH * 2, canvas.width, barH * 2);

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `500 ${Math.max(11, Math.round(barH * 0.42))}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height - barH * 0.7);
  return canvas;
}
