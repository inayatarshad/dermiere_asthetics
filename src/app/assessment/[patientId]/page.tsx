"use client";

/**
 * Aesthetic Assessment Report — the free lead-magnet one-pager
 * (spec: Contour-AI-Aesthetic-Report-Module-SPEC.md).
 *
 * One front photo in; one branded A4 out. The layout is OURS (React +
 * print CSS = identical every time); the patient-specific content comes
 * from two engines: deterministic landmark geometry (golden-ratio lens
 * for women, masculine standards for men) and AI skin vision (locked
 * taxonomy). Annotations are drawn on canvas from coordinates — no
 * generative layout anywhere, which is what keeps report #500 as clean
 * as report #1.
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Printer, Save, Check, Sparkles } from "lucide-react";
import { useStore, useSessionUser } from "@/lib/store";
import { useMounted, useFaceData } from "@/lib/hooks";
import { computeGeometry, geometryRecommendations, type Sex } from "@/lib/assessment/geometry";
import { buildAnnotatedImage, type AnnotationResult } from "@/lib/assessment/annotate";
import type { SkinAnalysis, SkinFinding } from "@/app/api/assessment/skin/route";
import { TEMPLATES, getTemplate } from "@/lib/templates";
import { toModelInput, canvasToBlob, loadImage } from "@/lib/img";
import { saveImage, loadJson, saveJson } from "@/lib/db";
import { firstName, formatDate } from "@/lib/format";
import { Spinner, Chip, EmptyState } from "@/components/ui";

type SkinState =
  | { status: "loading" }
  | { status: "ready"; analysis: SkinAnalysis }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

const SKIN_LABELS: Record<string, string> = {
  pigmentation: "Pigmentation",
  uneven_tone: "Uneven tone",
  texture: "Texture",
  enlarged_pores: "Enlarged pores",
  redness: "Redness",
  under_eye_shadow: "Under-eye shadows",
  fine_lines: "Fine lines",
  laxity: "Skin laxity",
  acne: "Active breakouts",
  acne_scarring: "Acne scarring",
  dullness: "Dullness",
  dryness: "Dryness",
  hairline_recession: "Hairline recession",
};

/** Controlled skin-finding -> suggestion map (menu templates when live). */
const SKIN_TO_REC: Record<string, { label: string; templateId?: string }> = {
  pigmentation: { label: "Pigment & brightening program" },
  uneven_tone: { label: "Tone-evening skincare protocol" },
  texture: { label: "Resurfacing program" },
  enlarged_pores: { label: "Pore-refining program" },
  redness: { label: "Calming / vascular protocol" },
  under_eye_shadow: { label: "Under-eye support (consult)" },
  fine_lines: { label: "Line-softening toxin zones", templateId: "botox" },
  laxity: { label: "Energy-based tightening (consult)" },
  acne: { label: "Acne control program" },
  acne_scarring: { label: "Scar-revision program" },
  dullness: { label: "Glow protocol (skin boosters)" },
  dryness: { label: "Barrier-repair skincare" },
  hairline_recession: { label: "Hair restoration", templateId: "hair_transplant" },
};

function AssessmentInner() {
  const { patientId } = useParams<{ patientId: string }>();
  const router = useRouter();
  const mounted = useMounted();
  const user = useSessionUser();
  const seeded = useStore((s) => s.seeded);
  const seedIfNeeded = useStore((s) => s.seedIfNeeded);
  const clinic = useStore((s) => s.clinic);
  const patient = useStore((s) => s.patients.find((p) => p.id === patientId));
  const assets = useStore((s) => s.assets);
  const addAsset = useStore((s) => s.addAsset);
  const bumpAiUsage = useStore((s) => s.bumpAiUsage);

  useEffect(() => {
    seedIfNeeded();
  }, [seedIfNeeded]);
  useEffect(() => {
    if (mounted && seeded && !user) router.replace("/");
  }, [mounted, seeded, user, router]);

  const frontPhoto = useMemo(
    () =>
      assets
        .filter((a) => a.patient_id === patientId && a.kind === "photo_front")
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0],
    [assets, patientId]
  );
  const face = useFaceData(frontPhoto);

  const [sex, setSex] = useState<Sex | null>(null);
  const effectiveSex: Sex =
    sex ?? (patient?.gender === "male" ? "male" : "female");
  const [skin, setSkin] = useState<SkinState>({ status: "loading" });
  const [saved, setSaved] = useState(false);

  // ---- skin analysis (cached per photo in IndexedDB for booth reuse) ----
  useEffect(() => {
    let cancelled = false;
    const img = face.image;
    if (!frontPhoto || !img) return;
    (async () => {
      const cacheKey = `assess_skin_${frontPhoto.id}`;
      const cached = await loadJson<SkinAnalysis>(cacheKey);
      if (cached && !cancelled) {
        setSkin({ status: "ready", analysis: cached });
        return;
      }
      try {
        const imageDataUrl = await toModelInput(img.src);
        const res = await fetch("/api/assessment/skin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl }),
        });
        const data = (await res.json()) as SkinAnalysis & {
          error?: string;
          message?: string;
        };
        if (cancelled) return;
        if (res.ok) {
          await saveJson(cacheKey, data);
          bumpAiUsage("assessments");
          setSkin({ status: "ready", analysis: data });
        } else if (data.error === "no_api_key") {
          setSkin({ status: "unavailable", message: data.message ?? "" });
        } else {
          setSkin({ status: "error", message: data.message ?? "Analysis failed." });
        }
      } catch {
        if (!cancelled)
          setSkin({ status: "error", message: "Could not reach the analysis service." });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontPhoto?.id, face.image]);

  // ---- deterministic computation -----------------------------------------
  const geometry = useMemo(() => {
    if (!face.landmarks || !face.image) return null;
    return computeGeometry(
      face.landmarks,
      face.image.naturalWidth,
      face.image.naturalHeight,
      effectiveSex
    );
  }, [face.landmarks, face.image, effectiveSex]);

  const skinFindings: SkinFinding[] =
    skin.status === "ready" ? skin.analysis.findings : [];

  const annotation: AnnotationResult | null = useMemo(() => {
    if (!face.image || !face.landmarks || !geometry) return null;
    return buildAnnotatedImage(face.image, face.landmarks, geometry, skinFindings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face.image, face.landmarks, geometry, skin.status]);

  // ---- recommendations (controlled menu only) ------------------------------
  const available = useMemo(() => TEMPLATES.filter((t) => t.available), []);
  const injectableRecs = useMemo(
    () => (geometry ? geometryRecommendations(geometry, available) : []),
    [geometry, available]
  );
  const skinRecs = useMemo(() => {
    const seen = new Set<string>();
    return skinFindings
      .map((f) => ({ finding: f, rec: SKIN_TO_REC[f.id] }))
      .filter((x) => {
        if (!x.rec || seen.has(x.rec.label)) return false;
        seen.add(x.rec.label);
        return true;
      });
  }, [skinFindings]);
  const structuralRecs = useMemo(
    () =>
      skinRecs
        .filter((x) => x.rec.templateId === "hair_transplant")
        .map((x) => ({
          name: getTemplate("hair_transplant")?.name ?? "Hair restoration",
          motivation: x.finding.note,
        }))
        .concat(
          injectableRecs
            .filter((r) => r.templateId === "rhinoplasty")
            .map((r) => ({ name: r.name, motivation: r.motivation }))
        ),
    [skinRecs, injectableRecs]
  );
  const injectablesOnly = injectableRecs.filter(
    (r) => r.templateId !== "rhinoplasty"
  );

  // ---- save to record -------------------------------------------------------
  const save = async () => {
    if (!annotation || !patient) return;
    const img = await loadImage(annotation.annotatedDataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    const blob = await canvasToBlob(canvas, 0.9);
    const key = crypto.randomUUID();
    await saveImage(key, blob);
    addAsset({
      patient_id: patient.id,
      kind: "assessment",
      storage_url: `idb:${key}`,
      meta: {
        label: "Aesthetic assessment report",
        params: { balance: geometry?.balanceScore ?? 0 },
      },
    });
    setSaved(true);
  };

  // ---------------- guards ----------------
  if (!mounted || !seeded || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }
  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <EmptyState title="Patient not found" />
      </div>
    );
  }
  if (!frontPhoto) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <EmptyState
          icon={<Sparkles size={28} />}
          title="No front photo yet"
          body="The assessment needs one front photo. Capture it from the patient profile, then come back."
          action={
            <button
              className="btn btn-primary btn-sm"
              onClick={() => router.push(`/patients/${patient.id}`)}
            >
              Open profile
            </button>
          }
        />
      </div>
    );
  }

  const brand = {
    name: clinic?.name ?? "Contour Clinic",
    phone: clinic?.branding?.phone ?? "",
    web: clinic?.branding?.email ?? "",
  };
  const topMetrics = geometry
    ? [...geometry.metrics]
        .sort((a, b) => a.alignment - b.alignment)
        .slice(0, 4)
    : [];

  return (
    <div className="min-h-screen py-8 px-4">
      {/* floating toolbar */}
      <div className="no-print fixed top-4 left-1/2 -translate-x-1/2 z-50">
        <div className="glass-strong flex items-center gap-2 px-3 py-2 rounded-full flex-wrap justify-center">
          <button className="btn btn-ghost btn-sm" onClick={() => router.back()}>
            <ChevronLeft size={15} />
            Back
          </button>
          <span className="caption hidden sm:block px-1">Assessment Report</span>
          <Chip active={effectiveSex === "female"} onClick={() => setSex("female")}>
            Feminine standard
          </Chip>
          <Chip active={effectiveSex === "male"} onClick={() => setSex("male")}>
            Masculine standard
          </Chip>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => void save()}
            disabled={!annotation || saved}
          >
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saved ? "Saved" : "Save to record"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
            <Printer size={14} />
            Download PDF
          </button>
        </div>
      </div>

      <div className="overflow-x-auto pt-14 print:pt-0 print:overflow-visible">
        <div className="report-root">
          <section className="report-sheet report-body">
            {/* 1 · header band */}
            <header className="rb-header rb-header-branded">
              <div>
                <span className="rb-header-clinic">{brand.name}</span>
                <h2 className="rb-header-title">Aesthetic Assessment</h2>
              </div>
              <div className="ar-header-right">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/contour-mark-192.png" alt="Contour" className="rb-header-mark" />
                <span className="ar-header-meta">
                  {firstName(patient.name)} · {formatDate(new Date().toISOString())}
                </span>
              </div>
            </header>

            {/* 2 · hero: photo + annotated */}
            <div className="ar-hero">
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {face.image && <img src={face.image.src} alt="Patient" />}
                <figcaption>Your photo</figcaption>
              </figure>
              <figure>
                {annotation ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={annotation.annotatedDataUrl} alt="Assessment overlay" />
                ) : (
                  <div className="ar-hero-loading">
                    {face.status === "loading" ? "Analysing proportions…" : "Preparing overlay…"}
                  </div>
                )}
                <figcaption>Proportion &amp; skin mapping</figcaption>
              </figure>
            </div>

            {/* 3 · golden balance strip */}
            {geometry && (
              <div className="rb-panel ar-balance">
                <div className="ar-score">
                  <span className="ar-score-num">{geometry.balanceScore}</span>
                  <span className="ar-score-label">
                    Golden balance
                    <em>
                      {effectiveSex === "female"
                        ? "classical Φ standard"
                        : "masculine standard"}
                    </em>
                  </span>
                </div>
                <div className="ar-metrics">
                  {topMetrics.map((m) => (
                    <div key={m.id} className="ar-metric">
                      <div className="ar-metric-head">
                        <span>{m.label}</span>
                        <b>
                          {m.value} <em>· ideal {m.ideal}</em>
                        </b>
                      </div>
                      <div className="ar-bar">
                        <div className="ar-bar-fill" style={{ width: `${m.alignment}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4 · findings: three columns */}
            <div className="ar-cols">
              <div className="rb-panel cp-tight">
                <div className="rb-label">Harmony &amp; injectables</div>
                {injectablesOnly.length > 0 ? (
                  <ul className="ar-list">
                    {injectablesOnly.map((r) => (
                      <li key={r.templateId}>
                        <b>{r.name}</b>
                        <span>{r.motivation}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="ar-clear">
                    Proportions already sit close to the classical standard —
                    nothing structural to suggest.
                  </p>
                )}
              </div>

              <div className="rb-panel cp-tight">
                <div className="rb-label">Skin &amp; skincare</div>
                {skin.status === "loading" && (
                  <p className="ar-clear no-print">Analysing skin…</p>
                )}
                {skin.status === "unavailable" && (
                  <p className="ar-clear">
                    Skin analysis pending — the proportion review above is
                    complete; ask the clinic for the full skin read.
                  </p>
                )}
                {skin.status === "error" && (
                  <p className="ar-clear">
                    Skin analysis unavailable for this photo.
                  </p>
                )}
                {skin.status === "ready" && (
                  <ul className="ar-list">
                    {skinFindings.map((f, i) => (
                      <li key={`${f.id}_${i}`}>
                        <b>
                          <span className="ar-num">{i + 1}</span>
                          {SKIN_LABELS[f.id] ?? f.id} · {f.severity}
                        </b>
                        <span>
                          {f.note}
                          {SKIN_TO_REC[f.id] ? ` → ${SKIN_TO_REC[f.id].label}.` : ""}
                        </span>
                      </li>
                    ))}
                    {skinFindings.length === 0 && (
                      <li>
                        <b>Excellent skin</b>
                        <span>No notable findings on this photo.</span>
                      </li>
                    )}
                  </ul>
                )}
              </div>

              <div className="rb-panel cp-tight">
                <div className="rb-label">Strengths</div>
                <ul className="ar-list">
                  {geometry?.metrics
                    .filter((m) => m.alignment >= 88)
                    .slice(0, 3)
                    .map((m) => (
                      <li key={m.id}>
                        <b>{m.label}</b>
                        <span>{m.insight}</span>
                      </li>
                    ))}
                  {skin.status === "ready" &&
                    skin.analysis.strengths.slice(0, 2).map((s) => (
                      <li key={s}>
                        <b>Skin</b>
                        <span>{s}</span>
                      </li>
                    ))}
                </ul>
              </div>
            </div>

            {/* evidence crops */}
            {annotation && annotation.crops.length > 0 && (
              <div className="ar-crops">
                {annotation.crops.map((c) => (
                  <figure key={c.index}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.dataUrl} alt={c.label} />
                    <figcaption>
                      <span className="ar-num">{c.index}</span> {c.label}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}

            {/* 5 · suggested journey */}
            <div className="rb-panel cp-tight">
              <div className="rb-label">Your suggested journey</div>
              <div className="ar-journey">
                <div>
                  <b>Now</b>
                  <span>
                    {injectablesOnly.length > 0
                      ? injectablesOnly.map((r) => r.name).join(" · ")
                      : "A consultation to review your goals"}
                  </span>
                </div>
                <div>
                  <b>Next 4–8 weeks</b>
                  <span>
                    {skinRecs.length > 0
                      ? skinRecs
                          .slice(0, 3)
                          .map((x) => x.rec.label)
                          .join(" · ")
                      : "Skin maintenance and review"}
                  </span>
                </div>
                <div>
                  <b>Longer term</b>
                  <span>
                    {structuralRecs.length > 0
                      ? structuralRecs.map((r) => r.name).join(" · ")
                      : "Annual balance review"}
                  </span>
                </div>
              </div>
            </div>

            {/* 6 · footer CTA + disclaimers */}
            <footer className="ar-footer">
              <div className="ar-cta">
                <b>Book your consultation with {brand.name}</b>
                <span>
                  {brand.phone}
                  {brand.web ? ` · ${brand.web}` : ""}
                </span>
              </div>
              <p className="ar-disclaimer">
                This report is an aesthetic guide generated from a single
                photograph — not a medical diagnosis and not a treatment plan.
                All observations are qualitative and must be confirmed by your
                physician in person. Suggestions reference this clinic's
                treatment menu only. Individual results vary.
              </p>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function AssessmentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Spinner className="w-8 h-8" />
        </div>
      }
    >
      <AssessmentInner />
    </Suspense>
  );
}
