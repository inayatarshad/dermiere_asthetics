"use client";

/**
 * Patient registration - the front desk flow
 * (01_registration-and-access.md §3): search first, core details, consent
 * before any photo, then the three consultation photos, then the queue.
 * One progressive screen, minimal typing, under 90 seconds.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, ChevronRight, ShieldCheck, UserPlus } from "lucide-react";
import { useStore, useSessionUser } from "@/lib/store";
import { queueBoothPush } from "@/lib/booth";
import { CONSENT_COPY, CONSENT_TEXT_VERSION, type ConsentType, type PatientSource } from "@/lib/types";
import { CameraCapture, type CapturedPhoto } from "@/components/CameraCapture";
import { GlassCard, Field, Toggle } from "@/components/ui";
import { PatientAvatar } from "@/components/PatientAvatar";

const SOURCES: { id: PatientSource; label: string }[] = [
  { id: "walk_in", label: "Walk-in" },
  { id: "vibro", label: "Vibro call" },
  { id: "referral", label: "Referral" },
  { id: "social", label: "Social" },
  { id: "tourism", label: "Medical tourism" },
];

export default function RegisterPatientPage() {
  const router = useRouter();
  const user = useSessionUser();
  const patients = useStore((s) => s.patients);
  const registerPatient = useStore((s) => s.registerPatient);
  const setConsent = useStore((s) => s.setConsent);
  const addAsset = useStore((s) => s.addAsset);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<"female" | "male" | "other">("female");
  const [city, setCity] = useState("Islamabad");
  const [language, setLanguage] = useState<"urdu" | "english" | "other">("urdu");
  const [source, setSource] = useState<PatientSource>("walk_in");
  const [email, setEmail] = useState("");
  const [allergies, setAllergies] = useState("");

  const [consents, setConsents] = useState<Record<ConsentType, boolean>>({
    treatment: false,
    photography: false,
    marketing: false,
  });

  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search-first: typing a phone number surfaces existing records
  const phoneDigits = phone.replace(/\D/g, "");
  const matches = useMemo(() => {
    if (phoneDigits.length < 4) return [];
    return patients
      .filter((p) => p.phone.replace(/\D/g, "").includes(phoneDigits))
      .slice(0, 3);
  }, [patients, phoneDigits]);

  const detailsComplete = name.trim().length >= 2 && phoneDigits.length >= 7;
  const consentComplete = consents.treatment && consents.photography;

  const submit = () => {
    setError(null);
    if (!detailsComplete) {
      setError("Name and a valid phone number are required.");
      return;
    }
    if (!consents.treatment) {
      setError("Consultation consent is required to register.");
      return;
    }
    if (photos.length > 0 && !consents.photography) {
      setError("Photography consent is required before storing photos.");
      return;
    }
    if (!user) return;

    const patient = registerPatient({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      age: age ? parseInt(age, 10) : undefined,
      gender,
      city: city.trim() || "Islamabad",
      branch_id: user.branch_id,
      language,
      source,
      clinical_flags: { allergies: allergies.trim() || undefined },
    });

    (Object.keys(consents) as ConsentType[]).forEach((type) => {
      setConsent(patient.id, type, consents[type], user.id);
    });

    for (const photo of photos) {
      addAsset({
        patient_id: patient.id,
        kind: photo.kind,
        storage_url: photo.storageUrl,
      });
    }

    // Booth handoff: fire the push now; the background agent retries if
    // the venue wifi drops (visible pending state on the profile)
    queueBoothPush(patient.id);

    router.push(`/patients/${patient.id}?registered=1`);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="fade-up">
        <h1 className="h1 text-ink-900">Register patient</h1>
        <p className="caption mt-0.5">
          Details, consent, photos. The patient joins today&rsquo;s queue when saved.
        </p>
      </div>

      {/* Step 1 - details */}
      <GlassCard className="p-6 fade-up-1">
        <StepHeader n={1} title="Core details" done={detailsComplete} />
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Field label="Phone (lookup key)" className="sm:col-span-2">
            <input
              className="input"
              inputMode="tel"
              placeholder="03xx xxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
          </Field>

          {matches.length > 0 && (
            <div className="sm:col-span-2 rounded-xl bg-mint-100/80 border border-mint-200 p-3">
              <div className="text-xs font-medium text-ink-700 mb-2">
                Possible existing records. Avoid duplicates:
              </div>
              <div className="space-y-1.5">
                {matches.map((m) => (
                  <Link
                    key={m.id}
                    href={`/patients/${m.id}`}
                    className="flex items-center gap-2.5 rounded-lg bg-white/70 px-3 py-2 hover:bg-white transition-colors"
                  >
                    <PatientAvatar patient={m} size="sm" />
                    <span className="text-sm font-medium text-ink-900">
                      {m.name}
                    </span>
                    <span className="caption">{m.phone}</span>
                    <ChevronRight size={14} className="ml-auto text-ink-400" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          <Field label="Full name">
            <input
              className="input"
              placeholder="Patient's full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Age">
            <input
              className="input"
              inputMode="numeric"
              placeholder="e.g. 27"
              value={age}
              onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <Field label="Gender">
            <select
              className="input"
              value={gender}
              onChange={(e) => setGender(e.target.value as typeof gender)}
            >
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="City">
            <input
              className="input"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </Field>
          <Field label="Preferred language">
            <select
              className="input"
              value={language}
              onChange={(e) => setLanguage(e.target.value as typeof language)}
            >
              <option value="urdu">Urdu</option>
              <option value="english">English</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="How they found us" hint="Attribution feeds the marketing loop">
            <select
              className="input"
              value={source}
              onChange={(e) => setSource(e.target.value as PatientSource)}
            >
              {SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Email (optional)">
            <input
              className="input"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Allergies / key flags (optional)">
            <input
              className="input"
              placeholder="e.g. Penicillin"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
            />
          </Field>
        </div>
      </GlassCard>

      {/* Step 2 - consent */}
      <GlassCard className="p-6 fade-up-2">
        <StepHeader
          n={2}
          title="Consent"
          done={consentComplete}
          icon={<ShieldCheck size={15} />}
        />
        <p className="caption mt-1">
          Recorded with timestamp, staff member and wording version{" "}
          {CONSENT_TEXT_VERSION}. Photography consent is mandatory before any
          photo is taken.
        </p>
        <div className="mt-4 space-y-3">
          {(Object.keys(CONSENT_COPY) as ConsentType[]).map((type) => (
            <div
              key={type}
              className="glass-subtle flex items-start gap-4 p-4"
            >
              <div className="flex-1">
                <div className="text-sm font-medium text-ink-900">
                  {CONSENT_COPY[type].title}
                  {type !== "marketing" && (
                    <span className="text-danger"> *</span>
                  )}
                </div>
                <p className="caption mt-1 leading-relaxed">
                  {CONSENT_COPY[type].body}
                </p>
              </div>
              <Toggle
                checked={consents[type]}
                onChange={(v) => setConsents((c) => ({ ...c, [type]: v }))}
                label={CONSENT_COPY[type].title}
              />
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Step 3 - photos */}
      <GlassCard className="p-6 fade-up-3">
        <StepHeader n={3} title="Consultation photos" done={photos.length > 0} />
        <p className="caption mt-1">
          Front, tilted-right, tilted-left. The front photo powers the 3D
          canvas and the AI visualization.
        </p>
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button
            className="btn btn-secondary"
            disabled={!consents.photography}
            onClick={() => setCaptureOpen(true)}
            title={
              consents.photography
                ? undefined
                : "Photography consent required first"
            }
          >
            <Camera size={16} />
            {photos.length > 0 ? "Recapture photos" : "Capture photos"}
          </button>
          {photos.length > 0 && (
            <span className="chip chip-static">
              <Check size={13} className="text-mint-500" />
              {photos.length} photo{photos.length === 1 ? "" : "s"} ready
            </span>
          )}
          {!consents.photography && (
            <span className="caption">
              Enable photography consent to unlock capture.
            </span>
          )}
        </div>
      </GlassCard>

      {error && (
        <p className="text-sm text-danger fade-up px-1" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 fade-up-4 pb-8">
        <Link href="/patients" className="btn btn-ghost">
          Cancel
        </Link>
        <button
          className="btn btn-primary btn-lg"
          onClick={submit}
          disabled={!detailsComplete || !consents.treatment}
        >
          <UserPlus size={17} />
          Register & add to queue
        </button>
      </div>

      <CameraCapture
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onComplete={(p) => {
          setPhotos(p);
          setCaptureOpen(false);
        }}
        requiredKinds={["photo_front"]}
      />
    </div>
  );
}

function StepHeader({
  n,
  title,
  done,
  icon,
}: {
  n: number;
  title: string;
  done: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
          done ? "bg-mint-500 text-white" : "bg-mint-100 text-ink-700"
        }`}
      >
        {done ? <Check size={14} /> : n}
      </span>
      <h2 className="h2 text-ink-900 flex items-center gap-2">
        {title}
        {icon}
      </h2>
    </div>
  );
}
