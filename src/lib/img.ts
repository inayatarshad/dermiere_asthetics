/**
 * Image helpers: load, downscale (model inputs + storage stay lean),
 * and data-URL conversion.
 */

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/** Downscale so the longest edge is <= maxEdge. Returns a canvas. */
export function downscale(
  img: HTMLImageElement | HTMLCanvasElement,
  maxEdge = 1280
): HTMLCanvasElement {
  const w = img.width;
  const h = img.height;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  quality = 0.92
): string {
  return canvas.toDataURL("image/jpeg", quality);
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality = 0.92
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality
    );
  });
}

/** Prepare an image for the AI model: JPEG data-URL, longest edge <= 1024. */
export async function toModelInput(src: string): Promise<string> {
  const img = await loadImage(src);
  const canvas = downscale(img, 1024);
  return canvasToDataUrl(canvas, 0.9);
}
