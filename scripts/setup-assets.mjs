/**
 * Copies the MediaPipe tasks-vision WASM runtime from node_modules into /public
 * so the face landmarker runs fully self-hosted (no CDN dependency — critical
 * for offline booth reliability). Runs on postinstall, so it works locally and
 * on Vercel builds alike.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(root, "public", "mediapipe", "wasm");

if (!existsSync(src)) {
  console.warn("[setup-assets] @mediapipe/tasks-vision wasm not found — skipping copy.");
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("[setup-assets] MediaPipe WASM copied to public/mediapipe/wasm");
