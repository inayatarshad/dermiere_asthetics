"use client";

/**
 * VYBERO Analytics — the admin's view of the voice agent's phone work,
 * modeled on the TechGIS VYBERO Analytics dashboard (KPI row, call
 * volume, peak hours, topic + question mining, recent calls) and
 * clinic-flavored: topics are procedures, outcomes are bookings.
 * Charts are hand-rolled SVG to stay on the glassmorphic system.
 */

import { useMemo } from "react";
import {
  PhoneCall,
  PhoneMissed,
  CalendarCheck,
  Timer,
  TrendingUp,
  MessageCircleQuestion,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useStore, useSessionUser, can } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import {
  busiestHours,
  callTopics,
  callVolumeByDay,
  computeCallKpis,
  formatDuration,
  outcomeBreakdown,
  topicBreakdown,
  topicLabel,
  topQuestions,
} from "@/lib/vyberoAnalytics";
import { GlassCard, EmptyState, SectionTitle, StatCard } from "@/components/ui";

const OUTCOME_BADGES: Record<string, string> = {
  booked: "bg-mint-500 text-white",
  info: "bg-mint-100 text-ink-700",
  callback: "bg-amber-100 text-amber-900",
  transferred: "bg-white/70 text-ink-700 border border-white",
  missed: "bg-white/50 text-ink-400",
};

export default function AnalyticsPage() {
  const mounted = useMounted();
  const user = useSessionUser();
  const calls = useStore((s) => s.vyberoCalls);
  const appointments = useStore((s) => s.appointments);
  const aiUsage = useStore((s) => s.aiUsage);

  const kpis = useMemo(() => computeCallKpis(calls), [calls]);
  const volume = useMemo(() => callVolumeByDay(calls, 14), [calls]);
  const hours = useMemo(() => busiestHours(calls), [calls]);
  const topics = useMemo(() => topicBreakdown(calls), [calls]);
  const questions = useMemo(() => topQuestions(calls, 8), [calls]);
  const outcomes = useMemo(() => outcomeBreakdown(calls), [calls]);
  const vyberoBookings = useMemo(
    () => appointments.filter((a) => a.source === "vybero").length,
    [appointments]
  );

  if (!mounted) return null;
  if (!can.manageUsers(user?.role)) {
    return (
      <div className="pt-4">
        <EmptyState
          icon={<ShieldCheck size={28} />}
          title="Admin access required"
          body="VYBERO Analytics is available to the clinic administrator role."
        />
      </div>
    );
  }

  return (
    <div className="fade-up">
      <SectionTitle
        title="VYBERO Analytics"
        sub="What the phone agent is doing: call volume, what patients ask about, and how many calls become bookings"
        className="mb-4"
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard
          icon={<PhoneCall size={17} />}
          label="Calls (14 days)"
          value={String(kpis.totalCalls)}
        />
        <StatCard
          icon={<TrendingUp size={17} />}
          label="This week"
          value={String(kpis.callsThisWeek)}
        />
        <StatCard
          icon={<CalendarCheck size={17} />}
          label="Booked via calls"
          value={String(kpis.booked)}
        />
        <StatCard
          icon={<Sparkles size={17} />}
          label="Conversion"
          value={`${kpis.conversionRate}%`}
        />
        <StatCard
          icon={<Timer size={17} />}
          label="Avg call"
          value={formatDuration(kpis.avgDurationSecs)}
        />
        <StatCard
          icon={<PhoneMissed size={17} />}
          label="Missed"
          value={String(kpis.missed)}
        />
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4 mt-4">
        {/* Call volume, stacked booked/other/missed */}
        <GlassCard className="p-5">
          <h3 className="h2 text-ink-900">Call volume · last 14 days</h3>
          <p className="caption mt-0.5 mb-4">
            Mint = ended in a booking. Pale = handled. Gray = missed.
          </p>
          <VolumeChart data={volume} />
        </GlassCard>

        {/* Outcomes */}
        <GlassCard className="p-5">
          <h3 className="h2 text-ink-900">Call outcomes</h3>
          <p className="caption mt-0.5 mb-4">
            {vyberoBookings} appointments in the diary came from VYBERO.
          </p>
          <div className="space-y-2.5">
            {outcomes.map((o) => {
              const max = Math.max(1, outcomes[0]?.count ?? 1);
              return (
                <div key={o.outcome}>
                  <div className="flex justify-between text-sm text-ink-700 mb-1">
                    <span>{o.label}</span>
                    <span className="font-semibold text-ink-900">{o.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/60 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        o.outcome === "booked"
                          ? "bg-mint-500"
                          : o.outcome === "missed"
                            ? "bg-ink-400/40"
                            : "bg-mint-300"
                      }`}
                      style={{ width: `${(o.count / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        {/* Topic mining */}
        <GlassCard className="p-5">
          <h3 className="h2 text-ink-900">What patients ask about</h3>
          <p className="caption mt-0.5 mb-4">
            Procedure and topic mentions across calls (a call can mention several).
          </p>
          <div className="space-y-2.5">
            {topics.slice(0, 8).map((t) => {
              const max = Math.max(1, topics[0]?.count ?? 1);
              return (
                <div key={t.id}>
                  <div className="flex justify-between text-sm text-ink-700 mb-1">
                    <span>{t.label}</span>
                    <span className="font-semibold text-ink-900">
                      {t.count}
                      <span className="caption font-normal"> · {t.percentage}%</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/60 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-mint-500"
                      style={{ width: `${(t.count / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {topics.length === 0 && (
              <p className="caption">No calls recorded yet.</p>
            )}
          </div>
        </GlassCard>

        {/* Top questions + busiest hours */}
        <div className="space-y-4">
          <GlassCard className="p-5">
            <h3 className="h2 text-ink-900 flex items-center gap-2">
              <MessageCircleQuestion size={17} className="text-mint-500" />
              Top questions
            </h3>
            <ol className="mt-3 space-y-2">
              {questions.map((q, i) => (
                <li key={q.question} className="flex items-start gap-2.5 text-sm text-ink-700">
                  <span className="w-5 h-5 rounded-full bg-mint-100 text-ink-700 text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="flex-1">{q.question}</span>
                  <span className="chip chip-static text-[11px] shrink-0">
                    ×{q.count}
                  </span>
                </li>
              ))}
              {questions.length === 0 && (
                <p className="caption">No questions captured yet.</p>
              )}
            </ol>
          </GlassCard>

          <GlassCard className="p-5">
            <h3 className="h2 text-ink-900">Busiest calling hours</h3>
            <HoursChart data={hours} />
          </GlassCard>
        </div>
      </div>

      {/* AI usage & cost (finances visibility, per-device counters) */}
      <GlassCard className="p-5 mt-4">
        <h3 className="h2 text-ink-900">AI usage &amp; estimated cost</h3>
        <p className="caption mt-0.5 mb-3">
          Counted on this device. Unit estimates: photoreal generation ≈
          $0.06, assessment skin analysis ≈ $0.01. Full per-clinic cost model
          in SCALABILITY_ROADMAP.md.
        </p>
        <div className="grid grid-cols-3 gap-3 max-w-xl">
          <div>
            <div className="text-2xl font-medium text-ink-900">
              {aiUsage.generations}
            </div>
            <div className="caption">Photoreal generations</div>
          </div>
          <div>
            <div className="text-2xl font-medium text-ink-900">
              {aiUsage.assessments}
            </div>
            <div className="caption">Assessment analyses</div>
          </div>
          <div>
            <div className="text-2xl font-medium text-ink-900">
              ${(aiUsage.generations * 0.06 + aiUsage.assessments * 0.01).toFixed(2)}
            </div>
            <div className="caption">Estimated spend</div>
          </div>
        </div>
      </GlassCard>

      {/* Recent calls */}
      <GlassCard className="p-5 mt-4">
        <h3 className="h2 text-ink-900 mb-3">Recent calls</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left caption border-b border-white/60">
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Caller</th>
                <th className="py-2 pr-3 font-medium">Topics</th>
                <th className="py-2 pr-3 font-medium">Outcome</th>
                <th className="py-2 pr-0 font-medium text-right">Duration</th>
              </tr>
            </thead>
            <tbody>
              {calls.slice(0, 12).map((c) => (
                <tr key={c.id} className="border-b border-white/40 last:border-0">
                  <td className="py-2.5 pr-3 whitespace-nowrap text-ink-700">
                    {new Date(c.started_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    <span className="caption">
                      {new Date(c.started_at).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-ink-900 font-medium">
                    {c.caller_name ?? "Unknown"}
                    {c.language && (
                      <span className="caption font-normal"> · {c.language}</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="flex gap-1 flex-wrap">
                      {callTopics(c).slice(0, 3).map((t) => (
                        <span key={t} className="chip chip-static text-[11px]">
                          {topicLabel(t)}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${OUTCOME_BADGES[c.outcome] ?? ""}`}
                    >
                      {c.outcome === "booked" ? "Booked" : c.outcome}
                    </span>
                  </td>
                  <td className="py-2.5 pr-0 text-right text-ink-700 whitespace-nowrap">
                    {c.duration_secs > 0 ? formatDuration(c.duration_secs) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

// ---------------------------------------------------------------------
// Hand-rolled SVG charts (glassmorphic-consistent, no chart dependency)
// ---------------------------------------------------------------------

function VolumeChart({
  data,
}: {
  data: { label: string; calls: number; booked: number; missed: number }[];
}) {
  const W = 560;
  const H = 180;
  const pad = 4;
  const max = Math.max(1, ...data.map((d) => d.calls));
  const bw = (W - pad * 2) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full h-auto">
      {data.map((d, i) => {
        const x = pad + i * bw;
        const handled = d.calls - d.booked - d.missed;
        const hBooked = (d.booked / max) * H;
        const hHandled = (handled / max) * H;
        const hMissed = (d.missed / max) * H;
        let y = H;
        const bars: { h: number; fill: string }[] = [
          { h: hBooked, fill: "var(--mint-500, #34d3b0)" },
          { h: hHandled, fill: "var(--mint-200, #bdeee2)" },
          { h: hMissed, fill: "rgba(90,101,119,0.25)" },
        ];
        return (
          <g key={d.label}>
            {bars.map((b, j) => {
              y -= b.h;
              return (
                <rect
                  key={j}
                  x={x + 3}
                  y={y}
                  width={Math.max(4, bw - 6)}
                  height={Math.max(0, b.h)}
                  rx={3}
                  fill={b.fill}
                />
              );
            })}
            {i % 2 === 0 && (
              <text
                x={x + bw / 2}
                y={H + 15}
                textAnchor="middle"
                fontSize="9"
                fill="rgba(90,101,119,0.8)"
              >
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function HoursChart({
  data,
}: {
  data: { hour: number; label: string; count: number }[];
}) {
  if (data.length === 0) return <p className="caption mt-2">No calls yet.</p>;
  const W = 400;
  const H = 90;
  const max = Math.max(1, ...data.map((d) => d.count));
  const bw = W / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full h-auto mt-2">
      {data.map((d, i) => {
        const h = (d.count / max) * H;
        return (
          <g key={d.hour}>
            <rect
              x={i * bw + 2}
              y={H - h}
              width={Math.max(3, bw - 4)}
              height={h}
              rx={3}
              fill={
                d.count === max
                  ? "var(--mint-500, #34d3b0)"
                  : "var(--mint-200, #bdeee2)"
              }
            />
            {(i === 0 || i === data.length - 1 || d.count === max) && (
              <text
                x={i * bw + bw / 2}
                y={H + 14}
                textAnchor="middle"
                fontSize="9"
                fill="rgba(90,101,119,0.8)"
              >
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
