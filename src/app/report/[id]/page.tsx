"use client";

/**
 * Full-screen report route — the printable surface. "Download PDF" uses the
 * browser's print-to-PDF: the sheets are pre-composed for pixel-identical
 * output (07_report-export.md §4).
 */

import { Suspense, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Printer } from "lucide-react";
import { useStore, useSessionUser } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { ReportView } from "@/components/report/ReportView";
import { Spinner } from "@/components/ui";

function ReportPageInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mounted = useMounted();
  const user = useSessionUser();
  const seeded = useStore((s) => s.seeded);
  const seedIfNeeded = useStore((s) => s.seedIfNeeded);
  const ensureReport = useStore((s) => s.ensureReport);
  const consultation = useStore((s) => s.consultations.find((c) => c.id === id));

  useEffect(() => {
    seedIfNeeded();
  }, [seedIfNeeded]);

  useEffect(() => {
    if (mounted && seeded && !user) router.replace("/");
  }, [mounted, seeded, user, router]);

  useEffect(() => {
    if (mounted && consultation) ensureReport(consultation.id);
  }, [mounted, consultation, ensureReport]);

  // auto-open print dialog when arriving via "Print / PDF"
  useEffect(() => {
    if (mounted && seeded && user && searchParams.get("print") === "1") {
      const t = setTimeout(() => window.print(), 900);
      return () => clearTimeout(t);
    }
  }, [mounted, seeded, user, searchParams]);

  if (!mounted || !seeded || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4">
      {/* floating toolbar */}
      <div className="no-print fixed top-4 left-1/2 -translate-x-1/2 z-50">
        <div className="glass-strong flex items-center gap-2 px-3 py-2 rounded-full">
          <button className="btn btn-ghost btn-sm" onClick={() => router.back()}>
            <ChevronLeft size={15} />
            Back
          </button>
          <span className="caption hidden sm:block px-1">
            Consultation report
          </span>
          <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
            <Printer size={14} />
            Download PDF
          </button>
        </div>
      </div>

      <div className="overflow-x-auto pt-12 print:pt-0 print:overflow-visible">
        <ReportView consultationId={id} />
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Spinner className="w-8 h-8" />
        </div>
      }
    >
      <ReportPageInner />
    </Suspense>
  );
}
