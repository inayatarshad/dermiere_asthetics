"use client";

/**
 * The consultation workspace - the spine of the product
 * (00_README.md §3): Brief → Canvas → Visualize → Plan → Report.
 * The brief arms the canvas and AI presets; the canvas hands off to the
 * visualization; the plan flows into the report.
 */

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ClipboardList,
  FileText,
  ScanFace,
  Sparkles,
  MessageSquareText,
  Check,
  Lock,
  ChevronLeft,
} from "lucide-react";
import { useStore, useSessionUser, can } from "@/lib/store";
import { formatDateTime } from "@/lib/format";
import { getTemplate } from "@/lib/templates";
import { GlassCard, EmptyState, StatusChip, Spinner } from "@/components/ui";
import { PatientAvatar } from "@/components/PatientAvatar";
import { BriefStep } from "@/components/consult/BriefStep";
import { CanvasStep } from "@/components/consult/CanvasStep";
import { VisualizeStep } from "@/components/consult/VisualizeStep";
import { PlanStep } from "@/components/consult/PlanStep";
import { ReportStep } from "@/components/consult/ReportStep";

const STEPS = [
  { id: "brief", label: "Brief", icon: MessageSquareText },
  { id: "canvas", label: "3D Canvas", icon: ScanFace },
  { id: "visualize", label: "AI Visualize", icon: Sparkles },
  { id: "plan", label: "Plan", icon: ClipboardList },
  { id: "report", label: "Report", icon: FileText },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

function ConsultationInner() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const user = useSessionUser();

  const consultation = useStore((s) =>
    s.consultations.find((c) => c.id === id)
  );
  const patient = useStore((s) =>
    s.patients.find((p) => p.id === consultation?.patient_id)
  );
  const setConsultationStatus = useStore((s) => s.setConsultationStatus);

  const initialStep = (searchParams.get("step") as StepId) || "brief";
  const [step, setStep] = useState<StepId>(
    STEPS.some((s) => s.id === initialStep) ? initialStep : "brief"
  );

  // Doctors land on the brief; once it's filled, jump to the canvas.
  useEffect(() => {
    if (
      !searchParams.get("step") &&
      consultation?.brief.primary_interest &&
      step === "brief"
    ) {
      // keep brief as landing but do not force-jump; the stepper shows state
    }
  }, [consultation, searchParams, step]);

  if (!consultation || !patient) {
    return (
      <EmptyState
        title="Consultation not found"
        action={
          <Link href="/dashboard" className="btn btn-secondary btn-sm">
            Back to dashboard
          </Link>
        }
      />
    );
  }

  const isDoctor = can.runConsultation(user?.role);
  const template = getTemplate(consultation.brief.primary_interest);

  if (!isDoctor) {
    // Front desk prepares, doctor decides - clinical tools stay doctor-only.
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <GlassCard strong className="p-8 text-center fade-up">
          <span className="mx-auto w-12 h-12 rounded-2xl bg-mint-100 text-mint-500 flex items-center justify-center">
            <Lock size={22} />
          </span>
          <h1 className="h1 text-ink-900 mt-4">Doctor-only workspace</h1>
          <p className="text-ink-700 mt-2 leading-relaxed">
            The consultation tools (3D canvas, AI visualization, treatment
            plan) are restricted to clinicians. You can view the patient
            profile or open the report once the doctor completes the
            consultation.
          </p>
          <div className="flex justify-center gap-2 mt-6">
            <Link href={`/patients/${patient.id}`} className="btn btn-secondary">
              Patient profile
            </Link>
            <Link href={`/report/${consultation.id}`} className="btn btn-primary">
              <FileText size={16} />
              View report
            </Link>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Patient strip + stepper */}
      <GlassCard strong className="px-5 py-3.5 fade-up">
        <div className="flex items-center gap-4 flex-wrap">
          <button
            className="btn btn-ghost btn-sm -ml-2"
            onClick={() => router.push(`/patients/${patient.id}`)}
          >
            <ChevronLeft size={16} />
          </button>
          <PatientAvatar patient={patient} size="sm" />
          <div className="min-w-0">
            <div className="font-medium text-ink-900 leading-tight">
              {patient.name}
            </div>
            <div className="caption">
              {patient.age ? `${patient.age} · ` : ""}
              {patient.city} · started {formatDateTime(consultation.date)}
            </div>
          </div>
          {template && (
            <span className="chip chip-static text-xs">{template.name}</span>
          )}
          <StatusChip status={consultation.status} />

          <div className="flex-1" />

          <nav className="flex gap-1 flex-wrap" aria-label="Consultation steps">
            {STEPS.map(({ id: sid, label, icon: Icon }, i) => {
              const active = step === sid;
              return (
                <button
                  key={sid}
                  onClick={() => setStep(sid)}
                  className={`step-tab inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-all ${
                    active
                      ? "bg-mint-500 text-white shadow-md"
                      : "text-ink-700 hover:bg-mint-100"
                  }`}
                >
                  <Icon size={14} />
                  <span className="hidden md:inline">{label}</span>
                  <span className="md:hidden">{i + 1}</span>
                </button>
              );
            })}
          </nav>

          {consultation.status === "open" ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setConsultationStatus(consultation.id, "completed")}
            >
              <Check size={14} />
              Complete
            </button>
          ) : (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setConsultationStatus(consultation.id, "open")}
            >
              Reopen
            </button>
          )}
        </div>
      </GlassCard>

      {step === "brief" && (
        <BriefStep
          consultation={consultation}
          onContinue={() => setStep("canvas")}
        />
      )}
      {step === "canvas" && (
        <CanvasStep
          consultation={consultation}
          patient={patient}
          onGeneratePreview={() => setStep("visualize")}
        />
      )}
      {step === "visualize" && (
        <VisualizeStep
          consultation={consultation}
          patient={patient}
          onPlan={() => setStep("plan")}
        />
      )}
      {step === "plan" && (
        <PlanStep consultation={consultation} onReport={() => setStep("report")} />
      )}
      {step === "report" && (
        <ReportStep consultation={consultation} patient={patient} />
      )}
    </div>
  );
}

export default function ConsultationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center">
          <Spinner className="w-8 h-8" />
        </div>
      }
    >
      <ConsultationInner />
    </Suspense>
  );
}
