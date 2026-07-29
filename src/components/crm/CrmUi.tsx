"use client";

/**
 * CRM-specific presentation pieces, built on the existing glass/mint design
 * system in components/ui.tsx rather than a second look.
 *
 * The metric components take `number | null` on purpose: null means "there
 * was nothing to measure", and these render an em dash plus an explanation
 * instead of a confident zero. That rule is enforced in analytics.ts and
 * honoured here.
 */

import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { stageLabel, stageTone } from "@/lib/crm/types";

const TONES: Record<string, string> = {
  slate: "bg-ink-100 text-ink-700",
  sky: "bg-sky-100 text-sky-800",
  violet: "bg-violet-100 text-violet-800",
  amber: "bg-amber-100 text-amber-900",
  teal: "bg-teal-100 text-teal-800",
  green: "bg-emerald-100 text-emerald-800",
  rose: "bg-rose-100 text-rose-800",
};

export function StageBadge({ stage }: { stage: string }) {
  const tone = TONES[stageTone(stage)] ?? TONES.slate;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${tone}`}
    >
      {stageLabel(stage)}
    </span>
  );
}

export function Pill({
  children,
  tone = "slate",
  title,
}: {
  children: ReactNode;
  tone?: keyof typeof TONES | string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${
        TONES[tone] ?? TONES.slate
      }`}
    >
      {children}
    </span>
  );
}

/**
 * One dashboard number.
 *
 * `hint` is where a metric explains itself — "no completed visits in this
 * range" is far more useful than a bare dash.
 */
export function Metric({
  label,
  value,
  hint,
  icon,
  tone,
  emphasis = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
  emphasis?: boolean;
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
      ? "text-amber-700"
      : tone === "bad"
      ? "text-rose-700"
      : "text-ink-900";
  return (
    <div className={`glass p-4 ${emphasis ? "ring-1 ring-mint-200" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="caption">{label}</div>
        {icon && <div className="text-ink-400 shrink-0">{icon}</div>}
      </div>
      <div className={`text-2xl font-medium leading-tight mt-1 ${toneClass}`}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-ink-400 mt-1 leading-snug">{hint}</div>}
    </div>
  );
}

/** A 0-5 rating. Renders "—" and a reason when there is nothing to average. */
export function Rating({
  value,
  count,
  size = 13,
}: {
  value: number | null;
  count?: number;
  size?: number;
}) {
  if (value === null) {
    return (
      <span className="text-ink-400 text-sm" title="No feedback in this range">
        —
      </span>
    );
  }
  const rounded = Math.round(value);
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            size={size}
            className={i <= rounded ? "text-amber-500 fill-amber-500" : "text-ink-200"}
          />
        ))}
      </span>
      <span className="text-sm font-medium text-ink-900">{value.toFixed(1)}</span>
      {count !== undefined && (
        <span className="text-[11px] text-ink-400">({count})</span>
      )}
    </span>
  );
}

/** A simple proportional bar for distributions (sources, treatments). */
export function BarRow({
  label,
  value,
  max,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
}) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-32 shrink-0 truncate text-ink-700" title={label}>
        {label}
      </div>
      <div className="flex-1 h-2 rounded-full bg-mint-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-mint-500"
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="w-14 text-right tabular-nums text-ink-900">
        {value}
        {suffix}
      </div>
    </div>
  );
}

export function SubHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h3 className="text-sm font-semibold text-ink-900 tracking-tight">{children}</h3>
      {action}
    </div>
  );
}

/** Wraps wide content so the page body never scrolls sideways. */
export function ScrollX({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto -mx-1 px-1">{children}</div>;
}
