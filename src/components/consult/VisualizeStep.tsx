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
import { activeTemplatesFor, getTemplate, TEMPLATES } from "@/lib/templates";
import { assembleMultiPrompt, assembleSliderPhrases, hasActiveParams, paramsHash } from "@/lib/prompt";
import { canvasMorphsToAiParams, toPx } from "@/lib/face/geometry";
import { warpPhoto, burnDisclaimer } from "@/lib/face/warp2d";
import { generateAfterImage } from "@/lib/generateClient";
import { canvasToBlob } from "@/lib/img";
import { saveImage } from "@/lib/db";
import { AI_DISCLAIMER, type Consultation, type Patient } from "@/lib/types";
import { BOTOX_ZONES, buildToxinPlan } from "@/lib/botoxUnits";
import { GlassCard, Chip, EmptyState, Spinner } from "@/components/ui";
import { MintSlider } from "@/components/MintSlider";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import { BotoxZoneMap } from "@/components/BotoxZoneMap";

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

  // Multi-procedure (T2): every available selection participates, primary
  // first. Slider keys are globally unique, so params stay one flat record.
  const activeTemplates = useMemo(
    () =>
      activeTemplatesFor(
        consultation.brief.interests,
        consultation.brief.primary_interest
      ),
    [consultation.brief.interests, consultation.brief.primary_interest]
  );
  const primary = activeTemplates[0];
  const joinedId = activeTemplates.map((t) => t.id).join("+");
  const unionKeys = useMemo(
    () => activeTemplates.flatMap((t) => t.slider_schema.map((s) => s.key)),
    [activeTemplates]
  );
  const unavailableSelected = consultation.brief.interests
    .map((i) => getTemplate(i))
    .filter((t) => t && !t.available);

  const frontPhoto = useMemo(() => {
    const all = assets
      .filter((a) => a.patient_id === patient.id && a.kind === "photo_front")
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return all.find((a) => a.consultation_id === consultation.id) ?? all[0];
  }, [assets, patient.id, consultation.id]);

  const beforeUrl = useAssetUrl(frontPhoto);
  const face = useFaceData(frontPhoto);

  // Only hydrate sliders from a saved visualization whose procedure set
  // matches the current one (stale-params bug fix).
  const savedViz = useMemo(
    () =>
      visualizations
        .filter(
          (v) => v.consultation_id === consultation.id && v.procedure === joinedId
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0],
    [visualizations, consultation.id, joinedId]
  );

  const [params, setParams] = useState<Record<string, number>>(() => {
    if (savedViz) return savedViz.params;
    // Canvas -> AI handoff: the doctor's mesh morphs pre-set the sliders
    return canvasMorphsToAiParams(
      consultation.canvas_state.morphs ?? {},
      unionKeys
    );
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    [primary?.id ?? ""]: true,
  }));
  // Botox units planning (T3)
  const toxinPrice = useStore((s) => s.toxinPricePerUnit);
  const setToxinPlan = useStore((s) => s.setToxinPlan);
  const [unitOverrides, setUnitOverrides] = useState<Record<string, number>>(
    () => {
      const fromSaved: Record<string, number> = {};
      const tp = consultation.toxin_plan;
      if (tp) {
        for (const [k, z] of Object.entries(tp.zones)) fromSaved[k] = z.units;
      }
      return fromSaved;
    }
  );
  const botoxActive = activeTemplates.some((t) => t.id === "botox");

  // persist the toxin plan onto the consultation (debounced)
  const toxinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!botoxActive) return;
    if (toxinTimer.current) clearTimeout(toxinTimer.current);
    toxinTimer.current = setTimeout(() => {
      setToxinPlan(
        consultation.id,
        buildToxinPlan(params, unitOverrides, toxinPrice)
      );
    }, 600);
    return () => {
      if (toxinTimer.current) clearTimeout(toxinTimer.current);
    };
  }, [params, unitOverrides, toxinPrice, botoxActive, consultation.id, setToxinPlan]);

  // Honest live feedback (T3): texture-only zones get a soft mint wash on
  // the BEFORE image, mapped through the object-cover crop so the wash
  // lands on the right facial region.
  const zoneOverlay = useMemo(() => {
    if (!botoxActive || !face.landmarks || !face.image) return null;
    const activeTexture = BOTOX_ZONES.filter(
      (z) => z.kind === "texture" && (params[z.key] ?? 0) >= 15
    );
    if (activeTexture.length === 0) return null;

    const lm = face.landmarks;
    const P = (i: number) => ({ x: lm[i][0], y: lm[i][1] });
    const nasion = P(168);
    const chin = P(152);
    const eyeR = P(33);
    const eyeL = P(263);
    const faceH = Math.max(0.05, chin.y - nasion.y);
    const eyeSpan = Math.max(0.05, Math.abs(eyeL.x - eyeR.x));

    // object-cover mapping: image-normalized -> container-normalized
    const containerAspect = 4 / 4.4;
    const imageAspect = face.image.naturalWidth / face.image.naturalHeight;
    let kx = 1,
      ky = 1;
    if (imageAspect < containerAspect) ky = containerAspect / imageAspect;
    else kx = imageAspect / containerAspect;
    const mapX = (x: number) => x * kx - (kx - 1) / 2;
    const mapY = (y: number) => y * ky - (ky - 1) / 2;

    const ZONES: Record<string, { cx: number; cy: number; rx: number; ry: number }[]> = {
      forehead_lines: [
        {
          cx: nasion.x,
          cy: nasion.y - 0.42 * faceH,
          rx: eyeSpan * 0.72,
          ry: 0.17 * faceH,
        },
      ],
      glabella_lines: [
        {
          cx: nasion.x,
          cy: nasion.y - 0.1 * faceH,
          rx: eyeSpan * 0.18,
          ry: 0.1 * faceH,
        },
      ],
      crows_feet: [
        { cx: eyeR.x - eyeSpan * 0.16, cy: eyeR.y, rx: eyeSpan * 0.13, ry: 0.09 * faceH },
        { cx: eyeL.x + eyeSpan * 0.16, cy: eyeL.y, rx: eyeSpan * 0.13, ry: 0.09 * faceH },
      ],
    };

    return (
      <>
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          {activeTexture.flatMap((z) =>
            (ZONES[z.key] ?? []).map((e, i) => (
              <ellipse
                key={`${z.key}_${i}`}
                cx={mapX(e.cx)}
                cy={mapY(e.cy)}
                rx={e.rx * kx}
                ry={e.ry * ky}
                fill="rgba(52, 211, 176, 0.3)"
                stroke="rgba(52, 211, 176, 0.7)"
                strokeWidth="0.004"
              />
            ))
          )}
        </svg>
        <span className="absolute bottom-3 left-3 rounded-full bg-mint-500/90 text-white text-[11px] px-3 py-1 backdrop-blur-md pointer-events-none">
          Highlighted zones render in the AI pass
        </span>
      </>
    );
  }, [botoxActive, face.landmarks, face.image, params]);
  const [after, setAfter] = useState<AfterState | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<{ code: string; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const warpToken = useRef(0);

  // Mobile (T4): a sticky mini before/after appears once the main stage
  // scrolls out of view, so the preview stays visible while dragging
  // sliders. Passive scroll check (not IntersectionObserver) so behavior
  // is deterministic across throttled/embedded browsers.
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageVisible, setStageVisible] = useState(true);
  useEffect(() => {
    const check = () => {
      const el = stageRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setStageVisible(r.bottom > 130);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  const active = activeTemplates.some((t) =>
    hasActiveParams(t.slider_schema, params)
  );
  const prompt = assembleMultiPrompt(activeTemplates, params);
  const activeSections = activeTemplates
    .map((t) => ({ t, phrases: assembleSliderPhrases(t.slider_schema, params) }))
    .filter((x) => x.phrases.length > 0);
  const phrases =
    activeSections.length === 1
      ? activeSections[0].phrases
      : activeSections.length > 1
        ? `${activeSections.length} procedures active: ${activeSections
            .map((x) => x.t.name)
            .join(", ")}.`
        : "";

  // ---- instant on-device preview (the live half of the loop) ----------
  const runWarp = useCallback(() => {
    if (activeTemplates.length === 0 || !face.image || !face.landmarks) return;
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
  }, [face.image, face.landmarks, params, activeTemplates]);

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

  const resetSection = (t: (typeof activeTemplates)[number]) => {
    setParams((p) => {
      const next = { ...p };
      for (const s of t.slider_schema) delete next[s.key];
      return next;
    });
    setGenError(null);
    if (after?.source !== "simulation") setAfter(null);
  };

  // ---- the photoreal pass ------------------------------------------------
  const generate = async () => {
    if (!primary || !beforeUrl || !frontPhoto || generating || aiDisabled)
      return;
    setGenerating(true);
    setGenError(null);
    // provider is part of the cache key: different models, different results
    const key = `${aiProvider}|${frontPhoto.id}|${paramsHash(joinedId, params)}`;
    const outcome = await generateAfterImage(
      beforeUrl,
      prompt,
      key,
      joinedId,
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
    if (!after || !primary || !frontPhoto || !user) return;
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
        procedure: joinedId,
        params,
        model: after.source,
        label: `${activeTemplates.map((t) => t.name).join(" + ")} visualization`,
      },
    });
    addVisualization({
      consultation_id: consultation.id,
      procedure: joinedId,
      params,
      prompt_used: prompt,
      before_asset_id: frontPhoto.id,
      after_asset_id: asset.id,
      model: after.source,
    });
    setSaved(true);
  };

  // ---------------- guard states ----------------
  if (activeTemplates.length === 0) {
    if (!consultation.brief.primary_interest) {
      return (
        <EmptyState
          icon={<Sparkles size={30} />}
          title="Pick a primary interest first"
          body="The visualization preset is driven by the consultation brief. Set a primary procedure in the Brief step."
        />
      );
    }
    const wanted = getTemplate(consultation.brief.primary_interest);
    return (
      <div className="max-w-xl mx-auto fade-up">
        <GlassCard className="p-8 text-center">
          <span className="mx-auto w-12 h-12 rounded-2xl bg-mint-100 text-mint-500 flex items-center justify-center">
            <Wand2 size={22} />
          </span>
          <h2 className="h1 text-ink-900 mt-4">
            {wanted?.name ?? "This"} preset coming soon
          </h2>
          <p className="text-ink-700 mt-2 leading-relaxed">
            Rhinoplasty, Lip Filler, Chin Filler and Botox are fully wired
            today; each additional procedure is a slider schema and prompt
            template away. Add a live procedure in the Brief to run the full
            visualization now.
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
      {/* Mobile sticky mini preview (T4) */}
      {beforeUrl && !stageVisible && (
        <div className="lg:hidden sticky top-[70px] z-30 order-first">
          <div className="glass-strong p-2">
            <BeforeAfterSlider
              beforeSrc={beforeUrl}
              afterSrc={after?.src ?? null}
              beforeLabel="Before"
              afterLabel="After"
              aspect="16 / 8"
            />
          </div>
        </div>
      )}

      {/* Reveal stage */}
      <div className="space-y-3">
        <GlassCard strong className="p-5" ref={stageRef}>
          {beforeUrl ? (
            <BeforeAfterSlider
              beforeSrc={beforeUrl}
              afterSrc={after?.src ?? null}
              afterLabel={
                after?.source === "simulation" ? "After · live preview" : "After · AI"
              }
              overlay={zoneOverlay}
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

      {/* Controls: one collapsible section per active procedure (T2) */}
      <div className="space-y-4">
        {activeTemplates.length > 1 && (
          <div className="flex items-center justify-between px-1">
            <div>
              <h3 className="h2 text-ink-900">Combined treatment</h3>
              <p className="caption">
                {activeTemplates.map((t) => t.name).join(" + ")}
              </p>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={resetParams}
              title="Reset all procedures"
            >
              <RotateCcw size={14} />
              Reset all
            </button>
          </div>
        )}

        {activeTemplates.map((t) => {
          const isOpen = activeTemplates.length === 1 || !!expanded[t.id];
          const activeCount = t.slider_schema.filter(
            (s) => Math.abs(params[s.key] ?? 0) >= 15
          ).length;
          return (
            <GlassCard key={t.id} className="p-5">
              <div className="flex items-center justify-between gap-2">
                {activeTemplates.length > 1 ? (
                  <button
                    className="flex items-center gap-2 text-left flex-1 min-w-0"
                    onClick={() =>
                      setExpanded((e) => ({ ...e, [t.id]: !e[t.id] }))
                    }
                  >
                    <ChevronDown
                      size={16}
                      className={`text-ink-400 transition-transform shrink-0 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                    <h3 className="h2 text-ink-900 truncate">{t.name}</h3>
                    {activeCount > 0 && (
                      <span className="chip chip-static text-[11px] shrink-0">
                        {activeCount} active
                      </span>
                    )}
                  </button>
                ) : (
                  <h3 className="h2 text-ink-900">{t.name}</h3>
                )}
                <button
                  className="btn btn-ghost btn-sm shrink-0"
                  onClick={() =>
                    activeTemplates.length > 1 ? resetSection(t) : resetParams()
                  }
                  title={`Reset ${t.name} sliders`}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              {isOpen && (
                <>
                  <p className="caption mt-1 mb-4">
                    {t.id === "botox"
                      ? "Tap the zones to treat. Geometric zones move the live preview; skin-level zones render in the AI pass."
                      : "Sliders tune the instruction, not the pixels. The preview updates live; generate for the photoreal result."}
                  </p>
                  {t.id === "botox" ? (
                    <BotoxZoneMap
                      values={params}
                      onChange={setParam}
                      unitOverrides={unitOverrides}
                      onUnitsChange={(key, units) =>
                        setUnitOverrides((o) => {
                          const next = { ...o };
                          if (units === null) delete next[key];
                          else next[key] = units;
                          return next;
                        })
                      }
                      pricePerUnit={toxinPrice}
                    />
                  ) : (
                    <div className="space-y-4">
                      {t.slider_schema.map((def) => (
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
                  )}
                </>
              )}
            </GlassCard>
          );
        })}

        {unavailableSelected.length > 0 && (
          <div className="flex gap-1.5 flex-wrap px-1">
            {unavailableSelected.map(
              (t) =>
                t && (
                  <Chip key={t.id} className="chip-static opacity-70">
                    {t.name}: coming soon
                  </Chip>
                )
            )}
          </div>
        )}

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
