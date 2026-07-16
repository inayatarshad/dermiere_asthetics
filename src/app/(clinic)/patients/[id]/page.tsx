"use client";

/**
 * Patient profile (02_patient-profile.md): the durable record everything
 * hangs off. Header card, tabs (Overview · Photos & Timeline ·
 * Consultations · Plan · Consent), and the visual timeline that pairs
 * consultation photos with AI-predicted afters and follow-up captures.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Camera,
  FileText,
  Play,
  ShieldCheck,
  Images,
  ClipboardList,
  Stethoscope,
  User as UserIcon,
  Phone,
  MapPin,
  Globe,
  AlertCircle,
  Send,
  Trash2,
  Check,
  RefreshCcw,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useStore, useSessionUser, can, usePatientConsents } from "@/lib/store";
import { pushPatientToBooth, deleteBoothServerCopy } from "@/lib/booth";
import { formatDate, formatDateTime, relativeDay, SOURCE_LABELS } from "@/lib/format";
import { getTemplate } from "@/lib/templates";
import { CONSENT_COPY, type Asset, type ConsentType } from "@/lib/types";
import { useAssetUrl } from "@/lib/hooks";
import { GlassCard, EmptyState, StatusChip, Toggle, Chip, Modal, Spinner } from "@/components/ui";
import { PatientAvatar } from "@/components/PatientAvatar";
import { CameraCapture } from "@/components/CameraCapture";
import { MarkVuPanel } from "@/components/MarkVuPanel";

const TABS = [
  { id: "overview", label: "Overview", icon: UserIcon },
  { id: "timeline", label: "Photos & Timeline", icon: Images },
  { id: "consultations", label: "Consultations", icon: Stethoscope },
  { id: "plan", label: "Plan", icon: ClipboardList },
  { id: "consent", label: "Consent", icon: ShieldCheck },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function PatientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useSessionUser();

  const patient = useStore((s) => s.patients.find((p) => p.id === id));
  const consultations = useStore(
    useShallow((s) =>
      s.consultations
        .filter((c) => c.patient_id === id)
        .sort((a, b) => b.date.localeCompare(a.date))
    )
  );
  const assets = useStore(
    useShallow((s) => s.assets.filter((a) => a.patient_id === id))
  );
  const plans = useStore((s) => s.plans);
  const planItems = useStore((s) => s.planItems);
  const users = useStore((s) => s.users);
  const consents = usePatientConsents(id);
  const createConsultation = useStore((s) => s.createConsultation);
  const setConsent = useStore((s) => s.setConsent);
  const addAsset = useStore((s) => s.addAsset);
  const boothSync = useStore((s) => s.boothSync[id]);
  const clearNewArrival = useStore((s) => s.clearNewArrival);
  const deletePatientAction = useStore((s) => s.deletePatient);

  const [tab, setTab] = useState<TabId>("overview");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // opening the profile clears the booth "NEW" badge
  useEffect(() => {
    clearNewArrival(id);
  }, [id, clearNewArrival]);

  const latestConsult = consultations[0];
  const openConsult = consultations.find((c) => c.status === "open");
  const template = getTemplate(latestConsult?.brief.primary_interest);
  const patientPlans = plans.filter((p) =>
    consultations.some((c) => c.id === p.consultation_id)
  );

  const photographyConsent = consents.find(
    (c) => c.type === "photography" && c.granted
  );

  const visitGroups = useMemo(() => {
    const groups = new Map<string, Asset[]>();
    for (const a of assets) {
      if (a.kind === "report_pdf") continue;
      const list = groups.get(a.visit_date) ?? [];
      list.push(a);
      groups.set(a.visit_date, list);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [assets]);

  if (!patient) {
    return (
      <EmptyState
        title="Patient not found"
        body="This record does not exist in the current clinic."
        action={
          <Link href="/patients" className="btn btn-secondary btn-sm">
            Back to patients
          </Link>
        }
      />
    );
  }

  const startConsultation = () => {
    if (!user || !can.runConsultation(user.role)) return;
    if (openConsult) {
      router.push(`/consultations/${openConsult.id}`);
      return;
    }
    const c = createConsultation(patient.id, user.id);
    router.push(`/consultations/${c.id}`);
  };

  return (
    <div className="space-y-5">
      {/* Header card */}
      <GlassCard strong className="p-6 fade-up">
        {/* identity row: full width so the name and meta stay on ONE line
            each; actions live on their own row below, never squeezing this */}
        <div className="flex items-center gap-5 min-w-0">
          <PatientAvatar patient={patient} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-x-3 gap-y-0.5 flex-wrap">
              <h1 className="h1 text-ink-900 whitespace-nowrap">
                {patient.name}
              </h1>
              <span className="caption flex items-center gap-3 flex-wrap">
                {patient.age && <span>{patient.age} years</span>}
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} /> {patient.city}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Phone size={12} /> {patient.phone}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Globe size={12} />{" "}
                  {patient.language[0].toUpperCase() + patient.language.slice(1)}
                </span>
              </span>
            </div>
            <div className="mt-2 flex gap-1.5 flex-wrap">
              {template && (
                <span className="chip chip-static text-xs">
                  {template.name}
                  {latestConsult?.status === "open" ? ": planning" : ""}
                </span>
              )}
              {consultations.length > 1 && (
                <span className="chip chip-static text-xs">Returning</span>
              )}
              <span className="chip chip-static text-xs">
                {SOURCE_LABELS[patient.source]}
              </span>
              {consents.find((c) => c.type === "marketing" && c.granted) && (
                <span className="chip chip-static text-xs">
                  Marketing consent
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap mt-5 pt-4 border-t border-white/60">
            {can.runConsultation(user?.role) && (
              <button className="btn btn-primary" onClick={startConsultation}>
                <Play size={16} />
                {openConsult ? "Resume consultation" : "Start consultation"}
              </button>
            )}
            <button
              className="btn btn-secondary"
              onClick={() => router.push(`/assessment/${patient.id}`)}
              disabled={!photographyConsent}
              title={
                photographyConsent
                  ? "One front photo, one branded assessment page - the free lead magnet"
                  : "Photography consent required"
              }
            >
              <ScanSearch size={16} />
              Assessment Report
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => router.push(`/visualize/${patient.id}`)}
              disabled={!photographyConsent}
              title={
                photographyConsent
                  ? "Red-light glow and body contour before/after previews"
                  : "Photography consent required"
              }
            >
              <Sparkles size={16} />
              Visualization Studio
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setCaptureOpen(true)}
              disabled={!photographyConsent}
              title={
                photographyConsent
                  ? "Capture today's photos"
                  : "Photography consent required"
              }
            >
              <Camera size={16} />
              Add photos
            </button>
            {latestConsult && (
              <Link
                href={`/report/${latestConsult.id}`}
                className="btn btn-secondary"
              >
                <FileText size={16} />
                Report
              </Link>
            )}
            <button
              className="btn btn-secondary"
              onClick={() => void pushPatientToBooth(patient.id, { manual: true })}
              disabled={boothSync?.status === "sending"}
              title="Send this record and photos to the booth screen"
            >
              {boothSync?.status === "sending" ? (
                <Spinner className="w-4 h-4" />
              ) : boothSync?.status === "sent" ? (
                <Check size={16} className="text-mint-500" />
              ) : boothSync?.status === "error" ? (
                <RefreshCcw size={16} />
              ) : (
                <Send size={16} />
              )}
              {boothSync?.status === "sent"
                ? "On booth screen"
                : boothSync?.status === "sending"
                  ? "Sending..."
                  : boothSync?.status === "error"
                    ? "Retry send"
                    : "Send to booth screen"}
            </button>
            <button
              className="btn btn-danger"
              onClick={() => setDeleteOpen(true)}
              title="Delete this patient and their photos"
              aria-label="Delete patient"
            >
              <Trash2 size={16} />
            </button>
        </div>
        {boothSync?.status === "error" && boothSync.error && (
          <p
            className={`caption mt-3 ${
              boothSync.code === "not_configured" ? "" : "text-warning"
            }`}
          >
            {boothSync.error}
          </p>
        )}
      </GlassCard>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap fade-up-1">
        {TABS.map(({ id: t, label, icon: Icon }) => (
          <Chip key={t} active={tab === t} onClick={() => setTab(t)}>
            <Icon size={14} />
            {label}
          </Chip>
        ))}
      </div>

      {/* ------------------------------ Overview ----------------------- */}
      {tab === "overview" && (
        <div className="grid lg:grid-cols-2 gap-4 fade-up">
          <GlassCard className="p-6">
            <h3 className="h2 text-ink-900 mb-4">Details</h3>
            <dl className="space-y-2.5 text-sm">
              <Row k="Phone" v={patient.phone} />
              <Row k="Email" v={patient.email ?? "Not provided"} />
              <Row k="City" v={patient.city} />
              <Row
                k="Language"
                v={patient.language[0].toUpperCase() + patient.language.slice(1)}
              />
              <Row k="Source" v={SOURCE_LABELS[patient.source]} />
              <Row k="Registered" v={formatDate(patient.created_at)} />
            </dl>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="h2 text-ink-900 mb-4">Clinical background</h3>
            <dl className="space-y-2.5 text-sm">
              <Row
                k="Allergies"
                v={patient.clinical_flags.allergies ?? "None recorded"}
              />
              <Row
                k="Fitzpatrick type"
                v={
                  patient.clinical_flags.fitzpatrick
                    ? `Type ${toRoman(patient.clinical_flags.fitzpatrick)}`
                    : "Not assessed"
                }
              />
              <Row
                k="Prior treatments"
                v={patient.clinical_flags.prior_treatments ?? "None recorded"}
              />
              <Row
                k="Flags"
                v={
                  [
                    patient.clinical_flags.blood_thinners && "Blood thinners",
                    patient.clinical_flags.prior_surgery && "Prior surgery",
                    patient.clinical_flags.keloid_tendency && "Keloid tendency",
                    patient.clinical_flags.pregnancy_breastfeeding &&
                      "Pregnancy / breastfeeding",
                  ]
                    .filter(Boolean)
                    .join(", ") || "None"
                }
              />
              {patient.clinical_flags.notes && (
                <Row k="Notes" v={patient.clinical_flags.notes} />
              )}
            </dl>
          </GlassCard>

          {/* MARK-VU intake scanner integration (§5.6) */}
          <MarkVuPanel patientId={patient.id} />

          {latestConsult && (
            <GlassCard className="p-6 lg:col-span-2">
              <div className="flex items-center justify-between mb-3">
                <h3 className="h2 text-ink-900">Latest consultation</h3>
                <StatusChip status={latestConsult.status} />
              </div>
              {latestConsult.brief.goal_text && (
                <blockquote className="text-ink-700 border-l-2 border-mint-400 pl-4 italic">
                  "{latestConsult.brief.goal_text}"
                </blockquote>
              )}
              <div className="caption mt-3">
                {formatDateTime(latestConsult.date)} ·{" "}
                {users.find((u) => u.id === latestConsult.doctor_id)?.name}
                {template ? ` · ${template.name}` : ""}
              </div>
              {can.runConsultation(user?.role) && (
                <button
                  className="btn btn-secondary btn-sm mt-4"
                  onClick={() =>
                    router.push(`/consultations/${latestConsult.id}`)
                  }
                >
                  Open consultation
                </button>
              )}
            </GlassCard>
          )}
        </div>
      )}

      {/* ------------------------------ Timeline ------------------------ */}
      {tab === "timeline" && (
        <div className="space-y-5 fade-up">
          {visitGroups.length === 0 ? (
            <EmptyState
              icon={<Images size={28} />}
              title="No photos yet"
              body="Capture the three consultation photos to begin this patient's visual timeline."
              action={
                photographyConsent ? (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setCaptureOpen(true)}
                  >
                    <Camera size={14} />
                    Capture photos
                  </button>
                ) : (
                  <span className="caption">
                    Photography consent required first (Consent tab).
                  </span>
                )
              }
            />
          ) : (
            visitGroups.map(([visitDate, groupAssets], gi) => (
              <div key={visitDate} className="flex gap-4">
                {/* timeline rail */}
                <div className="flex flex-col items-center pt-1.5">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      gi === 0 ? "bg-mint-500" : "bg-mint-200"
                    }`}
                  />
                  {gi < visitGroups.length - 1 && (
                    <span className="w-px flex-1 bg-mint-200 mt-1" />
                  )}
                </div>
                <div className="flex-1 pb-2">
                  <div className="flex items-baseline gap-2 mb-2.5">
                    <span className="font-medium text-ink-900">
                      {relativeDay(visitDate)}
                    </span>
                    <span className="caption">{formatDate(visitDate)}</span>
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    {groupAssets.map((a) => (
                      <AssetThumb key={a.id} asset={a} />
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* --------------------------- Consultations ---------------------- */}
      {tab === "consultations" && (
        <div className="space-y-2.5 fade-up">
          {consultations.length === 0 ? (
            <EmptyState
              icon={<Stethoscope size={28} />}
              title="No consultations yet"
              body="Start a consultation to open the brief, canvas and AI visualization."
              action={
                can.runConsultation(user?.role) ? (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={startConsultation}
                  >
                    Start consultation
                  </button>
                ) : undefined
              }
            />
          ) : (
            consultations.map((c) => {
              const t = getTemplate(c.brief.primary_interest);
              const doctor = users.find((u) => u.id === c.doctor_id);
              return (
                <GlassCard key={c.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-ink-900">
                        {t?.name ?? "General consultation"}
                      </span>
                      <StatusChip status={c.status} />
                    </div>
                    <div className="caption mt-0.5">
                      {formatDateTime(c.date)} · {doctor?.name}
                      {c.brief.goal_text ? ` · "${c.brief.goal_text}"` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {can.runConsultation(user?.role) && (
                      <Link
                        href={`/consultations/${c.id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        {c.status === "open" ? "Resume" : "Review"}
                      </Link>
                    )}
                    <Link href={`/report/${c.id}`} className="btn btn-ghost btn-sm">
                      <FileText size={14} />
                      Report
                    </Link>
                  </div>
                </GlassCard>
              );
            })
          )}
        </div>
      )}

      {/* ------------------------------- Plan ---------------------------- */}
      {tab === "plan" && (
        <div className="space-y-4 fade-up">
          {patientPlans.length === 0 ? (
            <EmptyState
              icon={<ClipboardList size={28} />}
              title="No treatment plan yet"
              body="Plans are created inside a consultation once a treatment is agreed."
            />
          ) : (
            patientPlans.map((plan) => {
              const items = planItems
                .filter((i) => i.plan_id === plan.id)
                .sort((a, b) => a.order - b.order);
              const doneCount = items.filter((i) => i.done).length;
              const t = getTemplate(plan.template_id);
              return (
                <GlassCard key={plan.id} className="p-6">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="font-medium text-ink-900">
                        {t?.name ?? "Custom plan"}
                      </div>
                      <div className="caption mt-0.5">
                        Created {formatDate(plan.created_at)} · {doneCount} of{" "}
                        {items.length} items complete
                      </div>
                    </div>
                    <StatusChip status={plan.status} />
                  </div>
                  {/* progress */}
                  <div className="mt-4 h-2 rounded-full bg-mint-100 overflow-hidden">
                    <div
                      className="h-full bg-mint-500 rounded-full transition-all"
                      style={{
                        width: `${items.length ? (doneCount / items.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  {plan.summary && (
                    <p className="text-sm text-ink-700 mt-4 leading-relaxed">
                      {plan.summary}
                    </p>
                  )}
                  {can.runConsultation(user?.role) && (
                    <Link
                      href={`/consultations/${plan.consultation_id}?step=plan`}
                      className="btn btn-secondary btn-sm mt-4"
                    >
                      Open full plan
                    </Link>
                  )}
                </GlassCard>
              );
            })
          )}
        </div>
      )}

      {/* ------------------------------ Consent -------------------------- */}
      {tab === "consent" && (
        <div className="space-y-3 fade-up max-w-2xl">
          {(Object.keys(CONSENT_COPY) as ConsentType[]).map((type) => {
            const record = consents.find((c) => c.type === type);
            const granted = record?.granted ?? false;
            const capturedBy = users.find((u) => u.id === record?.captured_by);
            return (
              <GlassCard key={type} className="flex items-start gap-4 p-5">
                <div className="flex-1">
                  <div className="text-sm font-medium text-ink-900">
                    {CONSENT_COPY[type].title}
                  </div>
                  <p className="caption mt-1 leading-relaxed">
                    {CONSENT_COPY[type].body}
                  </p>
                  {record && (
                    <p className="caption mt-2">
                      {granted ? "Granted" : "Declined"}{" "}
                      {formatDateTime(record.granted_at)}
                      {capturedBy ? ` · captured by ${capturedBy.name}` : ""} ·
                      wording {record.text_version}
                    </p>
                  )}
                </div>
                <Toggle
                  checked={granted}
                  onChange={(v) => user && setConsent(patient.id, type, v, user.id)}
                  label={CONSENT_COPY[type].title}
                />
              </GlassCard>
            );
          })}
          <p className="caption flex items-start gap-1.5 px-1">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            Marketing use of any image is gated on the marketing consent flag
            in code, not policy alone. Changes are recorded as new consent
            entries.
          </p>
        </div>
      )}

      <CameraCapture
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        title={`Add photos: ${patient.name}`}
        requiredKinds={[]}
        onComplete={(photos) => {
          for (const photo of photos) {
            addAsset({
              patient_id: patient.id,
              kind: photo.kind,
              storage_url: photo.storageUrl,
              consultation_id: openConsult?.id,
            });
          }
          setCaptureOpen(false);
          setTab("timeline");
        }}
      />

      {/* Delete patient + photos (T1 privacy path) */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={`Delete ${patient.name}?`}
      >
        <p className="text-sm text-ink-700 leading-relaxed">
          This permanently removes the patient record, consents, photos,
          consultations, visualizations and plans from this device
          {patient.booth_id || boothSync?.boothId
            ? ", and deletes the copies from the booth server"
            : ""}
          . This cannot be undone.
        </p>
        <div className="flex gap-2 justify-end mt-6">
          <button className="btn btn-ghost" onClick={() => setDeleteOpen(false)}>
            Cancel
          </button>
          <button
            className="btn btn-danger"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              const boothId = patient.booth_id ?? boothSync?.boothId;
              if (boothId) await deleteBoothServerCopy(boothId);
              deletePatientAction(patient.id);
              router.replace("/patients");
            }}
          >
            {deleting ? <Spinner className="w-4 h-4" /> : <Trash2 size={15} />}
            Delete everywhere
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-36 shrink-0 text-ink-400">{k}</dt>
      <dd className="text-ink-900">{v}</dd>
    </div>
  );
}

function toRoman(n: number): string {
  return ["I", "II", "III", "IV", "V", "VI"][n - 1] ?? String(n);
}

const KIND_LABELS: Record<string, string> = {
  photo_front: "Front",
  photo_left: "Tilted left",
  photo_right: "Tilted right",
  photo_closeup: "Close-up",
  ai_after: "AI visualization",
  assessment: "Assessment report",
};

function AssetThumb({ asset }: { asset: Asset }) {
  const url = useAssetUrl(asset);
  return (
    <figure className="w-36">
      <div
        className={`relative rounded-2xl overflow-hidden border shadow-md ${
          asset.kind === "ai_after"
            ? "border-mint-400 ring-2 ring-mint-200"
            : "border-white/70"
        }`}
        style={{ aspectRatio: "3/3.4", background: "var(--mint-100)" }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={KIND_LABELS[asset.kind]} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 shimmer" />
        )}
      </div>
      <figcaption className="caption mt-1.5 text-center">
        {KIND_LABELS[asset.kind] ?? asset.kind}
        {asset.meta?.model === "simulation" && " (preview)"}
      </figcaption>
    </figure>
  );
}
