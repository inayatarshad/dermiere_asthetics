"use client";

/**
 * Anti-Aging Simulator "Timeline" (T6): from the front photo, two branches
 * at +5 / +10 years — A the natural untreated course, B the same ages with
 * ongoing maintenance. Reuses the existing generation stack; every variant
 * is burned with the disclaimer and cached in IndexedDB under a
 * deterministic key, so pre-generated seeded patients work with zero
 * network (booth insurance).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Hourglass,
  Sparkles,
  ShieldAlert,
  CloudOff,
  DownloadCloud,
  Check,
} from "lucide-react";
import { useStore, usePatientConsents, consentGranted } from "@/lib/store";
import { useAssetUrl } from "@/lib/hooks";
import {
  AGING_VARIANTS,
  agingPrompt,
  timelineCacheKey,
  type AgingBranch,
  type AgingYears,
} from "@/lib/agingPrompts";
import { generateAfterImage } from "@/lib/generateClient";
import { resolveImageUrl, saveImage } from "@/lib/db";
import { burnDisclaimer } from "@/lib/face/warp2d";
import { loadImage, canvasToBlob } from "@/lib/img";
import { AI_DISCLAIMER, type Consultation, type Patient } from "@/lib/types";
import { GlassCard, Chip, EmptyState, Spinner } from "@/components/ui";
import { BeforeAfterSlider } from "@/components/BeforeAfterSlider";

type VariantMap = Record<string, string>; // `${branch}:${years}` -> displayable url

export function TimelineStep({
  consultation,
  patient,
}: {
  consultation: Consultation;
  patient: Patient;
}) {
  const assets = useStore((s) => s.assets);
  const aiProvider = useStore((s) => s.aiProvider);
  const consents = usePatientConsents(patient.id);
  const photographyOk = !!consentGranted(consents, "photography");
  const aiDisabled = aiProvider === "none";

  const frontPhoto = useMemo(() => {
    const all = assets
      .filter((a) => a.patient_id === patient.id && a.kind === "photo_front")
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return all.find((a) => a.consultation_id === consultation.id) ?? all[0];
  }, [assets, patient.id, consultation.id]);

  const beforeUrl = useAssetUrl(frontPhoto);

  const [years, setYears] = useState<0 | AgingYears>(5);
  const [variants, setVariants] = useState<VariantMap>({});
  const [working, setWorking] = useState<string | null>(null); // progress label
  const [genError, setGenError] = useState<{ code: string; message: string } | null>(null);

  // Load any cached variants (deterministic IndexedDB keys) on mount
  useEffect(() => {
    let cancelled = false;
    if (!frontPhoto) return;
    (async () => {
      const found: VariantMap = {};
      for (const v of AGING_VARIANTS) {
        const url = await resolveImageUrl(
          `idb:${timelineCacheKey(frontPhoto.id, v.branch, v.years)}`
        );
        if (url) found[`${v.branch}:${v.years}`] = url;
      }
      if (!cancelled) setVariants(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [frontPhoto]);

  const ensureVariant = useCallback(
    async (branch: AgingBranch, y: AgingYears): Promise<boolean> => {
      if (!frontPhoto || !beforeUrl) return false;
      const mapKey = `${branch}:${y}`;
      if (variants[mapKey]) return true;

      setWorking(
        `${branch === "natural" ? "Natural course" : "With maintenance"} at +${y} years...`
      );
      const outcome = await generateAfterImage(
        beforeUrl,
        agingPrompt(branch, y),
        `timeline|${aiProvider}|${frontPhoto.id}|${branch}|${y}`,
        `timeline_${branch}_${y}`,
        aiProvider
      );
      if (!outcome.ok) {
        setGenError({ code: outcome.code, message: outcome.message });
        return false;
      }
      // Burn the disclaimer, persist to IndexedDB (offline cache), display
      const img = await loadImage(outcome.imageDataUrl);
      const stamped = burnDisclaimer(img, AI_DISCLAIMER);
      const blob = await canvasToBlob(stamped, 0.92);
      const cacheKey = timelineCacheKey(frontPhoto.id, branch, y);
      await saveImage(cacheKey, blob);
      const url = await resolveImageUrl(`idb:${cacheKey}`);
      if (url) setVariants((m) => ({ ...m, [mapKey]: url }));
      return true;
    },
    [frontPhoto, beforeUrl, variants, aiProvider]
  );

  const generatePair = async (y: AgingYears) => {
    setGenError(null);
    const okA = await ensureVariant("natural", y);
    if (okA) await ensureVariant("maintained", y);
    setWorking(null);
  };

  const preGenerateAll = async () => {
    setGenError(null);
    for (const v of AGING_VARIANTS) {
      const ok = await ensureVariant(v.branch, v.years);
      if (!ok) break;
    }
    setWorking(null);
  };

  const cachedCount = Object.keys(variants).length;
  const pairReady = (y: AgingYears) =>
    !!variants[`natural:${y}`] && !!variants[`maintained:${y}`];

  // ---------------- guards ----------------
  if (!photographyOk) {
    return (
      <EmptyState
        icon={<ShieldAlert size={30} />}
        title="Photography consent required"
        body="The aging simulation processes the patient's facial photo. Capture photography consent on the patient profile first."
      />
    );
  }
  if (!frontPhoto) {
    return (
      <EmptyState
        icon={<Hourglass size={30} />}
        title="No front photo available"
        body="Capture the patient's front photo in the 3D Canvas step to run the aging timeline."
      />
    );
  }

  return (
    <div className="grid lg:grid-cols-[1.35fr_1fr] gap-4 fade-up">
      {/* Stage */}
      <div className="space-y-3">
        <GlassCard strong className="p-5">
          {/* year toggle */}
          <div className="flex gap-2 justify-center mb-4">
            {([0, 5, 10] as const).map((y) => (
              <Chip
                key={y}
                active={years === y}
                onClick={() => {
                  setYears(y);
                  if (y !== 0 && !pairReady(y) && !working && !aiDisabled) {
                    void generatePair(y);
                  }
                }}
              >
                {y === 0 ? "Now" : `+${y} years`}
              </Chip>
            ))}
          </div>

          {years === 0 ? (
            beforeUrl ? (
              <div
                className="relative rounded-2xl overflow-hidden border border-white/70 shadow-lg"
                style={{ aspectRatio: "4 / 4.4", background: "var(--mint-100)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={beforeUrl}
                  alt="Today"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <span className="absolute top-3 left-3 rounded-full bg-black/40 text-white text-xs px-3 py-1 backdrop-blur-md">
                  Today
                </span>
              </div>
            ) : (
              <div className="shimmer rounded-2xl" style={{ aspectRatio: "4/4.4" }} />
            )
          ) : pairReady(years) ? (
            <BeforeAfterSlider
              beforeSrc={variants[`natural:${years}`]}
              afterSrc={variants[`maintained:${years}`]}
              beforeLabel={`Natural course · +${years}y`}
              afterLabel={`With maintenance · +${years}y`}
            />
          ) : (
            <div
              className="relative rounded-2xl overflow-hidden flex items-center justify-center"
              style={{ aspectRatio: "4 / 4.4", background: "var(--mint-100)" }}
            >
              {working ? (
                <div className="text-center px-8">
                  <Spinner className="w-8 h-8 mx-auto" />
                  <p className="caption mt-3">{working}</p>
                </div>
              ) : (
                <p className="caption px-8 text-center">
                  {aiDisabled
                    ? "Photoreal AI is turned off in Settings; the aging simulation needs it."
                    : "Select a year to generate both branches."}
                </p>
              )}
            </div>
          )}

          <p className="caption flex items-center gap-1.5 mt-3">
            <ShieldAlert size={13} className="shrink-0" />
            Illustrative simulation of possible aging, not a prediction.
            {years !== 0 && pairReady(years)
              ? " Drag the divider: natural course versus maintained."
              : ""}
          </p>
        </GlassCard>

        {working && (
          <GlassCard className="px-5 py-3.5 flex items-center gap-3">
            <Spinner />
            <span className="text-sm text-ink-700">{working}</span>
          </GlassCard>
        )}
        {genError && (
          <GlassCard className="px-5 py-3.5 flex items-start gap-3">
            <CloudOff size={17} className="text-warning mt-0.5 shrink-0" />
            <div className="text-sm text-ink-700">
              {genError.code === "no_api_key" ? (
                <>
                  <b>Photoreal AI is not configured.</b> The aging timeline is
                  a pure AI rendering (skin and volume change), so it needs a
                  provider key. Add <code className="text-xs bg-mint-100 px-1.5 py-0.5 rounded">GEMINI_API_KEY</code>{" "}
                  on the server, then pre-generate the booth cache.
                </>
              ) : (
                <>
                  <b>Generation failed.</b> {genError.message}
                </>
              )}
            </div>
          </GlassCard>
        )}
      </div>

      {/* Right rail */}
      <div className="space-y-4">
        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <Hourglass size={17} className="text-mint-500" />
            <h3 className="h2 text-ink-900">The maintenance story</h3>
          </div>
          <p className="text-sm text-ink-700 leading-relaxed mt-2">
            Two futures from the same photo. The left side ages naturally:
            volume loss, deepening folds, settled lines. The right side keeps
            up ongoing care: toxin, conservative filler, medical skincare.
            Both are honest simulations; both are visibly older.
          </p>
          <p className="caption mt-3">
            Quietly sobering beats dramatic: the comparison should feel
            believable, never like a filter.
          </p>
        </GlassCard>

        <GlassCard strong className="p-5 space-y-2.5">
          <button
            className="btn btn-primary w-full"
            disabled={!!working || aiDisabled || years === 0 || pairReady(years as AgingYears)}
            onClick={() => generatePair(years as AgingYears)}
          >
            {working ? <Spinner className="w-4 h-4" /> : <Sparkles size={16} />}
            Generate +{years === 0 ? 5 : years} year compare
          </button>
          <button
            className="btn btn-secondary w-full"
            disabled={!!working || aiDisabled || cachedCount === 4}
            onClick={preGenerateAll}
            title="Generate and cache all four variants on this device for offline booth use"
          >
            {cachedCount === 4 ? <Check size={16} /> : <DownloadCloud size={16} />}
            {cachedCount === 4
              ? "Booth cache complete"
              : `Pre-generate booth cache (${cachedCount}/4)`}
          </button>
          <p className="caption">
            Variants are stored on this device with the disclaimer burned in,
            so the timeline works with zero network at the booth.
          </p>
        </GlassCard>
      </div>
    </div>
  );
}
