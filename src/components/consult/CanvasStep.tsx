"use client";

/**
 * 3D Consultation Canvas step (04_consultation-canvas-3d.md): the doctor's
 * interactive face. Tool rail (Move / Draw / Sculpt), semantic morph
 * handles, feature highlight + scale, annotations that stick to the mesh,
 * and the handoff that pre-sets the AI sliders.
 */

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Hand,
  PenLine,
  Wand2,
  Camera,
  RotateCcw,
  Sparkles,
  Undo2,
  Trash2,
  ScanFace,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useFaceData } from "@/lib/hooks";
import { activeTemplatesFor } from "@/lib/templates";
import type { AnnotationStroke, Consultation, Patient } from "@/lib/types";
import type { FeatureId } from "@/lib/face/geometry";
import { GlassCard, Chip, EmptyState, Spinner } from "@/components/ui";
import { CameraCapture } from "@/components/CameraCapture";
import { MintSlider } from "@/components/MintSlider";
import { BotoxZoneMap } from "@/components/BotoxZoneMap";
import type { CanvasTool } from "@/components/canvas/FaceScene";

const FaceScene = dynamic(
  () => import("@/components/canvas/FaceScene").then((m) => m.FaceScene),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    ),
  }
);

const DRAW_COLORS = ["#34D3B0", "#E7B549", "#E06A6A", "#0E2A26"];

const FEATURES: { id: FeatureId; label: string }[] = [
  { id: "nose", label: "Nose" },
  { id: "lips", label: "Lips" },
  { id: "cheeks", label: "Cheeks" },
  { id: "jaw", label: "Jawline" },
  { id: "chin", label: "Chin" },
  { id: "brow", label: "Brow" },
  { id: "under_eye", label: "Under-eye" },
];

/** Template region -> canvas feature highlight. */
const REGION_TO_FEATURE: Record<string, FeatureId> = {
  nose: "nose",
  lips: "lips",
  chin: "chin",
  jaw: "jaw",
  forehead: "brow",
  under_eye: "under_eye",
};

export function CanvasStep({
  consultation,
  patient,
  onGeneratePreview,
}: {
  consultation: Consultation;
  patient: Patient;
  onGeneratePreview: () => void;
}) {
  const assets = useStore((s) => s.assets);
  const addAsset = useStore((s) => s.addAsset);
  const saveCanvasState = useStore((s) => s.saveCanvasState);

  // The brief arms the canvas: every active procedure supplies its morph
  // handles (union, grouped), the primary supplies the region emphasis.
  const activeTemplates = useMemo(
    () =>
      activeTemplatesFor(
        consultation.brief.interests,
        consultation.brief.primary_interest
      ),
    [consultation.brief.interests, consultation.brief.primary_interest]
  );
  const template = activeTemplates[0];
  const handleGroups = activeTemplates.filter(
    (t) => t.canvas_handles.length > 0
  );

  const frontPhoto = useMemo(() => {
    const all = assets
      .filter((a) => a.patient_id === patient.id && a.kind === "photo_front")
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return all.find((a) => a.consultation_id === consultation.id) ?? all[0];
  }, [assets, patient.id, consultation.id]);

  const face = useFaceData(frontPhoto);

  const [tool, setTool] = useState<CanvasTool>("move");
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);
  const [drawSize, setDrawSize] = useState(7);
  const [sculptStrength, setSculptStrength] = useState(45);
  const [sculptDirection, setSculptDirection] = useState<1 | -1>(-1);
  const [highlight, setHighlight] = useState<FeatureId | null>(
    template ? (REGION_TO_FEATURE[template.region] ?? null) : null
  );
  const [morphs, setMorphs] = useState<Record<string, number>>(
    consultation.canvas_state.morphs ?? {}
  );
  const [annotations, setAnnotations] = useState<AnnotationStroke[]>(
    consultation.canvas_state.annotations ?? []
  );
  const [resetToken, setResetToken] = useState(0);
  const [captureOpen, setCaptureOpen] = useState(false);

  // persist canvas state (debounced)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      saveCanvasState(consultation.id, { morphs, annotations });
    }, 500);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [morphs, annotations, consultation.id, saveCanvasState]);

  const setMorph = (key: string, value: number) =>
    setMorphs((m) => ({ ...m, [key]: value }));

  const resetAll = () => {
    setMorphs({});
    setAnnotations([]);
    setResetToken((t) => t + 1);
  };

  const scaleKey = highlight ? `scale_${highlight}` : null;

  if (!frontPhoto) {
    return (
      <EmptyState
        icon={<ScanFace size={30} />}
        title="No front photo yet"
        body="The 3D canvas is built from the patient's front photo. Capture the consultation photos to continue."
        action={
          <button className="btn btn-primary btn-sm" onClick={() => setCaptureOpen(true)}>
            <Camera size={14} />
            Capture photos
          </button>
        }
      />
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_300px] gap-4 fade-up">
      {/* Stage */}
      <GlassCard className="relative overflow-hidden" strong>
        <div
          className="relative"
          style={{
            height: "min(68vh, 640px)",
            background:
              "radial-gradient(700px 500px at 50% 20%, rgba(191,242,231,0.5) 0%, rgba(246,251,250,0.2) 60%, rgba(234,246,243,0.35) 100%)",
          }}
        >
          {face.status === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Spinner className="w-8 h-8" />
              <p className="caption">Fitting the parametric face mesh...</p>
            </div>
          )}
          {face.status === "no_face" && (
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <EmptyState
                title="No face detected in the front photo"
                body="Retake the front photo with even lighting, hair off the face, and a neutral expression."
                action={
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setCaptureOpen(true)}
                  >
                    Retake photos
                  </button>
                }
              />
            </div>
          )}
          {face.status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <EmptyState title="Could not load the face" body={face.error} />
            </div>
          )}
          {face.status === "ready" && face.image && face.landmarks && (
            <FaceScene
              image={face.image}
              landmarks={face.landmarks}
              morphs={morphs}
              tool={tool}
              draw={{ color: drawColor, size: drawSize, erase: false }}
              sculpt={{ strength: sculptStrength, direction: sculptDirection }}
              highlight={highlight}
              annotations={annotations}
              onStrokeCommit={(s) => setAnnotations((a) => [...a, s])}
              resetToken={resetToken}
            />
          )}

          {/* Tool rail */}
          <div className="absolute left-3 top-1/2 -translate-y-1/2 glass-strong flex flex-col gap-1 p-1.5 rounded-2xl">
            <ToolButton
              active={tool === "move"}
              onClick={() => setTool("move")}
              icon={<Hand size={17} />}
              label="Move: orbit, zoom, pan"
            />
            <ToolButton
              active={tool === "draw"}
              onClick={() => setTool("draw")}
              icon={<PenLine size={17} />}
              label="Draw: annotate on the face"
            />
            <ToolButton
              active={tool === "sculpt"}
              onClick={() => setTool("sculpt")}
              icon={<Wand2 size={17} />}
              label="Sculpt: push / pull locally"
            />
            <div className="h-px bg-white/60 my-0.5" />
            <ToolButton
              onClick={resetAll}
              icon={<RotateCcw size={16} />}
              label="Reset morphs, sculpt and drawings"
            />
          </div>

          {/* Contextual tool settings */}
          {tool === "draw" && (
            <div className="absolute left-16 top-1/2 -translate-y-1/2 glass-strong flex flex-col gap-2 p-2.5 rounded-2xl items-center">
              {DRAW_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setDrawColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                    drawColor === c ? "border-ink-900 scale-110" : "border-white"
                  }`}
                  style={{ background: c }}
                  aria-label={`Pen color ${c}`}
                />
              ))}
              <div className="h-px w-6 bg-white/60" />
              <button
                onClick={() => setAnnotations((a) => a.slice(0, -1))}
                className="text-ink-700 hover:text-ink-900 p-1"
                title="Undo last stroke"
              >
                <Undo2 size={15} />
              </button>
              <button
                onClick={() => setAnnotations([])}
                className="text-ink-700 hover:text-danger p-1"
                title="Clear all strokes"
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}
          {tool === "sculpt" && (
            <div className="absolute left-16 top-1/2 -translate-y-1/2 glass-strong flex flex-col gap-2 p-3 rounded-2xl w-36">
              <div className="caption">Sculpt brush</div>
              <div className="flex gap-1.5">
                <button
                  className={`chip flex-1 justify-center ${sculptDirection === -1 ? "chip-active" : ""}`}
                  onClick={() => setSculptDirection(-1)}
                >
                  Push in
                </button>
                <button
                  className={`chip flex-1 justify-center ${sculptDirection === 1 ? "chip-active" : ""}`}
                  onClick={() => setSculptDirection(1)}
                >
                  Pull out
                </button>
              </div>
              <input
                type="range"
                className="mint-slider"
                min={10}
                max={100}
                value={sculptStrength}
                style={{ "--fill": `${sculptStrength}%` } as React.CSSProperties}
                onChange={(e) => setSculptStrength(parseInt(e.target.value, 10))}
              />
              <div className="caption">Strength: {sculptStrength}</div>
            </div>
          )}

          {/* Feature chips (bottom) */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 flex-wrap justify-center px-4">
            {FEATURES.map((f) => (
              <Chip
                key={f.id}
                active={highlight === f.id}
                onClick={() => setHighlight(highlight === f.id ? null : f.id)}
              >
                {f.label}
              </Chip>
            ))}
          </div>

          {/* Mode hint */}
          <div className="absolute top-3 left-3">
            <span className="chip chip-static text-xs">
              {tool === "move"
                ? "Drag to orbit · scroll to zoom · right-drag to pan"
                : tool === "draw"
                  ? "Draw on the face. Annotations stick to the mesh"
                  : "Drag on the surface to sculpt with soft falloff"}
            </span>
          </div>
        </div>
      </GlassCard>

      {/* Right rail: morph handles + handoff */}
      <div className="space-y-4">
        <GlassCard className="p-5">
          <h3 className="h2 text-ink-900 mb-1">
            {activeTemplates.length > 1
              ? "Combined handles"
              : template
                ? `${template.name} handles`
                : "Morph handles"}
          </h3>
          <p className="caption mb-4">
            {template
              ? activeTemplates.length > 1
                ? `Live morph handles for ${activeTemplates
                    .map((t) => t.name)
                    .join(" + ")}. Clinically plausible ranges only.`
                : `Semantic controls for the ${template.region.replace(/_/g, "-")} region. Clinically plausible ranges only.`
              : "Set a primary interest in the Brief to load procedure-specific handles."}
          </p>
          {handleGroups.length > 0 ? (
            <div className="space-y-5">
              {handleGroups.map((t) => (
                <div key={t.id}>
                  {activeTemplates.length > 1 && (
                    <div className="field-label mb-2.5">{t.name}</div>
                  )}
                  {t.id === "botox" ? (
                    <BotoxZoneMap
                      compact
                      values={morphs}
                      onChange={setMorph}
                    />
                  ) : (
                    <div className="space-y-4">
                      {t.canvas_handles.map((h) => (
                        <MintSlider
                          key={h.key}
                          label={h.label}
                          min={h.min}
                          max={h.max}
                          value={morphs[h.key] ?? 0}
                          negLabel={h.negLabel}
                          posLabel={h.posLabel}
                          onChange={(v) => setMorph(h.key, v)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-700">
              The feature chips below still highlight and scale any region
              while you talk.
            </p>
          )}
        </GlassCard>

        {highlight && scaleKey && (
          <GlassCard className="p-5">
            <h3 className="font-medium text-ink-900 mb-3">
              Scale: {FEATURES.find((f) => f.id === highlight)?.label}
            </h3>
            <MintSlider
              label="Feature scale"
              min={-100}
              max={100}
              value={morphs[scaleKey] ?? 0}
              negLabel="Smaller"
              posLabel="Larger"
              onChange={(v) => setMorph(scaleKey, v)}
            />
          </GlassCard>
        )}

        <GlassCard strong className="p-5">
          <p className="text-sm text-ink-700 leading-relaxed">
            The canvas is the sketch. Generate the photoreal preview on{" "}
            {patient.name.split(" ")[0]}'s actual photo; your morphs pre-set
            the AI sliders.
          </p>
          <button className="btn btn-primary w-full mt-4" onClick={onGeneratePreview}>
            <Sparkles size={16} />
            Generate AI preview
          </button>
        </GlassCard>
      </div>

      <CameraCapture
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        title={`Capture photos: ${patient.name}`}
        requiredKinds={["photo_front"]}
        onComplete={(photos) => {
          for (const photo of photos) {
            addAsset({
              patient_id: patient.id,
              kind: photo.kind,
              storage_url: photo.storageUrl,
              consultation_id: consultation.id,
            });
          }
          setCaptureOpen(false);
        }}
      />
    </div>
  );
}

function ToolButton({
  active = false,
  onClick,
  icon,
  label,
}: {
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
        active
          ? "bg-mint-500 text-white shadow-md"
          : "text-ink-700 hover:bg-mint-100"
      }`}
    >
      {icon}
    </button>
  );
}
