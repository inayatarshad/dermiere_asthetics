"use client";

/**
 * CAPTURE Visualization Studio - deterministic on-device renderers.
 *
 * Two preset families, both illustrative previews:
 *  - Red-light glow (MitoRedLight): tone, texture, warmth and bloom
 *    composed with canvas filter passes.
 *  - Body contour (Exomere): an elliptical inward pinch warp (inverse
 *    mapping + bilinear sampling) that slims/firms a chosen region.
 *
 * Like the face warp, these run offline with no API key - the AI pass is
 * an optional upgrade, never a dependency (booth-grade reliability).
 */

export interface GlowParams {
  /** radiance / bloom 0-100 */
  glow: number;
  /** tone evenness 0-100 */
  tone: number;
  /** texture refinement (smoothing) 0-100 */
  texture: number;
  /** warm light bias 0-100 */
  warmth: number;
}

export interface ContourRegion {
  /** ellipse center + radii, normalized to image size (0..1) */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface ContourParams {
  /** inward slimming strength 0-100 */
  strength: number;
  /** skin smoothing inside the region 0-100 */
  firmness: number;
  region: ContourRegion;
}

const MAX_W = 1080;

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

function baseCanvas(img: HTMLImageElement): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const scale = Math.min(1, MAX_W / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

// ---------------------------------------------------------------------
// Red-light glow
// ---------------------------------------------------------------------

export function renderGlow(
  img: HTMLImageElement,
  p: GlowParams
): HTMLCanvasElement {
  const { canvas, ctx } = baseCanvas(img);
  const w = canvas.width;
  const h = canvas.height;

  const t = p.texture / 100;
  const g = p.glow / 100;
  const tone = p.tone / 100;
  const warm = p.warmth / 100;

  // 1. texture refinement - soft-focus blend (mid-frequency smoothing)
  if (t > 0.02) {
    ctx.save();
    ctx.filter = `blur(${(1.5 + t * 4).toFixed(1)}px)`;
    ctx.globalAlpha = 0.28 + t * 0.34;
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  }

  // 2. tone evenness - gentle saturation/contrast normalization
  if (tone > 0.02) {
    ctx.save();
    ctx.filter = `saturate(${(1 + tone * 0.14).toFixed(2)}) contrast(${(1 - tone * 0.08).toFixed(2)}) brightness(${(1 + tone * 0.05).toFixed(2)})`;
    ctx.globalAlpha = 0.5 * tone + 0.15;
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  }

  // 3. radiant bloom - blurred screen pass, brightest where skin is lit
  if (g > 0.02) {
    ctx.save();
    ctx.filter = `blur(${(6 + g * 10).toFixed(1)}px) brightness(${(1.05 + g * 0.18).toFixed(2)})`;
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.16 + g * 0.3;
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  }

  // 4. warm light bias - soft-light warm wash
  if (warm > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = `rgba(255, 196, 140, ${(0.1 + warm * 0.22).toFixed(3)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // 5. final lift
  ctx.save();
  ctx.filter = `brightness(${(1 + g * 0.05).toFixed(3)})`;
  ctx.globalAlpha = 1;
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();

  return canvas;
}

// ---------------------------------------------------------------------
// Body contour (elliptical pinch)
// ---------------------------------------------------------------------

export function renderContour(
  img: HTMLImageElement,
  p: ContourParams
): HTMLCanvasElement {
  return renderContourRegions(img, {
    strength: p.strength,
    firmness: p.firmness,
    regions: [p.region],
  });
}

export interface MultiContourParams {
  strength: number;
  firmness: number;
  /** One pinch ellipse per treated area (e.g. both arms at once). */
  regions: ContourRegion[];
}

/**
 * Multi-region variant: each ellipse pinches horizontally toward its own
 * vertical axis (same inverse-mapped warp as before), so pose-detected
 * areas - both upper arms, both thighs, the waistline - slim together
 * in one pass.
 */
export function renderContourRegions(
  img: HTMLImageElement,
  p: MultiContourParams
): HTMLCanvasElement {
  const { canvas, ctx } = baseCanvas(img);
  const w = canvas.width;
  const h = canvas.height;

  const s = (p.strength / 100) * 0.42; // max horizontal compression factor
  const px = p.regions.map((r) => ({
    CX: r.cx * w,
    CY: r.cy * h,
    RX: Math.max(8, r.rx * w),
    RY: Math.max(8, r.ry * h),
  }));

  if (s > 0.004 && px.length > 0) {
    const src = ctx.getImageData(0, 0, w, h);
    const out = ctx.createImageData(w, h);
    const sd = src.data;
    const od = out.data;

    // start as a copy, warp only inside each ellipse's bounds
    od.set(sd);

    for (const { CX, CY, RX, RY } of px) {
      const x0 = Math.max(0, Math.floor(CX - RX));
      const x1 = Math.min(w - 1, Math.ceil(CX + RX));
      const y0 = Math.max(0, Math.floor(CY - RY));
      const y1 = Math.min(h - 1, Math.ceil(CY + RY));

      for (let y = y0; y <= y1; y++) {
        const v = (y - CY) / RY;
        for (let x = x0; x <= x1; x++) {
          const u = (x - CX) / RX;
          const r2 = u * u + v * v;
          if (r2 >= 1) continue;
          // smooth falloff: 0 at boundary/center-axis, peak mid-region
          const fall = (1 - r2) * (1 - r2);
          // inverse map: sample further from the vertical axis -> compression
          const sx = CX + (x - CX) * (1 + s * fall);
          // horizontal-only warp: sample along this row with linear blend
          const fx = Math.max(0, Math.min(w - 2, sx));
          const ix = Math.floor(fx);
          const dx = fx - ix;
          const base = (y * w + ix) * 4;
          const di = (y * w + x) * 4;
          for (let c = 0; c < 4; c++) {
            od[di + c] = sd[base + c] * (1 - dx) + sd[base + 4 + c] * dx;
          }
        }
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  // firmness - localized smoothing clipped to the union of regions
  const f = p.firmness / 100;
  if (f > 0.03 && px.length > 0) {
    const smooth = document.createElement("canvas");
    smooth.width = w;
    smooth.height = h;
    const sctx = smooth.getContext("2d")!;
    sctx.filter = `blur(${(1 + f * 3.4).toFixed(1)}px) saturate(${(1 + f * 0.08).toFixed(2)})`;
    sctx.drawImage(canvas, 0, 0);

    ctx.save();
    ctx.beginPath();
    for (const { CX, CY, RX, RY } of px) {
      ctx.moveTo(CX + RX, CY);
      ctx.ellipse(CX, CY, RX, RY, 0, 0, Math.PI * 2);
    }
    ctx.clip();
    ctx.globalAlpha = 0.3 + f * 0.4;
    ctx.drawImage(smooth, 0, 0);
    ctx.restore();
  }

  return canvas;
}

// ---------------------------------------------------------------------
// Pose -> contour regions ("identifies where the arm is in the picture")
// ---------------------------------------------------------------------

const clamp01 = (n: number, lo = 0.02, hi = 0.98) =>
  Math.max(lo, Math.min(hi, n));

/**
 * Derive the pinch ellipses for a preset from MediaPipe Pose landmarks
 * ([x, y, z, visibility], normalized). Returns null when the needed
 * joints aren't confidently visible - callers fall back to the manual
 * treatment window.
 */
export function regionsFromPose(
  landmarks: number[][],
  presetId: string
): ContourRegion[] | null {
  const pt = (i: number) => landmarks[i];
  const visible = (...idx: number[]) =>
    idx.every((i) => (pt(i)?.[3] ?? 0) > 0.5);
  const mid = (a: number[], b: number[]) => ({
    x: (a[0] + b[0]) / 2,
    y: (a[1] + b[1]) / 2,
  });

  // torso anchors (MediaPipe Pose: 11/12 shoulders, 23/24 hips)
  if (!visible(11, 12, 23, 24)) return null;
  const shL = pt(11), shR = pt(12), hipL = pt(23), hipR = pt(24);
  const midSh = mid(shL, shR);
  const midHip = mid(hipL, hipR);
  const hipSpan = Math.max(0.06, Math.abs(hipL[0] - hipR[0]));
  const torsoH = Math.max(0.08, midHip.y - midSh.y);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const ell = (cx: number, cy: number, rx: number, ry: number): ContourRegion => ({
    cx: clamp01(cx),
    cy: clamp01(cy),
    rx: clamp01(rx, 0.03, 0.48),
    ry: clamp01(ry, 0.03, 0.45),
  });

  switch (presetId) {
    case "abdomen":
      return [
        ell(midHip.x, lerp(midSh.y, midHip.y, 0.72), hipSpan * 0.85, torsoH * 0.32),
      ];
    case "waist":
      return [
        ell(midHip.x, lerp(midSh.y, midHip.y, 0.55), hipSpan * 0.95, torsoH * 0.24),
      ];
    case "hips":
      return [
        ell(midHip.x, midHip.y + torsoH * 0.08, hipSpan * 1.02, torsoH * 0.24),
      ];
    case "thighs": {
      if (!visible(25, 26)) return null;
      const kneeL = pt(25), kneeR = pt(26);
      const legL = mid(hipL, kneeL);
      const legR = mid(hipR, kneeR);
      const legRy = (y1: number, y2: number) =>
        Math.max(0.05, Math.abs(y2 - y1) * 0.42);
      return [
        ell(legL.x, legL.y, hipSpan * 0.42, legRy(hipL[1], kneeL[1])),
        ell(legR.x, legR.y, hipSpan * 0.42, legRy(hipR[1], kneeR[1])),
      ];
    }
    case "arms": {
      if (!visible(13, 14)) return null;
      const elL = pt(13), elR = pt(14);
      const armL = mid(shL, elL);
      const armR = mid(shR, elR);
      const armRy = (y1: number, y2: number) =>
        Math.max(0.05, Math.abs(y2 - y1) * 0.6);
      return [
        ell(armL.x, armL.y, hipSpan * 0.3, armRy(shL[1], elL[1])),
        ell(armR.x, armR.y, hipSpan * 0.3, armRy(shR[1], elR[1])),
      ];
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------
// Region presets (normalized starting points; user fine-tunes)
// ---------------------------------------------------------------------

export const CONTOUR_PRESETS: Array<{
  id: string;
  label: string;
  region: ContourRegion;
}> = [
  { id: "abdomen", label: "Abdomen", region: { cx: 0.5, cy: 0.55, rx: 0.3, ry: 0.2 } },
  { id: "waist", label: "Waist", region: { cx: 0.5, cy: 0.47, rx: 0.34, ry: 0.14 } },
  { id: "hips", label: "Hips", region: { cx: 0.5, cy: 0.65, rx: 0.33, ry: 0.16 } },
  { id: "thighs", label: "Thighs", region: { cx: 0.5, cy: 0.78, rx: 0.3, ry: 0.16 } },
  { id: "arms", label: "Upper arm", region: { cx: 0.26, cy: 0.4, rx: 0.13, ry: 0.18 } },
];

/** Compose a labeled side-by-side takeaway (before | after). */
export function composeSideBySide(
  before: HTMLImageElement,
  after: HTMLImageElement,
  disclaimer: string
): HTMLCanvasElement {
  const H = 900;
  const wB = Math.round((before.naturalWidth / before.naturalHeight) * H);
  const wA = Math.round((after.naturalWidth / after.naturalHeight) * H);
  const gap = 6;
  const canvas = document.createElement("canvas");
  canvas.width = wB + wA + gap;
  canvas.height = H + 54;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#1C1A16";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(before, 0, 0, wB, H);
  ctx.drawImage(after, wB + gap, 0, wA, H);

  const pill = (text: string, x: number) => {
    ctx.save();
    ctx.font = "600 22px Jost, system-ui, sans-serif";
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(28,26,22,0.72)";
    ctx.beginPath();
    ctx.roundRect(x, 18, tw + 36, 40, 20);
    ctx.fill();
    ctx.fillStyle = "#F6EBD3";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + 18, 39);
    ctx.restore();
  };
  pill("BEFORE", 18);
  pill("AFTER · PREVIEW", wB + gap + 18);

  ctx.font = "500 17px Jost, system-ui, sans-serif";
  ctx.fillStyle = "#C9BFA8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(disclaimer, canvas.width / 2, H + 27, canvas.width - 40);
  return canvas;
}
