"use client";

import { useStore } from "@/lib/store";
import { useAssetUrl } from "@/lib/hooks";
import { initials } from "@/lib/format";
import type { Patient } from "@/lib/types";

const SIZES = {
  sm: "w-9 h-9 text-xs",
  md: "w-12 h-12 text-sm",
  lg: "w-20 h-20 text-xl",
  xl: "w-28 h-28 text-2xl",
};

export function PatientAvatar({
  patient,
  size = "md",
  className = "",
}: {
  patient: Patient;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const front = useStore((s) =>
    s.assets.find(
      (a) => a.patient_id === patient.id && a.kind === "photo_front"
    )
  );
  const url = useAssetUrl(front);

  return (
    <div
      className={`${SIZES[size]} ${className} rounded-full overflow-hidden flex items-center justify-center font-medium text-ink-700 shrink-0 border border-white/70 shadow-md`}
      style={{
        background: url
          ? undefined
          : "linear-gradient(135deg, var(--mint-200), var(--mint-100))",
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={patient.name}
          className="w-full h-full object-cover"
        />
      ) : (
        initials(patient.name)
      )}
    </div>
  );
}
