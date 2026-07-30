/**
 * VYBERO call analytics for the admin module - clinic-flavored adaptation
 * of the VYBERO Analytics computations (VYBERO_Analytics_0.1/src/lib/
 * analytics.ts + deep-analytics.ts): same KPI/volume/peak-hour shapes,
 * with the keyword taxonomy swapped from TechGIS products/industries to
 * aesthetic procedures and patient question categories.
 *
 * Calls may arrive pre-labeled (topics[]/questions[] from the agent);
 * detectTopics() backfills from the summary text when they don't.
 */

import type { VyberoCall } from "./types";

/** CAPTURE treatment + interest taxonomy detected in call summaries. */
export const CALL_TOPICS: { id: string; label: string; keywords: string[] }[] = [
  { id: "mito-regenerative-glow", label: "Regenerative Glow", keywords: ["regenerative glow", "glow", "red light facial", "pre-event", "bridal"] },
  { id: "exomere-body-contour", label: "Body Contour", keywords: ["body contour", "stomach", "tummy", "abdomen", "cellulite", "slimming", "thighs", "arms"] },
  { id: "exomere-face-contour", label: "Face Contour", keywords: ["face contour", "jawline", "neck firmness", "sagging", "lifting"] },
  { id: "exomere-face-implant", label: "Skin Implant", keywords: ["skin implant", "implant regimen", "spicus", "acne", "scars", "pigmentation", "pores"] },
  { id: "exomere-regeneration", label: "Regeneration", keywords: ["regeneration", "sensitive skin", "barrier", "dryness", "restorative facial"] },
  { id: "mito-full-body-reset", label: "Full Body Reset", keywords: ["full body reset", "full body", "sleep", "muscle recovery", "wellness", "fatigue"] },
  { id: "products", label: "Home-care products", keywords: ["product", "serum", "cleanser", "cream", "ampoule", "mask", "balm", "delivery", "shop", "order"] },
  { id: "pricing", label: "Pricing", keywords: ["price", "cost", "how much", "fees", "charges", "payment", "installment", "package"] },
  { id: "availability", label: "Appointments / timing", keywords: ["appointment", "book", "slot", "available", "timing", "schedule", "evening", "weekend"] },
  { id: "location", label: "Location / directions", keywords: ["location", "address", "where", "directions", "parking", "vogue", "branch"] },
  { id: "aftercare", label: "Aftercare / recovery", keywords: ["aftercare", "recovery", "downtime", "healing", "side effect", "safe", "pain", "needle"] },
  { id: "capture-circle", label: "Capture Circle", keywords: ["capture circle", "loyalty", "reward", "points", "discount", "voucher"] },
];

export function topicLabel(id: string): string {
  return CALL_TOPICS.find((t) => t.id === id)?.label ?? id.replace(/_/g, " ");
}

/** Keyword backfill when the agent didn't pre-label the call. */
export function detectTopics(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  return CALL_TOPICS.filter((t) =>
    t.keywords.some((kw) => lower.includes(kw.toLowerCase()))
  ).map((t) => t.id);
}

export function callTopics(call: VyberoCall): string[] {
  if (call.topics.length > 0) return call.topics;
  return detectTopics(`${call.summary ?? ""}`);
}

// ---------------------------------------------------------------------
// KPI metrics (shape mirrors DashboardMetrics in the VYBERO app)
// ---------------------------------------------------------------------

export interface CallKpis {
  totalCalls: number;
  callsToday: number;
  callsThisWeek: number;
  booked: number;
  conversionRate: number; // % of answered calls that ended in a booking
  avgDurationSecs: number;
  missed: number;
}

export function computeCallKpis(calls: VyberoCall[]): CallKpis {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

  const answered = calls.filter((c) => c.outcome !== "missed");
  const booked = calls.filter((c) => c.outcome === "booked").length;
  const totalDur = answered.reduce((s, c) => s + c.duration_secs, 0);

  return {
    totalCalls: calls.length,
    callsToday: calls.filter((c) => c.started_at.slice(0, 10) === todayKey)
      .length,
    callsThisWeek: calls.filter((c) => new Date(c.started_at) >= weekStart)
      .length,
    booked,
    conversionRate:
      answered.length > 0 ? Math.round((booked / answered.length) * 100) : 0,
    avgDurationSecs:
      answered.length > 0 ? Math.round(totalDur / answered.length) : 0,
    missed: calls.filter((c) => c.outcome === "missed").length,
  };
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

// ---------------------------------------------------------------------
// Distributions (call volume, hours, topics, questions, outcomes)
// ---------------------------------------------------------------------

export interface DayVolume {
  date: string; // YYYY-MM-DD
  label: string; // "Mon 30"
  calls: number;
  booked: number;
  missed: number;
}

export function callVolumeByDay(calls: VyberoCall[], days = 14): DayVolume[] {
  const out: DayVolume[] = [];
  const map = new Map<string, DayVolume>();
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const row: DayVolume = {
      date,
      label: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }),
      calls: 0,
      booked: 0,
      missed: 0,
    };
    map.set(date, row);
    out.push(row);
  }
  for (const c of calls) {
    const row = map.get(c.started_at.slice(0, 10));
    if (!row) continue;
    row.calls++;
    if (c.outcome === "booked") row.booked++;
    if (c.outcome === "missed") row.missed++;
  }
  return out;
}

export function busiestHours(
  calls: VyberoCall[]
): { hour: number; label: string; count: number }[] {
  const counts = new Array<number>(24).fill(0);
  for (const c of calls) counts[new Date(c.started_at).getHours()]++;
  const first = counts.findIndex((c) => c > 0);
  const last = 23 - [...counts].reverse().findIndex((c) => c > 0);
  if (first === -1) return [];
  return counts
    .map((count, hour) => ({
      hour,
      label: `${((hour + 11) % 12) + 1}${hour < 12 ? "am" : "pm"}`,
      count,
    }))
    .slice(Math.max(0, first), Math.min(24, last + 1));
}

export function topicBreakdown(
  calls: VyberoCall[]
): { id: string; label: string; count: number; percentage: number }[] {
  const counts = new Map<string, number>();
  for (const c of calls) {
    for (const t of callTopics(c)) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const total = Math.max(1, calls.length);
  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      label: topicLabel(id),
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);
}

/** Group near-duplicate questions by normalized text, keep the shortest. */
export function topQuestions(
  calls: VyberoCall[],
  limit = 8
): { question: string; count: number }[] {
  const groups = new Map<string, { question: string; count: number }>();
  for (const c of calls) {
    for (const q of c.questions) {
      const key = q
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .split(/\s+/)
        .filter((w) => !["the", "a", "an", "is", "are", "do", "you", "i", "for", "of", "to"].includes(w))
        .sort()
        .join(" ");
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
        if (q.length < existing.question.length) existing.question = q;
      } else {
        groups.set(key, { question: q, count: 1 });
      }
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function outcomeBreakdown(
  calls: VyberoCall[]
): { outcome: string; label: string; count: number }[] {
  const LABELS: Record<string, string> = {
    booked: "Booked",
    info: "Information",
    callback: "Callback requested",
    transferred: "Transferred",
    missed: "Missed",
  };
  const counts = new Map<string, number>();
  for (const c of calls) counts.set(c.outcome, (counts.get(c.outcome) ?? 0) + 1);
  return [...counts.entries()]
    .map(([outcome, count]) => ({
      outcome,
      label: LABELS[outcome] ?? outcome,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}
