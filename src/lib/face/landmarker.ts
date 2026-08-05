"use client";

/**
 * MediaPipe FaceLandmarker singleton - the "fast path" 3D pipeline
 * (knowledge base / 04_consultation-canvas-3d.md §1).
 *
 * Fully self-hosted: WASM runtime + model file are served from /public so
 * the canvas works with zero network (booth reliability requirement).
 */

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let instancePromise: Promise<FaceLandmarker> | null = null;

async function createLandmarker(delegate: "GPU" | "CPU") {
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: "/models/face_landmarker.task",
      delegate,
    },
    runningMode: "IMAGE",
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}

export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!instancePromise) {
    instancePromise = createLandmarker("GPU").catch((err) => {
      console.warn("[face] GPU delegate failed, falling back to CPU", err);
      return createLandmarker("CPU");
    });
  }
  return instancePromise;
}

/**
 * Detect 3D landmarks on an image. Returns normalized [x, y, z][] (478 points
 * - 468 mesh + 10 iris) or null when no face is found.
 */
export async function detectLandmarks(
  image: HTMLImageElement | HTMLCanvasElement | ImageBitmap
): Promise<number[][] | null> {
  const landmarker = await getFaceLandmarker();
  // MediaPipe's TFLite runtime reports successful XNNPACK initialization
  // through console.error. Next's development overlay treats any call to
  // console.error as an application failure, even though detection succeeds.
  // Scope the filter to this synchronous vendor call and this exact benign
  // diagnostic; every genuine error continues to reach the console.
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const message = args.map(String).join(" ");
    if (message.includes("Created TensorFlow Lite XNNPACK delegate for CPU")) return;
    originalError(...args);
  };
  let result: ReturnType<FaceLandmarker["detect"]>;
  try {
    result = landmarker.detect(image);
  } finally {
    console.error = originalError;
  }
  const face = result.faceLandmarks?.[0];
  if (!face || face.length === 0) return null;
  return face.map((p) => [p.x, p.y, p.z]);
}
