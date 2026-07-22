"use client";

/**
 * Facial Aesthetic Assessment — the free lead-magnet one-pager
 * (spec: Contour-AI-Aesthetic-Report-Module-SPEC.md §11).
 *
 * Design register: printed clinic artefact. Flat white letterhead document
 * (Fraunces display over Inter body, hairline rules, one restrained mint
 * accent), structured like a real facial assessment: proportional analysis
 * grouped by facial region with measured-vs-reference values, skin
 * assessment with inline evidence, treatment considerations, sequence,
 * sign-off. The DOCTOR CAN EDIT the wording in place (Edit report) before
 * printing to PDF, so what leaves the clinic is theirs.
 *
 * Content engines stay split (consistency guarantee): geometry = our
 * landmark trigonometry; skin = locked-taxonomy vision (graceful without
 * a key); annotations = canvas-drawn. Layout is never generated.
 */

import { Fragment, Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  Printer,
  Save,
  Check,
  Sparkles,
  PenLine,
  X,
} from "lucide-react";
import { useStore, useSessionUser } from "@/lib/store";
import { useMounted, useFaceData } from "@/lib/hooks";
import { SKIN_METRIC_LABELS } from "@/lib/types";
import {
  computeGeometry,
  quantitativeSuggestions,
  type MetricResult,
  type Sex,
  type TreatmentSuggestion,
} from "@/lib/assessment/geometry";
import {
  buildAnnotatedImage,
  type AnnotationResult,
} from "@/lib/assessment/annotate";
import type {
  SkinAnalysis,
  SkinFinding,
} from "@/app/api/assessment/skin/route";
import { TEMPLATES, getTemplate } from "@/lib/templates";
import { toModelInput, canvasToBlob, loadImage } from "@/lib/img";
import { saveImage, loadJson, saveJson } from "@/lib/db";
import { firstName } from "@/lib/format";
import { Spinner, Chip, EmptyState } from "@/components/ui";

type SkinState =
  | { status: "loading" }
  | { status: "ready"; analysis: SkinAnalysis }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

const SKIN_LABELS: Record<string, string> = {
  pigmentation: "Pigmentation",
  uneven_tone: "Uneven tone",
  texture: "Texture irregularity",
  enlarged_pores: "Enlarged pores",
  redness: "Diffuse redness",
  under_eye_shadow: "Under-eye shadowing",
  fine_lines: "Fine lines",
  laxity: "Early laxity",
  acne: "Active breakouts",
  acne_scarring: "Acne scarring",
  dullness: "Dullness",
  dryness: "Dryness",
  hairline_recession: "Hairline recession",
};

const SKIN_TO_REC: Record<string, { label: string; templateId?: string }> = {
  pigmentation: { label: "pigment and brightening program" },
  uneven_tone: { label: "tone-evening skincare protocol" },
  texture: { label: "resurfacing program" },
  enlarged_pores: { label: "pore-refining program" },
  redness: { label: "calming or vascular protocol" },
  under_eye_shadow: { label: "under-eye support, to review in person" },
  fine_lines: { label: "line-softening toxin zones", templateId: "botox" },
  laxity: { label: "energy-based tightening, to review in person" },
  acne: { label: "acne control program" },
  acne_scarring: { label: "scar-revision program" },
  dullness: { label: "glow protocol with skin boosters" },
  dryness: { label: "barrier-repair skincare" },
  hairline_recession: { label: "hair restoration", templateId: "hair_transplant" },
};

/** Clinically-grouped presentation of the metric suite. */
const REGION_GROUPS: { title: string; ids: string[] }[] = [
  { title: "Global balance", ids: ["symmetry", "face_ratio", "thirds", "fifths"] },
  { title: "Periocular", ids: ["canthal"] },
  { title: "Midface and nose", ids: ["nose_width"] },
  { title: "Lower face and lips", ids: ["lip_ratio", "lower_third", "jaw_cheek"] },
];

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Doctor-editable text span. Deliberately hoisted to module level and
 * rendered via dangerouslySetInnerHTML: a component defined inside the
 * page (or children rendered from state) would be remounted/reset by
 * React on every unrelated re-render, wiping the doctor's uncommitted
 * typing. This way the DOM text is left alone until commit.
 */
function Editable({
  id,
  text,
  editing,
  onCommit,
  className,
}: {
  id: string;
  text: string;
  editing: boolean;
  onCommit: (id: string, text: string) => void;
  className?: string;
}) {
  return (
    <span
      contentEditable={editing}
      suppressContentEditableWarning
      className={`${className ?? ""} ${editing ? "ar-editable" : ""}`}
      onBlur={(e) => onCommit(id, e.currentTarget.textContent ?? "")}
      dangerouslySetInnerHTML={{ __html: escapeHtml(text) }}
    />
  );
}

function RemoveBtn({
  id,
  editing,
  onRemove,
}: {
  id: string;
  editing: boolean;
  onRemove: (id: string) => void;
}) {
  if (!editing) return null;
  return (
    <button
      className="ar-remove no-print"
      onClick={() => onRemove(id)}
      title="Remove from the report"
    >
      <X size={11} />
    </button>
  );
}

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
  // MARK-VU scans (stable selector; derive with useMemo — no fresh refs)
  const allScans = useStore((s) => s.skinAnalyses);
  const patientScans = useMemo(
    () =>
      allScans
        .filter((a) => a.patient_id === patientId)
        .sort((a, b) => b.taken_at.localeCompare(a.taken_at)),
    [allScans, patientId]
  );
  const latestScan = patientScans[0];
  const previousScan = patientScans[1];

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

  // ---- doctor edit mode -----------------------------------------------
  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const commit = (id: string, text: string) =>
    setOverrides((o) => ({ ...o, [id]: text }));
  const remove = (id: string) =>
    setRemoved((r) => new Set(r).add(id));
  /** props threaded into every Editable/RemoveBtn call site */
  const ed = { editing, onCommit: commit };
  const rm = { editing, onRemove: remove };
  const txt = (id: string, fallback: string) => overrides[id] ?? fallback;

  // ---- skin analysis (cached per photo) ---------------------------------
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
          setSkin({
            status: "error",
            message: "Could not reach the analysis service.",
          });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontPhoto?.id, face.image]);

  // ---- deterministic engines ---------------------------------------------
  const geometry = useMemo(() => {
    if (!face.landmarks || !face.image) return null;
    return computeGeometry(
      face.landmarks,
      face.image.naturalWidth,
      face.image.naturalHeight,
      effectiveSex
    );
  }, [face.landmarks, face.image, effectiveSex]);

  const allFindings: SkinFinding[] =
    skin.status === "ready" ? skin.analysis.findings.slice(0, 5) : [];
  // rows the doctor removed disappear from the TABLE and the OVERLAY both,
  // and the numbering re-flows — a sent PDF must never carry an orphan
  // marker or a list that starts at 2
  const visibleFindings = allFindings
    .map((f, origIdx) => ({ f, origIdx }))
    .filter((x) => !removed.has(`skinrow_${x.origIdx}`));
  const skinFindings = visibleFindings.map((x) => x.f);

  const annotation: AnnotationResult | null = useMemo(() => {
    if (!face.image || !face.landmarks || !geometry) return null;
    return buildAnnotatedImage(face.image, face.landmarks, geometry, skinFindings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [face.image, face.landmarks, geometry, skin.status, removed]);

  const metricById = useMemo(() => {
    const map = new Map<string, MetricResult>();
    for (const m of geometry?.metrics ?? []) map.set(m.id, m);
    return map;
  }, [geometry]);

  // ---- quantitative considerations (controlled menu only) ----------------
  const available = useMemo(() => TEMPLATES.filter((t) => t.available), []);
  // doctor-added rows (edit mode "+ Add")
  const [extraConsiderations, setExtraConsiderations] = useState<string[]>([]);
  const [extraObservations, setExtraObservations] = useState<string[]>([]);

  const considerations = useMemo<TreatmentSuggestion[]>(() => {
    if (!geometry) return [];
    const geo = quantitativeSuggestions(geometry, available);
    const seen = new Set<string>();
    const skinItems: TreatmentSuggestion[] = skinFindings
      .map((f) => ({ f, rec: SKIN_TO_REC[f.id] }))
      .filter((x) => {
        if (!x.rec || seen.has(x.rec.label)) return false;
        seen.add(x.rec.label);
        return true;
      })
      .map((x) => ({
        id: `skin_${x.f.id}`,
        procedure:
          x.rec.templateId && getTemplate(x.rec.templateId)?.available
            ? getTemplate(x.rec.templateId)!.name
            : x.rec.label.charAt(0).toUpperCase() + x.rec.label.slice(1),
        templateId: x.rec.templateId,
        bucket:
          x.rec.templateId === "hair_transplant"
            ? ("structural" as const)
            : ("skin" as const),
        deviation: `${SKIN_LABELS[x.f.id] ?? x.f.id} (${x.f.severity}) noted at the ${x.f.region.replace(/_/g, " ")}: ${x.f.note}`,
        dose: `Suggested: ${x.rec.label}, tailored at the consultation.`,
      }));
    const extras: TreatmentSuggestion[] = extraConsiderations.map((id) => ({
      id,
      procedure: "New consideration",
      bucket: "injectable" as const,
      deviation: "Describe the observation and how far it deviates.",
      dose: "Suggested quantity and placement, to be confirmed in person.",
    }));
    return [...geo, ...skinItems, ...extras].slice(0, 8);
  }, [geometry, available, skinFindings, extraConsiderations]);

  const visibleConsiderations = considerations.filter(
    (c) => !removed.has(c.id)
  );
  // the sequence keeps every procedure on its OWN line, and surgical work
  // never shares "Now" with injectables (owner requirement)
  const seqBuckets: { title: string; key: string; items: TreatmentSuggestion[]; fallback: string }[] = [
    {
      title: "Now",
      key: "now",
      items: visibleConsiderations.filter((c) => c.bucket === "injectable"),
      fallback: "A consultation to review your goals",
    },
    {
      title: "Four to eight weeks",
      key: "soon",
      items: visibleConsiderations.filter((c) => c.bucket === "skin"),
      fallback: "Skin maintenance and review",
    },
    {
      title: "Longer term",
      key: "later",
      items: visibleConsiderations.filter((c) => c.bucket === "structural"),
      fallback: "Annual balance and skin review",
    },
  ];

  // ---- save to record ------------------------------------------------------
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

  const clinicName = clinic?.name ?? "CAPTURE";
  const clinicLine = [clinic?.branding?.phone, clinic?.branding?.email]
    .filter(Boolean)
    .join(" · ");
  const today = new Date();
  const reportRef = `CA-${String(patientId).slice(0, 6).toUpperCase()}-${today
    .toISOString()
    .slice(2, 10)
    .replace(/-/g, "")}`;
  const dateLine = today.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen py-8 px-4">
      {/* floating toolbar */}
      <div className="no-print fixed top-4 left-1/2 -translate-x-1/2 z-50">
        <div className="glass-strong flex items-center gap-2 px-3 py-2 rounded-full flex-wrap justify-center">
          <button className="btn btn-ghost btn-sm" onClick={() => router.back()}>
            <ChevronLeft size={15} />
            Back
          </button>
          <Chip active={effectiveSex === "female"} onClick={() => setSex("female")}>
            Feminine standard
          </Chip>
          <Chip active={effectiveSex === "male"} onClick={() => setSex("male")}>
            Masculine standard
          </Chip>
          <button
            className={`btn btn-sm ${editing ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setEditing((e) => !e)}
            title="Edit the report wording before sending"
          >
            <PenLine size={14} />
            {editing ? "Done editing" : "Edit report"}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => void save()}
            disabled={!annotation || saved}
          >
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saved ? "Saved" : "Save to record"}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setEditing(false);
              setTimeout(() => window.print(), 60);
            }}
          >
            <Printer size={14} />
            Download PDF
          </button>
        </div>
      </div>

      <div className="overflow-x-auto pt-14 print:pt-0 print:overflow-visible">
        <div className="report-root">
          <section className="report-sheet ar-sheet">
            {/* ---- letterhead ---- */}
            <header className="ar-head">
              <div className="ar-head-brand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/capture-logo-black.png" alt="" />
                <div>
                  <span className="ar-head-clinic">{clinicName}</span>
                  <h1 className="ar-title">Facial Aesthetic Assessment</h1>
                </div>
              </div>
              <dl className="ar-head-meta">
                <div>
                  <dt>Client</dt>
                  <dd>{firstName(patient.name)}</dd>
                </div>
                <div>
                  <dt>Date</dt>
                  <dd>{dateLine}</dd>
                </div>
                <div>
                  <dt>Reference</dt>
                  <dd>{reportRef}</dd>
                </div>
                <div>
                  <dt>Standard</dt>
                  <dd>{effectiveSex === "female" ? "Classical feminine" : "Classical masculine"}</dd>
                </div>
              </dl>
            </header>

            {/* ---- mapped figure + key observations ---- */}
            <div className="ar-figures ar-figures-single">
              <figure>
                {annotation ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={annotation.annotatedDataUrl} alt="Proportion and skin mapping" />
                ) : (
                  <div className="ar-fig-pending">
                    {face.status === "loading"
                      ? "Analysing proportions…"
                      : "Preparing mapping…"}
                  </div>
                )}
                <figcaption>
                  <i>Fig. 1</i> Proportion and skin mapping on the presented
                  photograph
                </figcaption>
              </figure>
              {geometry && (
                <aside className="ar-keydev">
                  <h3>Key observations</h3>
                  {[...geometry.metrics]
                    .sort((a, b) => a.alignment - b.alignment)
                    .slice(0, 4)
                    .map((m) => (
                      <div key={m.id} className="ar-keydev-row">
                        <span className="ar-keydev-label">{m.label}</span>
                        <span className="ar-keydev-val">
                          {m.value} <em>· ref {m.ideal}</em>
                        </span>
                        <span className="ar-bar ar-keydev-bar">
                          <span
                            className="ar-bar-fill"
                            style={{ width: `${m.alignment}%` }}
                          />
                        </span>
                      </div>
                    ))}
                  <p className="ar-keydev-note">
                    Full measurement table below; deviations quantified under
                    treatment considerations.
                  </p>
                </aside>
              )}
            </div>

            {/* ---- proportional analysis ---- */}
            {geometry && (
              <section className="ar-section">
                <div className="ar-section-head">
                  <h2>Proportional analysis</h2>
                  <div className="ar-gauge" aria-label="Facial harmony index">
                    <svg viewBox="0 0 44 44" width="44" height="44">
                      <circle cx="22" cy="22" r="19" fill="none" stroke="rgba(14,42,38,0.08)" strokeWidth="3.5" />
                      <circle
                        cx="22"
                        cy="22"
                        r="19"
                        fill="none"
                        stroke="var(--mint-500)"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeDasharray={`${(geometry.balanceScore / 100) * 119.4} 119.4`}
                        transform="rotate(-90 22 22)"
                      />
                      <text x="22" y="26" textAnchor="middle" className="ar-gauge-num">
                        {geometry.balanceScore}
                      </text>
                    </svg>
                    <span>
                      Harmony index
                      <em>of 100</em>
                    </span>
                  </div>
                </div>
                <table className="ar-table">
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th>Measured</th>
                      <th>Reference</th>
                      <th className="ar-th-align">Alignment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {REGION_GROUPS.map((group) => (
                      <Fragment key={group.title}>
                        <tr className="ar-group">
                          <td colSpan={4}>{group.title}</td>
                        </tr>
                        {group.ids.map((id) => {
                          const m = metricById.get(id);
                          if (!m) return null;
                          return (
                            <tr key={id}>
                              <td>{m.label}</td>
                              <td className="ar-num-cell">{m.value}</td>
                              <td className="ar-num-cell ar-muted">{m.ideal}</td>
                              <td>
                                <div className="ar-align">
                                  <span
                                    className="ar-align-bar"
                                    style={{ width: `${Math.max(6, m.alignment) * 0.56}px` }}
                                  />
                                  <span className="ar-align-num">{m.alignment}</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* ---- MARK-VU intake metrics (device-measured, when on record) ---- */}
            {latestScan && (
              <section className="ar-section">
                <div className="ar-section-head">
                  <h2>MARK-VU skin analysis</h2>
                  <span className="ar-section-note">
                    measured {new Date(latestScan.taken_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {previousScan ? " · change since intake shown" : ""}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px 22px" }}>
                  {SKIN_METRIC_LABELS.map(({ key, label, positive }) => {
                    const v = latestScan.metrics[key];
                    const prev = previousScan?.metrics[key];
                    const delta = prev !== undefined ? v - prev : undefined;
                    const improved =
                      delta !== undefined && delta !== 0 && (positive ? delta > 0 : delta < 0);
                    return (
                      <div key={key}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontSize: 9.5, fontWeight: 600 }}>{label}</span>
                          <span style={{ fontSize: 9.5 }} className="ar-num-cell">
                            {v}
                            {delta !== undefined && delta !== 0 && (
                              <em
                                style={{
                                  fontStyle: "normal",
                                  marginLeft: 4,
                                  color: improved ? "#5B8A5E" : "#B05A5A",
                                }}
                              >
                                {delta > 0 ? `+${delta}` : delta}
                              </em>
                            )}
                          </span>
                        </div>
                        <span
                          className="ar-keydev-bar"
                          style={{ maxWidth: "none", marginTop: 3 }}
                        >
                          <span
                            style={{
                              display: "block",
                              height: "100%",
                              width: `${v}%`,
                              borderRadius: 2,
                              background: positive ? "#6E9F70" : v > 60 ? "#C08585" : "var(--mint-500)",
                            }}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ---- skin assessment ---- */}
            <section className="ar-section">
              <div className="ar-section-head">
                <h2>Skin assessment</h2>
                {skin.status === "ready" && skin.analysis.strengths[0] && (
                  <span className="ar-strength">
                    {skin.analysis.strengths[0]}
                  </span>
                )}
              </div>
              {skin.status === "ready" && skinFindings.length > 0 && (
                <table className="ar-table ar-skin-table">
                  <tbody>
                    {visibleFindings.map(({ f, origIdx }, i) => (
                      <tr key={`${f.id}_${origIdx}`}>
                        <td className="ar-skin-thumb">
                          {annotation?.crops[i] && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={annotation.crops[i].dataUrl} alt="" />
                          )}
                          <span className="ar-fig-num">{i + 1}</span>
                        </td>
                        <td className="ar-skin-name">
                          {SKIN_LABELS[f.id] ?? f.id}
                          <em>
                            {f.region.replace(/_/g, " ")} · {f.severity}
                          </em>
                        </td>
                        <td className="ar-skin-note">
                          <Editable
                            id={`skinnote_${origIdx}`}
                            text={txt(`skinnote_${origIdx}`, f.note)}
                            {...ed}
                          />
                          <RemoveBtn id={`skinrow_${origIdx}`} {...rm} />
                        </td>
                      </tr>
                    ))}
                    {extraObservations.map(
                      (id, i) =>
                        !removed.has(id) && (
                          <tr key={id}>
                            <td className="ar-skin-thumb" />
                            <td className="ar-skin-name">
                              <Editable
                                id={`${id}_name`}
                                text={txt(`${id}_name`, "New observation")}
                                {...ed}
                              />
                              <em>
                                <Editable
                                  id={`${id}_region`}
                                  text={txt(`${id}_region`, "region · severity")}
                                  {...ed}
                                />
                              </em>
                            </td>
                            <td className="ar-skin-note">
                              <Editable
                                id={`${id}_note`}
                                text={txt(
                                  `${id}_note`,
                                  "Clinical observation, in the doctor's words."
                                )}
                                {...ed}
                              />
                              <RemoveBtn id={id} {...rm} />
                            </td>
                          </tr>
                        )
                    )}
                  </tbody>
                </table>
              )}
              {editing && (
                <button
                  className="ar-add no-print"
                  onClick={() =>
                    setExtraObservations((x) => [
                      ...x,
                      `obs_${Date.now().toString(36)}`,
                    ])
                  }
                >
                  + Add observation
                </button>
              )}
              {skin.status === "ready" && skinFindings.length === 0 && (
                <p className="ar-body">
                  No notable skin findings on this photograph. Skin quality is
                  a clear strength.
                </p>
              )}
              {skin.status === "loading" && (
                <p className="ar-body ar-muted no-print">Analysing skin…</p>
              )}
              {(skin.status === "unavailable" || skin.status === "error") && (
                <p className="ar-body ar-muted">
                  <Editable id="skin_pending" text={txt("skin_pending", "Skin assessment to be completed with your clinician in person.")} {...ed} />
                </p>
              )}
            </section>

            {/* ---- treatment considerations ---- */}
            <section className="ar-section">
              <div className="ar-section-head">
                <h2>Treatment considerations</h2>
                <span className="ar-section-note">
                  options, not prescriptions · to be confirmed by your physician
                </span>
              </div>
              <ol className="ar-considerations">
                {visibleConsiderations.map((c, i) => (
                  <li key={c.id}>
                    <span className="ar-consider-num">{i + 1}</span>
                    <div>
                      <b>
                        <Editable
                          id={`ct_${c.id}`}
                          text={txt(`ct_${c.id}`, c.procedure)}
                          {...ed}
                        />
                      </b>
                      <Editable
                        id={`cb_${c.id}`}
                        text={txt(`cb_${c.id}`, c.deviation)}
                        className="ar-consider-body"
                        {...ed}
                      />
                      <Editable
                        id={`cd_${c.id}`}
                        text={txt(`cd_${c.id}`, c.dose)}
                        className="ar-consider-dose"
                        {...ed}
                      />
                    </div>
                    <RemoveBtn id={c.id} {...rm} />
                  </li>
                ))}
                {visibleConsiderations.length === 0 && (
                  <li>
                    <span className="ar-consider-num">1</span>
                    <div>
                      <b>
                        <Editable id="ct_none" text={txt("ct_none", "Maintain and protect")} {...ed} />
                      </b>
                      <Editable id="cb_none" text={txt("cb_none", "Proportions and skin already sit close to the classical standard; a yearly review is all we would suggest.")} className="ar-consider-body" {...ed} />
                    </div>
                  </li>
                )}
              </ol>
              {editing && (
                <button
                  className="ar-add no-print"
                  onClick={() =>
                    setExtraConsiderations((x) => [
                      ...x,
                      `extra_${Date.now().toString(36)}`,
                    ])
                  }
                >
                  + Add consideration
                </button>
              )}
            </section>

            {/* ---- sequence ---- */}
            <section className="ar-section">
              <div className="ar-section-head">
                <h2>Suggested sequence</h2>
              </div>
              <div className="ar-sequence">
                {seqBuckets.map((bucket) => (
                  <div key={bucket.key}>
                    <b>{bucket.title}</b>
                    {bucket.items.length > 0 ? (
                      bucket.items.map((c) => (
                        <span key={c.id} className="ar-seq-line">
                          <Editable
                            id={`seq_${bucket.key}_${c.id}`}
                            text={txt(
                              `seq_${bucket.key}_${c.id}`,
                              txt(`ct_${c.id}`, c.procedure)
                            )}
                            {...ed}
                          />
                        </span>
                      ))
                    ) : (
                      <span className="ar-seq-line">
                        <Editable
                          id={`seq_${bucket.key}_fallback`}
                          text={txt(`seq_${bucket.key}_fallback`, bucket.fallback)}
                          {...ed}
                        />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* ---- sign-off ---- */}
            <footer className="ar-signoff">
              <div className="ar-sign-lines">
                <div>
                  <span className="ar-sign-rule" />
                  <span>Reviewed by</span>
                </div>
                <div>
                  <span className="ar-sign-rule" />
                  <span>Date</span>
                </div>
                <div className="ar-cta-block">
                  <b>Book your consultation</b>
                  <span>
                    {clinicName}
                    {clinicLine ? ` · ${clinicLine}` : ""}
                  </span>
                </div>
              </div>
              <p className="ar-smallprint">
                Prepared with CAPTURE Clinic OS from a single photograph. This
                document is an aesthetic guide, not a medical diagnosis or a
                treatment plan; every observation is qualitative and must be
                confirmed by a physician in person. Suggestions reference this
                clinic's treatment menu only. Individual results vary. Not
                intended for persons under 18.
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
