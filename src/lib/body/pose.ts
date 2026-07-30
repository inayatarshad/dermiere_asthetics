"use client";

/**
 * MediaPipe PoseLandmarker singleton - body-part detection for the
 * Visualization Studio's contour mode (owner 2026-07-23: "some sort of way
 * where it just identifies where the arm is in the picture").
 *
 * Mirrors lib/face/landmarker.ts: fully self-hosted (WASM runtime +
 * pose_landmarker_lite.task served from /public), GPU with CPU fallback.
 * Returns 33 normalized landmarks [x, y, z, visibility] or null.
 */

import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let instancePromise: Promise<PoseLandmarker> | null = null;

async function createPoseLandmarker(delegate: "GPU" | "CPU") {
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: "/models/pose_landmarker_lite.task",
      delegate,
    },
    runningMode: "IMAGE",
    numPoses: 1,
  });
}

export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!instancePromise) {
    instancePromise = createPoseLandmarker("GPU").catch((err) => {
      console.warn("[pose] GPU delegate failed, falling back to CPU", err);
      return createPoseLandmarker("CPU");
    });
  }
  return instancePromise;
}

/** MediaPipe Pose landmark indices used by the contour mapper. */
export const POSE = {
  shoulderL: 11,
  shoulderR: 12,
  elbowL: 13,
  elbowR: 14,
  wristL: 15,
  wristR: 16,
  hipL: 23,
  hipR: 24,
  kneeL: 25,
  kneeR: 26,
} as const;

export async function detectPose(
  image: HTMLImageElement | HTMLCanvasElement | ImageBitmap
): Promise<number[][] | null> {
  const landmarker = await getPoseLandmarker();
  const result = landmarker.detect(image);
  const pose = result.landmarks?.[0];
  if (!pose || pose.length === 0) return null;
  return pose.map((p) => [p.x, p.y, p.z, p.visibility ?? 1]);
}
