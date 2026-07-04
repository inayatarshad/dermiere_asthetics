"use client";

/**
 * AI Before / After — THE HERO (05_ai-before-after.md).
 * Sliders tune the instruction; the on-device warp gives an instant live
 * preview (works offline, no key needed); "Generate with AI" runs the
 * identity-preserving model server-side for the photoreal healed result.
 * Consent-gated, disclaimer burned in, params + prompt stored for audit.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Save,
  RotateCcw,
  ChevronDown,
  ShieldAlert,
  Wand2,
  ArrowRight,
  Check,
  CloudOff,
} from "lucide-react";
import { useStore, useSessionUser, usePatientConsents, consentGranted } from "@/lib/store";
import { useAssetUrl, useFaceData } from "@/lib/hooks";
import { getTemplate, TEMPLATES } from "@/lib/templates";
import { assemblePrompt, assembleSliderPhrases, hasActiveParams, paramsHash } from "@/lib/prompt";
import { canvasMorphsToAiParams, toPx } from "@/lib/face/geometry";
import { warpPhoto, burnDisclaimer } from "@/lib/face/warp2d";
import { generateAfterImage } from "@/lib/generateClient";
import { canvasToBlob } from "@/lib/img";
import { saveImage } from "@/lib/db";
import { AI_DISCLAIMER, type Consultation, type Patient } from "@/lib/types";
import { GlassCard, Chip, EmptyState, Spinner } from "@/components/ui";
import { MintSlider } from "@/components/MintSlider";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";

interface AfterState {
  src: string;
  canvas: HTMLCanvasElement | null; // for saving
  source: string; // "simulation" or the model id
}

export function VisualizeStep({
  consultation,
  patient,
  onPlan,
}: {
  consultation: Consultation;
  patient: Patient;
  onPlan: () => void;
}) {
  const user = useSessionUser();
  const assets = useStore((s) => s.assets);
  const visualizations = useStore((s) => s.visualizations);
  const addAsset = useStore((s) => s.addAsset);
  const addVisualization = useStore((s) => s.addVisualization);
  const aiProvider = useStore((s) => s.aiProvider);
  const consents = usePatientConsents(patient.id);
  const photographyOk = !!consentGranted(consents, "photography");
  const aiDisabled = aiProvider === "none";

  const template = getTemplate(consultation.brief.primary_interest);

  const frontPhoto = useMemo(() => {
    const all = assets
      .filter((a) => a.patient_id === patient.id && a.kind === "photo_front")
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return all.find((a) => a.consultation_id === consultation.id) ?? all[0];
  }, [assets, patient.id, consultation.id]);

  const beforeUrl = useAssetUrl(frontPhoto);
  const face = useFaceData(frontPhoto);

  const savedViz = useMemo(
    () =>
      visualizations
        .filter((v) => v.consultation_id === consultation.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0],
    [visualizations, consultation.id]
  );

  const [params, setParams] = useState<Record<string, number>>(() => {
    if (savedViz) return savedViz.params;
    // Canvas -> AI handoff: the doctor's mesh morphs pre-set the sliders
    return canvasMorphsToAiParams(
      consultation.canvas_state.morphs ?? {},
      template?.slider_schema.map((s) => s.key) ?? []
    );
  });
  const [after, setAfter] = useState<AfterState | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<{ code: string; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const warpToken = useRef(0);

  const active = template ? hasActiveParams(template.slider_schema, params) : false;
  const prompt = template ? assemblePrompt(template, params) : "";
  const phrases = template
    ? assembleSliderPhrases(template.slider_schema, params)
    : "";

  // ---- instant on-device preview (the live half of the loop) ----------
  const runWarp = useCallback(() => {
    if (!template || !face.image || !face.landmarks) return;
    const token = ++warpToken.current;
    const px = toPx(face.landmarks, face.image.naturalWidth, face.image.naturalHeight);
    const { canvas, moved } = warpPhoto(face.image, px, params);
    if (warpToken.current !== token) return;
    if (!moved) {
      setAfter(null);
      return;
    }
    setAfter({
      src: canvas.toDataURL("image/jpeg", 0.92),
      canvas,
      source: "simulation",
    });
    setSaved(false);
  }, [face.image, face.landmarks, params, template]);

  // warp on param changes (debounced lightly — warp is fast but not free)
  useEffect(() => {
    if (after?.source !== "simulation" && after !== null) return; // don't clobber an AI result on mount
    const t = setTimeout(runWarp, 90);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, face.status]);

  const setParam = (key: string, value: number) => {
    setParams((p) => ({ ...p, [key]: value }));
    setGenError(null);
    if (after?.source !== "simulation") setAfter(null); // params changed → AI result stale
  };

  const resetParams = () => {
    setParams({});
    setAfter(null);
    setGenError(null);
  };

  // ---- the photoreal pass ------------------------------------------------
  const generate = async () => {
    if (!template || !beforeUrl || !frontPhoto || generating || aiDisabled)
      return;
    setGenerating(true);
    setGenError(null);
    // provider is part of the cache key: different models, different results
    const key = `${aiProvider}|${frontPhoto.id}|${paramsHash(template.id, params)}`;
    const outcome = await generateAfterImage(
      beforeUrl,
      prompt,
      key,
      template.id,
      aiProvider
    );
    setGenerating(false);
    if (outcome.ok) {
      setAfter({ src: outcome.imageDataUrl, canvas: null, source: outcome.model });
      setSaved(false);
    } else {
      setGenError({ code: outcome.code, message: outcome.message });
    }
  };

  // ---- save to consultation ----------------------------------------------
  const save = async () => {
    if (!after || !template || !frontPhoto || !user) return;
    // Rasterize with the disclaimer burned in
    let sourceEl: HTMLCanvasElement | HTMLImageElement;
    if (after.canvas) {
      sourceEl = after.canvas;
    } else {
      const img = new Image();
      img.src = after.src;
      await new Promise((res) => (img.onload = res));
      sourceEl = img;
    }
    const stamped = burnDisclaimer(sourceEl, AI_DISCLAIMER);
    const blob = await canvasToBlob(stamped, 0.92);
    const blobKey = crypto.randomUUID();
    await saveImage(blobKey, blob);

    const asset = addAsset({
      patient_id: patient.id,
      consultation_id: consultation.id,
      kind: "ai_after",
      storage_url: `idb:${blobKey}`,
      meta: {
        procedure: template.id,
        params,
        model: after.source,
        label: `${template.name} visualization`,
      },
    });
    addVisualization({
      consultation_id: consultation.id,
      procedure: template.id,
      params,
      prompt_used: prompt,
      before_asset_id: frontPhoto.id,
      after_asset_id: asset.id,
      model: after.source,
    });
    setSaved(true);
  };

  // ---------------- guard states ----------------
  if (!template) {
    return (
      <EmptyState
        icon={<Sparkles size={30} />}
        title="Pick a primary interest first"
        body="The visualization preset is driven by the consultation brief. Set a primary procedure in the Brief step."
      />
    );
  }

  if (!template.available) {
    return (
      <div className="max-w-xl mx-auto fade-up">
        <GlassCard className="p-8 text-center">
          <span className="mx-auto w-12 h-12 rounded-2xl bg-mint-100 text-mint-500 flex items-center justify-center">
            <Wand2 size={22} />
          </span>
          <h2 className="h1 text-ink-900 mt-4">{template.name} preset coming soon</h2>
          <p className="text-ink-700 mt-2 leading-relaxed">
            Rhinoplasty, Lip Filler, Chin Filler and Botox are fully wired
            today; each additional procedure is a slider schema and prompt
            template away. Switch the primary interest to a live procedure to
            run the full visualization now.
          </p>
          <div className="flex justify-center gap-2 mt-5 flex-wrap">
            {TEMPLATES.filter((t) => t.available).map((t) => (
              <span key={t.id} className="chip chip-static">
                {t.name}: available
              </span>
            ))}
          </div>
        </GlassCard>
      </div>
    );
  }

  if (!photographyOk) {
    return (
      <EmptyState
        icon={<ShieldAlert size={30} />}
        title="Photography consent required"
        body="AI visualization processes the patient's facial photo. Capture photography consent on the patient profile before generating."
      />
    );
  }

  if (!frontPhoto) {
    return (
      <EmptyState
        icon={<Sparkles size={30} />}
        title="No front photo available"
        body="Capture the patient's front photo in the 3D Canvas step. It is the input for the AI visualization."
      />
    );
  }

  return (
    <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4 fade-up">
      {/* Reveal stage */}
      <div className="space-y-3">
        <GlassCard strong className="p-5">
          {beforeUrl ? (
            <BeforeAfterSlider
              beforeSrc={beforeUrl}
              afterSrc={after?.src ?? null}
              afterLabel={
                after?.source === "simulation" ? "After · live preview" : "After · AI"
              }
            />
          ) : (
            <div className="shimmer rounded-2xl" style={{ aspectRatio: "4/4.4" }} />
          )}

          <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
            <p className="caption flex items-center gap-1.5">
              <ShieldAlert size={13} className="shrink-0" />
              {AI_DISCLAIMER}
            </p>
            {after && (
              <span className="chip chip-static text-xs">
                {after.source === "simulation"
                  ? "On-device simulation"
                  : `Model: ${after.source}`}
              </span>
            )}
          </div>
        </GlassCard>

        {/* status strip */}
        {generating && (
          <GlassCard className="px-5 py-3.5 flex items-center gap-3">
            <Spinner />
            <span className="text-sm text-ink-700">
              Generating the photoreal healed result on {patient.name.split(" ")[0]}'s
              photo...
            </span>
          </GlassCard>
        )}
        {active && !after && !generating && !genError && (
          <GlassCard className="px-5 py-3.5 flex items-start gap-3">
            <Sparkles size={17} className="text-mint-500 mt-0.5 shrink-0" />
            <span className="text-sm text-ink-700">
              The selected changes are skin-level (lines and texture), so the
              live geometric preview stays unchanged. Generate with AI to
              render them on the photo.
            </span>
          </GlassCard>
        )}
        {genError && (
          <GlassCard className="px-5 py-3.5 flex items-start gap-3">
            <CloudOff size={17} className="text-warning mt-0.5 shrink-0" />
            <div className="text-sm text-ink-700">
              {genError.code === "no_api_key" ? (
                <>
                  <b>Simulation mode.</b> No AI key is configured on the
                  server, so you are seeing the on-device preview. Add{" "}
                  <code className="text-xs bg-mint-100 px-1.5 py-0.5 rounded">
                    GEMINI_API_KEY
                  </code>{" "}
                  to enable photoreal generation.
                </>
              ) : (
                <>
                  <b>AI generation failed.</b> {genError.message} The live
                  preview remains available.
                </>
              )}
            </div>
          </GlassCard>
        )}
      </div>

      {/* Controls */}
      <div className="space-y-4">
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="h2 text-ink-900">{template.name}</h3>
            <button className="btn btn-ghost btn-sm" onClick={resetParams} title="Reset sliders">
              <RotateCcw size={14} />
            </button>
          </div>
          <p className="caption mb-4">
            Sliders tune the instruction, not the pixels. The preview updates
            live; generate for the photoreal result.
          </p>
          <div className="space-y-4">
            {template.slider_schema.map((def) => (
              <MintSlider
                key={def.key}
                label={def.label}
                hint={def.hint}
                min={def.min}
                max={def.max}
                value={params[def.key] ?? 0}
                negLabel={def.negLabel}
                posLabel={def.posLabel}
                onChange={(v) => setParam(def.key, v)}
              />
            ))}
          </div>
        </GlassCard>

        {/* Assembled instruction peek */}
        <GlassCard className="p-5">
          <button
            className="w-full flex items-center justify-between text-left"
            onClick={() => setShowPrompt(!showPrompt)}
          >
            <span className="text-sm font-medium text-ink-900">
              AI instruction
            </span>
            <ChevronDown
              size={16}
              className={`text-ink-400 transition-transform ${showPrompt ? "rotate-180" : ""}`}
            />
          </button>
          <p className="caption mt-1">
            {phrases || "Neutral. Move a slider to compose the instruction."}
          </p>
          {showPrompt && (
            <pre className="mt-3 text-[11px] leading-relaxed text-ink-700 whitespace-pre-wrap bg-white/50 rounded-xl p-3 border border-white/70">
              {prompt}
            </pre>
          )}
        </GlassCard>

        <GlassCard strong className="p-5 space-y-2.5">
          {aiDisabled ? (
            <div className="rounded-xl bg-mint-100 px-4 py-3 text-sm text-ink-700 leading-relaxed">
              <b>Photoreal AI is turned off</b> in Settings. The on-device
              live preview stays fully available. An admin can re-enable a
              provider under Settings, AI generation.
            </div>
          ) : (
            <button
              className="btn btn-primary w-full"
              onClick={generate}
              disabled={!active || generating || face.status !== "ready"}
            >
              {generating ? <Spinner className="w-4 h-4" /> : <Sparkles size={16} />}
              Generate with AI
              {aiProvider !== "auto" && (
                <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                  {aiProvider}
                </span>
              )}
            </button>
          )}
          <button
            className="btn btn-secondary w-full"
            onClick={save}
            disabled={!after || saved}
          >
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saved ? "Saved to consultation" : "Save to consultation"}
          </button>
          {saved && (
            <button className="btn btn-ghost w-full" onClick={onPlan}>
              Continue to treatment plan
              <ArrowRight size={15} />
            </button>
          )}
          {!active && !aiDisabled && (
            <p className="caption text-center">
              Move a slider past the neutral zone to enable generation.
            </p>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
