"use client";

/**
 * Date-range and branch filters, shared by the CRM Overview and Analytics
 * screens so the two always offer the same controls and the same defaults.
 */

import type { ClinicLocation } from "@/lib/types";

export const RANGE_PRESETS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "12 months", days: 365 },
];

export function CrmFilters({
  days,
  branch,
  branches,
  onDays,
  onBranch,
}: {
  days: number;
  branch: string;
  branches: ClinicLocation[];
  onDays: (d: number) => void;
  onBranch: (b: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        {RANGE_PRESETS.map((p) => (
          <button
            key={p.days}
            onClick={() => onDays(p.days)}
            className={`chip ${days === p.days ? "chip-active" : ""}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="w-px h-5 bg-ink-200 mx-1 hidden sm:block" />
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => onBranch("")}
          className={`chip ${branch === "" ? "chip-active" : ""}`}
        >
          All branches
        </button>
        {branches.map((b) => (
          <button
            key={b.id}
            onClick={() => onBranch(b.id)}
            className={`chip ${branch === b.id ? "chip-active" : ""}`}
          >
            {b.short}
          </button>
        ))}
      </div>
    </div>
  );
}
