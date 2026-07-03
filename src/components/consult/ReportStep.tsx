"use client";

/**
 * Report step inside the consultation: live preview of the exportable
 * report, assembled instantly from data already captured.
 */

import { useRouter } from "next/navigation";
import { FileText, Printer } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Consultation, Patient } from "@/lib/types";
import { GlassCard } from "@/components/ui";
import { ReportView } from "@/components/report/ReportView";

export function ReportStep({
  consultation,
  patient,
}: {
  consultation: Consultation;
  patient: Patient;
}) {
  const router = useRouter();
  const ensureReport = useStore((s) => s.ensureReport);

  const openFull = () => {
    ensureReport(consultation.id);
    router.push(`/report/${consultation.id}`);
  };

  return (
    <div className="space-y-4 fade-up">
      <GlassCard strong className="px-6 py-5 flex items-center gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 className="h2 text-ink-900">
            {patient.name.split(" ")[0]}'s report is ready
          </h2>
          <p className="caption mt-0.5">
            Assembled live from the brief, visualization and plan. Open the
            full view to print or save as PDF.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={openFull}>
            <FileText size={16} />
            Open full report
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              ensureReport(consultation.id);
              router.push(`/report/${consultation.id}?print=1`);
            }}
          >
            <Printer size={16} />
            Print / PDF
          </button>
        </div>
      </GlassCard>

      {/* Scaled live preview */}
      <div className="overflow-x-auto pb-4">
        <div className="mx-auto" style={{ width: "fit-content" }}>
          <div
            style={{
              transform: "scale(0.72)",
              transformOrigin: "top center",
              marginBottom: "-26%",
            }}
          >
            <ReportView consultationId={consultation.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
