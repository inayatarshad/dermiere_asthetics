"use client";

/**
 * CAPTURE Visualization Studio — before/after previews for the two
 * signature treatment families:
 *   · MitoRedLight glow (face): tone, texture, warmth, radiance
 *   · Exomere body contour: region slimming + firmness
 *
 * Live on-device rendering (no key needed); optional AI enhancement via
 * the configured provider. Every output carries the illustrative-preview
 * disclaimer, and saves land on the client's photo timeline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Sun,
  Scan,
  Upload,
  Sparkles,
  Download,
  Save,
  Info,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { resolveImageUrl, saveImage } from "@/lib/db";
import { AI_DISCLAIMER } from "@/lib/types";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";
import { MintSlider } from "@/components/MintSlider";
import { Spinner } from "@/components/ui";
import { burnDisclaimer } from "@/lib/face/warp2d";
import {
  loadImage,
  renderGlow,
  renderContour,
  composeSideBySide,
  CONTOUR_PRESETS,
  type GlowParams,
  type ContourRegion,
} from "@/lib/studio/render";
import { generateAfterImage, modelsKey } from "@/lib/generateClient";

type Mode = "glow" | "body";

const GLOW_DEFAULTS: GlowParams = { glow: 55, tone: 45, texture: 40, warmth: 35 };

const GLOW_PROMPT =
  "Show this exact person after a completed course of professional red light and near-infrared light therapy facials: radiant, luminous, even-toned skin with refined texture, healthy hydration and a subtle lit-from-within glow. Keep the identity, facial features, expression, pose, hair, clothing, lighting direction and background EXACTLY the same. Do not add makeup, do not slim or reshape anything, do not retouch beyond natural skin quality. Photorealistic.";

const BODY_PROMPT = (region: string) =>
  `Show this exact person after a completed course of professional non-invasive body contouring treatments focused on the ${region}: the ${region} area appears naturally firmer, smoother and modestly slimmer with improved skin tone. Keep identity, pose, clothing, lighting and background EXACTLY the same. The change must be subtle, anatomically plausible and realistic — no dramatic reshaping. Photorealistic.`;

export default function VisualizeStudioPage() {
  const params = useParams<{ patientId: string }>();
  const router = useRouter();
  const mounted = useMounted();

  const patient = useStore((s) =>
    s.patients.find((p) => p.id === params.patientId)
  );
  const assets = useStore((s) => s.assets);
  const addAsset = useStore((s) => s.addAsset);
  const aiProvider = useStore((s) => s.aiProvider);
  const aiModels = useStore((s) => s.aiModels);
  const bumpAiUsage = useStore((s) => s.bumpAiUsage);

  const [mode, setMode] = useState<Mode>("glow");
  const [beforeSrc, setBeforeSrc] = useState<string | null>(null);
  const [beforeIsUpload, setBeforeIsUpload] = useState(false);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [afterSrc, setAfterSrc] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busyMsg, setBusyMsg] = useState<string | null>(null);

  // params
  const [glow, setGlow] = useState<GlowParams>(GLOW_DEFAULTS);
  const [preset, setPreset] = useState(CONTOUR_PRESETS[0]);
  const [region, setRegion] = useState<ContourRegion>(CONTOUR_PRESETS[0].region);
  const [strength, setStrength] = useState(45);
  const [firmness, setFirmness] = useState(35);

  const fileRef = useRef<HTMLInputElement>(null);
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // patient photos usable as the "before"
  const photoAssets = useMemo(
    () =>
      assets.filter(
        (a) =>
          a.patient_id === params.patientId &&
          (a.kind === "photo_front" || a.kind === "photo_body")
      ),
    [assets, params.patientId]
  );

  // initial before photo: front photo when in glow mode
  useEffect(() => {
    if (beforeSrc || photoAssets.length === 0) return;
    void (async () => {
      const first =
        photoAssets.find((a) =>
          mode === "body" ? a.kind === "photo_body" : a.kind === "photo_front"
        ) ?? photoAssets[0];
      const url = await resolveImageUrl(first.storage_url);
      if (url) {
        setBeforeSrc(url);
        setBeforeIsUpload(false);
      }
    })();
  }, [photoAssets, beforeSrc, mode]);

  // load HTMLImageElement whenever the before changes
  useEffect(() => {
    if (!beforeSrc) {
      setImg(null);
      return;
    }
    let cancelled = false;
    loadImage(beforeSrc)
      .then((i) => {
        if (!cancelled) setImg(i);
      })
      .catch(() => setImg(null));
    return () => {
      cancelled = true;
    };
  }, [beforeSrc]);

  // live deterministic render (debounced)
  const renderNow = useCallback(() => {
    if (!img) return;
    const canvas =
      mode === "glow"
        ? renderGlow(img, glow)
        : renderContour(img, { strength, firmness, region });
    const burned = burnDisclaimer(canvas, AI_DISCLAIMER);
    setAfterSrc(burned.toDataURL("image/jpeg", 0.92));
    setSaved(false);
  }, [img, mode, glow, strength, firmness, region]);

  useEffect(() => {
    if (!img) return;
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = setTimeout(renderNow, 140);
    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
  }, [renderNow, img]);

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setBeforeSrc(reader.result as string);
      setBeforeIsUpload(true);
      setAfterSrc(null);
      setAiNote(null);
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  const chooseAsset = async (id: string) => {
    const a = photoAssets.find((x) => x.id === id);
    if (!a) return;
    const url = await resolveImageUrl(a.storage_url);
    if (url) {
      setBeforeSrc(url);
      setBeforeIsUpload(false);
      setAfterSrc(null);
      setAiNote(null);
    }
  };

  const runAi = async () => {
    if (!beforeSrc || aiBusy) return;
    setAiBusy(true);
    setAiNote(null);
    const prompt = mode === "glow" ? GLOW_PROMPT : BODY_PROMPT(preset.label.toLowerCase());
    const key = `studio|${mode}|${preset.id}|${aiProvider}|${modelsKey(aiModels)}|${beforeSrc.slice(-48)}|${prompt.length}`;
    const out = await generateAfterImage(
      beforeSrc,
      prompt,
      key,
      mode === "glow" ? "redlight_glow" : "body_contour",
      aiProvider,
      aiModels as Record<string, string>
    );
    if (out.ok) {
      try {
        const gen = await loadImage(out.imageDataUrl);
        const burned = burnDisclaimer(gen, AI_DISCLAIMER);
        setAfterSrc(burned.toDataURL("image/jpeg", 0.92));
        setAiNote(`AI preview via ${out.provider}.`);
        bumpAiUsage("generations");
        setSaved(false);
      } catch {
        setAiNote("The AI image could not be loaded; showing the studio preview.");
      }
    } else {
      setAiNote(
        out.code === "unauthenticated" || out.code === "not_configured"
          ? "AI enhancement is not configured — the live studio preview above is shown instead."
          : `AI enhancement unavailable (${out.message}) — the live studio preview is shown instead.`
      );
    }
    setAiBusy(false);
  };

  const saveToRecord = async () => {
    if (!afterSrc || !patient) return;
    setBusyMsg("Saving to record…");
    try {
      // persist the upload as the "before" if it isn't on the record yet
      if (beforeSrc && beforeIsUpload) {
        const beforeBlob = await (await fetch(beforeSrc)).blob();
        const beforeKey = `studio_before_${patient.id}_${Date.now()}`;
        const beforeUrl = await saveImage(beforeKey, beforeBlob);
        addAsset({
          patient_id: patient.id,
          kind: mode === "body" ? "photo_body" : "photo_front",
          storage_url: beforeUrl,
          meta: { label: "Studio before" },
        });
        setBeforeIsUpload(false);
      }
      const blob = await (await fetch(afterSrc)).blob();
      const key = `studio_after_${patient.id}_${Date.now()}`;
      const url = await saveImage(key, blob);
      addAsset({
        patient_id: patient.id,
        kind: "ai_after",
        storage_url: url,
        meta: {
          procedure: mode === "glow" ? "mito-regenerative-glow" : `exomere-body-contour (${preset.label})`,
          params:
            mode === "glow"
              ? { ...glow }
              : { strength, firmness },
          label: mode === "glow" ? "Red-light glow preview" : `Body contour preview · ${preset.label}`,
        },
      });
      setSaved(true);
    } finally {
      setBusyMsg(null);
    }
  };

  const download = async () => {
    if (!beforeSrc || !afterSrc) return;
    const [b, a] = await Promise.all([loadImage(beforeSrc), loadImage(afterSrc)]);
    const canvas = composeSideBySide(b, a, AI_DISCLAIMER);
    const link = document.createElement("a");
    link.download = `capture-preview-${patient?.name.replace(/\s+/g, "-").toLowerCase() ?? "client"}.jpg`;
    link.href = canvas.toDataURL("image/jpeg", 0.9);
    link.click();
  };

  if (!mounted) return null;
  if (!patient) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-ink-700">Client not found.</p>
        <button onClick={() => router.push("/patients")} className="btn btn-secondary mt-4">
          Back to clients
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-5 fade-up">
        <Link href={`/patients/${patient.id}`} className="btn btn-ghost btn-sm">
          <ArrowLeft size={15} /> {patient.name}
        </Link>
        <h1 className="h1">Visualization Studio</h1>
        <span className="chip chip-static ml-auto hidden sm:inline-flex">
          Illustrative previews · not guarantees
        </span>
      </div>

      <div className="grid lg:grid-cols-[1.25fr_1fr] gap-5 items-start">
        {/* Stage */}
        <div className="glass p-4 sm:p-5 fade-up-1 lg:sticky lg:top-[84px]">
          {beforeSrc ? (
            <>
              <BeforeAfterSlider
                beforeSrc={beforeSrc}
                afterSrc={afterSrc}
                afterLabel="After · preview"
                aspect={mode === "body" ? "3 / 4" : "4 / 4.4"}
              />
              <p className="mt-3 text-[11.5px] text-ink-400 text-center flex items-center justify-center gap-1.5">
                <Info size={12} className="shrink-0" />
                {AI_DISCLAIMER} Reviewed with your CAPTURE specialist.
              </p>
            </>
          ) : (
            <div className="aspect-[4/4.4] flex flex-col items-center justify-center text-center gap-3 border border-dashed border-[rgba(28,26,22,0.15)] rounded-xl">
              <Scan size={28} className="text-ink-400" />
              <p className="text-sm text-ink-700 max-w-[26ch]">
                Add a photo to begin — a face photo for glow, a torso photo for
                body contour.
              </p>
              <button onClick={() => fileRef.current?.click()} className="btn btn-primary btn-sm">
                <Upload size={14} /> Add photo
              </button>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-4">
          {/* Mode switch */}
          <div className="glass p-4 fade-up-1">
            <div className="field-label mb-2">Treatment preset</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setMode("glow");
                  setAiNote(null);
                }}
                className={`rounded-xl border px-4 py-3 text-left transition-all ${
                  mode === "glow"
                    ? "border-[color:var(--mint-500)] bg-[rgba(196,161,90,0.1)]"
                    : "border-[rgba(28,26,22,0.1)] bg-white/50 hover:border-[color:var(--mint-300)]"
                }`}
              >
                <Sun size={17} className="text-[color:var(--mint-500)]" />
                <div className="mt-1.5 text-sm font-medium text-ink-900">Red-Light Glow</div>
                <div className="text-[11.5px] text-ink-400">MitoRedLight · face</div>
              </button>
              <button
                onClick={() => {
                  setMode("body");
                  setAiNote(null);
                }}
                className={`rounded-xl border px-4 py-3 text-left transition-all ${
                  mode === "body"
                    ? "border-[color:var(--mint-500)] bg-[rgba(196,161,90,0.1)]"
                    : "border-[rgba(28,26,22,0.1)] bg-white/50 hover:border-[color:var(--mint-300)]"
                }`}
              >
                <Scan size={17} className="text-[color:var(--mint-500)]" />
                <div className="mt-1.5 text-sm font-medium text-ink-900">Body Contour</div>
                <div className="text-[11.5px] text-ink-400">Exomere · body region</div>
              </button>
            </div>
          </div>

          {/* Photo picker */}
          <div className="glass p-4 fade-up-2">
            <div className="flex items-center justify-between mb-2">
              <div className="field-label mb-0">Before photo</div>
              <button onClick={() => fileRef.current?.click()} className="btn btn-ghost btn-sm">
                <Upload size={14} /> Upload / capture
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={pickFile}
              />
            </div>
            {photoAssets.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {photoAssets.map((a) => (
                  <PhotoThumb key={a.id} storageUrl={a.storage_url} onClick={() => void chooseAsset(a.id)} />
                ))}
              </div>
            ) : (
              <p className="caption">No photos on record yet — upload one to begin.</p>
            )}
          </div>

          {/* Sliders */}
          {mode === "glow" ? (
            <div className="glass p-4 space-y-4 fade-up-3">
              <div className="field-label mb-0">Red-light glow · session outcome</div>
              <MintSlider label="Radiance" hint="The lit-from-within glow" value={glow.glow} min={0} max={100} onChange={(v) => setGlow((g) => ({ ...g, glow: v }))} />
              <MintSlider label="Tone evenness" hint="Softens dullness and patchiness" value={glow.tone} min={0} max={100} onChange={(v) => setGlow((g) => ({ ...g, tone: v }))} />
              <MintSlider label="Texture refinement" hint="Smoother-looking surface" value={glow.texture} min={0} max={100} onChange={(v) => setGlow((g) => ({ ...g, texture: v }))} />
              <MintSlider label="Warmth" hint="Healthy warm light bias" value={glow.warmth} min={0} max={100} onChange={(v) => setGlow((g) => ({ ...g, warmth: v }))} />
            </div>
          ) : (
            <div className="glass p-4 space-y-4 fade-up-3">
              <div className="field-label mb-0">Body contour · target region</div>
              <div className="flex flex-wrap gap-1.5">
                {CONTOUR_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPreset(p);
                      setRegion(p.region);
                    }}
                    className={`chip ${preset.id === p.id ? "chip-active" : ""}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <MintSlider label="Contour strength" hint="Projected slimming of the region" value={strength} min={0} max={100} onChange={setStrength} />
              <MintSlider label="Skin firmness" hint="Smoother, firmer-looking skin" value={firmness} min={0} max={100} onChange={setFirmness} />
              <div className="pt-1 border-t border-[rgba(28,26,22,0.07)] space-y-4">
                <div className="caption">Position the treatment window on the photo:</div>
                <MintSlider label="Horizontal" value={Math.round(region.cx * 100)} min={10} max={90} onChange={(v) => setRegion((r) => ({ ...r, cx: v / 100 }))} />
                <MintSlider label="Vertical" value={Math.round(region.cy * 100)} min={10} max={92} onChange={(v) => setRegion((r) => ({ ...r, cy: v / 100 }))} />
                <MintSlider label="Width" value={Math.round(region.rx * 100)} min={6} max={45} onChange={(v) => setRegion((r) => ({ ...r, rx: v / 100 }))} />
                <MintSlider label="Height" value={Math.round(region.ry * 100)} min={6} max={40} onChange={(v) => setRegion((r) => ({ ...r, ry: v / 100 }))} />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="glass p-4 space-y-3 fade-up-4">
            <button
              onClick={() => void runAi()}
              disabled={!beforeSrc || aiBusy}
              className="btn btn-primary w-full"
            >
              {aiBusy ? <Spinner className="w-4 h-4" /> : <Sparkles size={16} />}
              {aiBusy ? "Generating photoreal preview…" : "Enhance with AI"}
            </button>
            {aiNote && <p className="caption text-center">{aiNote}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => void saveToRecord()}
                disabled={!afterSrc || !!busyMsg}
                className="btn btn-secondary"
              >
                <Save size={15} /> {saved ? "Saved ✓" : busyMsg ?? "Save to record"}
              </button>
              <button onClick={() => void download()} disabled={!afterSrc} className="btn btn-secondary">
                <Download size={15} /> Before + after
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhotoThumb({
  storageUrl,
  onClick,
}: {
  storageUrl: string;
  onClick: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void resolveImageUrl(storageUrl).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [storageUrl]);
  if (!url) return null;
  return (
    <button
      onClick={onClick}
      className="w-16 h-16 rounded-lg overflow-hidden border border-[rgba(28,26,22,0.1)] hover:border-[color:var(--mint-400)] transition-colors"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="w-full h-full object-cover" />
    </button>
  );
}
