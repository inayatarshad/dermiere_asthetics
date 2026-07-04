"use client";

/**
 * Consultation photo capture (04_consultation-canvas-3d.md §2):
 * three poses — front, tilted-right, tilted-left — with ghost overlay
 * guides, face auto-check on capture, preview/retake, and an upload
 * fallback when no camera is available.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Upload,
  RefreshCcw,
  Check,
  AlertTriangle,
  ImageOff,
  SwitchCamera,
} from "lucide-react";
import { detectLandmarks } from "@/lib/face/landmarker";
import { downscale, canvasToBlob, loadImage } from "@/lib/img";
import { saveImage } from "@/lib/db";
import { Modal, Spinner } from "./ui";
import type { AssetKind } from "@/lib/types";

export interface CapturedPhoto {
  kind: AssetKind;
  storageUrl: string; // idb:<key>
  faceDetected: boolean;
}

const POSES: {
  kind: AssetKind;
  label: string;
  instruction: string;
  /** yaw direction the head ROTATES (turns), not a tilt: -1 right, +1 left, 0 front */
  turn: -1 | 0 | 1;
}[] = [
  {
    kind: "photo_front",
    label: "Front",
    instruction:
      "Straight on, neutral expression, hair off the face, even lighting",
    turn: 0,
  },
  {
    kind: "photo_right",
    label: "Turned right",
    instruction:
      "Rotate your head to YOUR RIGHT about 35 degrees, like checking your shoulder. Keep the chin level, do not tilt",
    turn: -1,
  },
  {
    kind: "photo_left",
    label: "Turned left",
    instruction:
      "Rotate your head to YOUR LEFT about 35 degrees, like checking your shoulder. Keep the chin level, do not tilt",
    turn: 1,
  },
];

interface ShotState {
  dataUrl: string | null;
  blobKey: string | null;
  faceDetected: boolean;
  checking: boolean;
}

export function CameraCapture({
  open,
  onClose,
  onComplete,
  requiredKinds = ["photo_front"],
  title = "Capture consultation photos",
}: {
  open: boolean;
  onClose: () => void;
  onComplete: (photos: CapturedPhoto[]) => void;
  requiredKinds?: AssetKind[];
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraState, setCameraState] = useState<
    "starting" | "ready" | "unavailable"
  >("starting");
  const [poseIndex, setPoseIndex] = useState(0);
  const [shots, setShots] = useState<Record<string, ShotState>>({});
  // Booth default (T4): rear camera, so staff photograph the patient.
  // Laptops without a rear camera fall back to whatever is available.
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [mirrored, setMirrored] = useState(false);

  const pose = POSES[poseIndex];
  const shot = shots[pose.kind];

  // -- camera lifecycle -------------------------------------------------
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCameraState("starting");
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 1280 },
            facingMode: { ideal: facing },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        // mirror the preview only for a true selfie camera
        const actual =
          stream.getVideoTracks()[0]?.getSettings().facingMode ?? facing;
        setMirrored(actual === "user");
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraState("ready");
      } catch {
        if (!cancelled) setCameraState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, facing]);

  useEffect(() => {
    if (!open) {
      setShots({});
      setPoseIndex(0);
    }
  }, [open]);

  const processCanvas = useCallback(
    async (source: HTMLCanvasElement, kind: AssetKind) => {
      const canvas = downscale(source, 1280);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      setShots((s) => ({
        ...s,
        [kind]: { dataUrl, blobKey: null, faceDetected: false, checking: true },
      }));
      // face auto-check + persist, off the interaction path
      let faceDetected = false;
      try {
        const lm = await detectLandmarks(canvas);
        faceDetected = !!lm;
      } catch {
        faceDetected = false;
      }
      const key = crypto.randomUUID();
      const blob = await canvasToBlob(canvas, 0.9);
      await saveImage(key, blob);
      setShots((s) => ({
        ...s,
        [kind]: { dataUrl, blobKey: key, faceDetected, checking: false },
      }));
    },
    []
  );

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    if (mirrored) {
      // un-mirror selfie previews back to true orientation
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    processCanvas(canvas, pose.kind);
  }, [pose.kind, processCanvas, mirrored]);

  const onFile = useCallback(
    async (file: File) => {
      const url = URL.createObjectURL(file);
      try {
        const img = await loadImage(url);
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        await processCanvas(canvas, pose.kind);
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    [pose.kind, processCanvas]
  );

  const done = () => {
    const photos: CapturedPhoto[] = [];
    for (const p of POSES) {
      const s = shots[p.kind];
      if (s?.blobKey) {
        photos.push({
          kind: p.kind,
          storageUrl: `idb:${s.blobKey}`,
          faceDetected: s.faceDetected,
        });
      }
    }
    onComplete(photos);
  };

  const capturedCount = POSES.filter((p) => shots[p.kind]?.blobKey).length;
  const requirementsMet = requiredKinds.every((k) => shots[k]?.blobKey);
  const anyChecking = Object.values(shots).some((s) => s.checking);

  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      {/* pose stepper */}
      <div className="flex gap-2 mb-4">
        {POSES.map((p, i) => {
          const s = shots[p.kind];
          return (
            <button
              key={p.kind}
              onClick={() => setPoseIndex(i)}
              className={`chip ${i === poseIndex ? "chip-active" : ""}`}
            >
              {s?.blobKey && <Check size={13} className="text-mint-500" />}
              {p.label}
              {requiredKinds.includes(p.kind) && !s?.blobKey && (
                <span className="text-danger">*</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid md:grid-cols-[1.4fr_1fr] gap-4">
        {/* live stage */}
        <div
          className="relative rounded-2xl overflow-hidden bg-ink-900/90"
          style={{ aspectRatio: "4 / 3.4" }}
        >
          {shot?.dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shot.dataUrl}
              alt={`${pose.label} preview`}
              className="w-full h-full object-cover"
            />
          ) : cameraState === "unavailable" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 gap-3 p-6 text-center">
              <ImageOff size={30} />
              <p className="text-sm max-w-xs">
                No camera detected. Upload a photo for this pose instead.
              </p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: mirrored ? "scaleX(-1)" : "none" }}
              />
              <button
                className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-black/45 text-white flex items-center justify-center backdrop-blur-md hover:bg-black/60 transition-colors"
                onClick={() =>
                  setFacing((f) => (f === "user" ? "environment" : "user"))
                }
                title="Switch camera"
                aria-label="Switch camera"
              >
                <SwitchCamera size={17} />
              </button>
              {cameraState === "starting" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Spinner className="w-7 h-7" />
                </div>
              )}
              {/* ghost overlay guide: for side poses this communicates a
                  head ROTATION (yaw), never a tilt — narrower oval, facial
                  midline swung toward the nose direction, and a turn arrow.
                  Mirrored preview flips the on-screen direction. */}
              <svg
                viewBox="0 0 100 100"
                className="absolute inset-0 w-full h-full pointer-events-none"
                preserveAspectRatio="xMidYMid meet"
              >
                {pose.turn === 0 ? (
                  <g opacity="0.75">
                    <ellipse
                      cx="50"
                      cy="46"
                      rx="20"
                      ry="26"
                      fill="none"
                      stroke="#8BE8D5"
                      strokeWidth="0.7"
                      strokeDasharray="2.4 2"
                    />
                    <line
                      x1="50"
                      y1="22"
                      x2="50"
                      y2="70"
                      stroke="#8BE8D5"
                      strokeWidth="0.35"
                      strokeDasharray="1.4 2"
                    />
                    <path
                      d="M36 74 Q50 82 64 74"
                      fill="none"
                      stroke="#8BE8D5"
                      strokeWidth="0.5"
                      strokeDasharray="2 2"
                    />
                  </g>
                ) : (
                  (() => {
                    const d = (mirrored ? -1 : 1) * pose.turn;
                    const mid = 50 + d * 10; // facial midline swings with the nose
                    return (
                      <g opacity="0.8">
                        {/* narrower head oval, slightly shifted */}
                        <ellipse
                          cx={50 + d * 2}
                          cy="46"
                          rx="16.5"
                          ry="26"
                          fill="none"
                          stroke="#8BE8D5"
                          strokeWidth="0.7"
                          strokeDasharray="2.4 2"
                        />
                        {/* swung facial midline stays VERTICAL: chin level */}
                        <line
                          x1={mid}
                          y1="24"
                          x2={mid}
                          y2="68"
                          stroke="#8BE8D5"
                          strokeWidth="0.4"
                          strokeDasharray="1.4 2"
                        />
                        {/* nose wedge pointing the turn direction */}
                        <path
                          d={`M ${mid} 44 L ${mid + d * 5.5} 49 L ${mid} 52 Z`}
                          fill="rgba(139,232,213,0.55)"
                          stroke="#8BE8D5"
                          strokeWidth="0.4"
                        />
                        {/* rotation arrow over the head */}
                        <path
                          d={`M ${50 - d * 13} 15 A 14 7 0 0 ${d > 0 ? 1 : 0} ${50 + d * 12} 13.5`}
                          fill="none"
                          stroke="#8BE8D5"
                          strokeWidth="0.9"
                        />
                        <path
                          d={`M ${50 + d * 12} 13.5 l ${-d * 3.4} -2.2 l ${d * 0.6} 3.6 Z`}
                          fill="#8BE8D5"
                        />
                        {/* shoulders stay square to the camera */}
                        <path
                          d="M36 74 Q50 82 64 74"
                          fill="none"
                          stroke="#8BE8D5"
                          strokeWidth="0.5"
                          strokeDasharray="2 2"
                        />
                      </g>
                    );
                  })()
                )}
              </svg>
            </>
          )}

          {/* pose banner */}
          <div className="absolute top-3 left-3 right-3 flex justify-center">
            <span className="rounded-full bg-black/45 text-white text-xs px-4 py-1.5 backdrop-blur-md">
              {pose.label}: {pose.instruction}
            </span>
          </div>

          {shot?.checking && (
            <div className="absolute bottom-3 left-3 rounded-full bg-black/45 text-white text-xs px-3 py-1.5 flex items-center gap-2 backdrop-blur-md">
              <Spinner className="w-3.5 h-3.5" /> Checking face...
            </div>
          )}
          {shot && !shot.checking && (
            <div
              className={`absolute bottom-3 left-3 rounded-full text-xs px-3 py-1.5 flex items-center gap-1.5 backdrop-blur-md ${
                shot.faceDetected
                  ? "bg-mint-500/90 text-white"
                  : "bg-warning/90 text-white"
              }`}
            >
              {shot.faceDetected ? (
                <>
                  <Check size={13} /> Face detected
                </>
              ) : (
                <>
                  <AlertTriangle size={13} /> No clear face found. Consider a retake.
                </>
              )}
            </div>
          )}
        </div>

        {/* controls */}
        <div className="flex flex-col gap-3">
          <p className="caption leading-relaxed">
            Consistent framing matters: it improves the 3D fit and keeps
            before/after comparisons clean. Align the face with the guide,
            then capture.
          </p>

          {shot?.dataUrl ? (
            <button
              className="btn btn-secondary"
              onClick={() =>
                setShots((s) => {
                  const next = { ...s };
                  delete next[pose.kind];
                  return next;
                })
              }
            >
              <RefreshCcw size={15} />
              Retake {pose.label.toLowerCase()}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={capture}
              disabled={cameraState !== "ready"}
            >
              <Camera size={16} />
              Capture {pose.label.toLowerCase()}
            </button>
          )}

          <button
            className="btn btn-secondary"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={15} />
            Upload instead
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />

          {shot?.blobKey && poseIndex < POSES.length - 1 && (
            <button
              className="btn btn-ghost"
              onClick={() => setPoseIndex(poseIndex + 1)}
            >
              Next pose
            </button>
          )}

          <div className="flex-1" />

          <div className="caption">
            {capturedCount} of {POSES.length} poses captured
            {requiredKinds.length > 0 && " · * required"}
          </div>
          <button
            className="btn btn-primary"
            disabled={!requirementsMet || anyChecking}
            onClick={done}
          >
            <Check size={16} />
            Use {capturedCount} photo{capturedCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
