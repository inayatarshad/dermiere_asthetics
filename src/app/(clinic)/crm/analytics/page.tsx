"use client";

/**
 * CRM Analytics - the deeper cut.
 *
 * Overview answers "what needs attention today". This answers "how is the
 * business doing": branch-versus-branch comparison, lead sources, treatment
 * demand, staff workload, rating trends.
 *
 * Same rule as everywhere else in the CRM: a rate with an empty denominator
 * arrives as null and renders as "-" with a reason, never as a confident 0%.
 */

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  avg,
  daysAgoISO,
  fetchOverview,
  hours,
  money,
  pct,
  titleize,
  todayISO,
} from "@/lib/crm/client";
import type { CrmAnalytics } from "@/lib/crm/analytics";
import { RETURNING_VISIT_THRESHOLD } from "@/lib/crm/analytics";
import { EmptyState, GlassCard, SectionTitle, Spinner } from "@/components/ui";
import { BarRow, Metric, Rating, ScrollX, SubHeading } from "@/components/crm/CrmUi";
import { CrmFilters } from "@/components/crm/OverviewFilters";
import type { ClinicLocation } from "@/lib/types";

export default function CrmAnalyticsPage() {
  const users = useStore((s) => s.users);

  const [days, setDays] = useState(90);
  const [branch, setBranch] = useState("");
  const [data, setData] = useState<CrmAnalytics | null>(null);
  const [branches, setBranches] = useState<ClinicLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof fetchOverview>>) => {
    if (!res) {
      setError("Could not load analytics.");
      setData(null);
    } else {
      setError(null);
      setData(res.analytics);
      setBranches(res.branches ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchOverview({
        from: daysAgoISO(days),
        to: todayISO(),
        branch: branch || undefined,
      });
      if (!cancelled) apply(res);
    })();
    return () => {
      cancelled = true;
    };
  }, [days, branch, apply]);

  const refresh = () => {
    setLoading(true);
    void (async () =>
      apply(
        await fetchOverview({
          from: daysAgoISO(days),
          to: todayISO(),
          branch: branch || undefined,
        })
      ))();
  };

  const staffName = (id: string | undefined) =>
    users.find((u) => u.id === id)?.name ?? (id ? "Unknown" : "Unassigned");
  const branchName = (id: string | undefined) =>
    branches.find((b) => b.id === id)?.short ?? (id ? titleize(id) : "No branch");

  if (loading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        title="Analytics unavailable"
        body={error ?? "No data was returned."}
        action={
          <button className="btn btn-secondary btn-sm" onClick={refresh}>
            Try again
          </button>
        }
      />
    );
  }

  const { leads, followUps, feedback, patients, branches: branchStats } = data;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Analytics"
        sub={`Last ${days} days${branch ? ` · ${branchName(branch)}` : " · all branches"}`}
        action={
          <button
            className="btn btn-ghost btn-sm"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh"
          >
            {loading ? <Spinner className="w-4 h-4" /> : <RefreshCw size={15} />}
          </button>
        }
      />

      <CrmFilters
        days={days}
        branch={branch}
        branches={branches}
        onDays={(d) => {
          setLoading(true);
          setDays(d);
        }}
        onBranch={(b) => {
          setLoading(true);
          setBranch(b);
        }}
      />

      {/* --- branch comparison: the headline of this page --- */}
      <GlassCard className="p-5">
        <SubHeading>Branch comparison</SubHeading>
        {branchStats.length === 0 ? (
          <p className="text-sm text-ink-400">No branch activity in this range.</p>
        ) : (
          <ScrollX>
            <table className="w-full text-sm min-w-[880px]">
              <thead>
                <tr className="text-left text-ink-400 text-xs">
                  <th className="py-2 pr-3 font-medium">Branch</th>
                  <th className="py-2 px-3 font-medium text-right">Leads</th>
                  <th className="py-2 px-3 font-medium text-right">Converted</th>
                  <th className="py-2 px-3 font-medium text-right">New pts</th>
                  <th className="py-2 px-3 font-medium text-right">Returning</th>
                  <th className="py-2 px-3 font-medium text-right">Appt done</th>
                  <th className="py-2 px-3 font-medium text-right">No-show</th>
                  <th className="py-2 px-3 font-medium text-right">Follow-ups</th>
                  <th className="py-2 px-3 font-medium text-right">Rating</th>
                  <th className="py-2 px-3 font-medium text-right">Response</th>
                  <th className="py-2 pl-3 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {branchStats.map((b) => (
                  <tr key={b.branch_id} className="border-t border-white/60">
                    <td className="py-2.5 pr-3 font-medium text-ink-900 whitespace-nowrap">
                      {branchName(b.branch_id)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{b.leads}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                      {b.conversions}
                      <span className="text-ink-400 text-xs ml-1">
                        ({pct(b.conversionRate)})
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{b.newPatients}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {b.returningPatients}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {pct(b.completionRate)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right tabular-nums ${
                        (b.noShowRate ?? 0) > 15 ? "text-rose-700" : ""
                      }`}
                    >
                      {pct(b.noShowRate)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {pct(b.followUpCompletionRate)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <Rating value={b.feedbackAvg} count={b.feedbackCount} size={11} />
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums">
                      {b.responseSupported ? hours(b.avgResponseHours) : "-"}
                    </td>
                    <td className="py-2.5 pl-3 text-right tabular-nums">
                      {b.revenueSupported ? money(b.revenue) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        )}
        <p className="caption mt-3">
          An em dash means there was nothing to measure in this range - no
          invoices, no responses, or no appointments - rather than a zero.
        </p>
      </GlassCard>

      {/* --- acquisition --- */}
      <div className="grid lg:grid-cols-2 gap-4">
        <GlassCard className="p-5">
          <SubHeading>Where leads come from</SubHeading>
          {leads.bySource.length === 0 ? (
            <p className="text-sm text-ink-400">No leads in this range.</p>
          ) : (
            <div className="space-y-1.5">
              {leads.bySource.map((s) => (
                <BarRow
                  key={s.source}
                  label={titleize(s.source)}
                  value={s.count}
                  max={leads.bySource[0].count}
                />
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <SubHeading>What they ask for</SubHeading>
          {leads.byTreatment.length === 0 ? (
            <p className="text-sm text-ink-400">No treatment interest recorded.</p>
          ) : (
            <div className="space-y-1.5">
              {leads.byTreatment.map((t) => (
                <BarRow
                  key={t.treatment}
                  label={titleize(t.treatment)}
                  value={t.count}
                  max={leads.byTreatment[0].count}
                />
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {/* --- funnel --- */}
      <GlassCard className="p-5">
        <SubHeading>Conversion funnel</SubHeading>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Metric label="New leads" value={leads.newLeads} />
          <Metric
            label="Consultations booked"
            value={leads.consultationBookings}
            hint={`${pct(leads.leadToBookingRate)} of leads`}
          />
          <Metric
            label="Converted"
            value={leads.won}
            hint={`${pct(leads.leadToPatientRate)} of leads`}
            tone="good"
          />
          <Metric
            label="Lost"
            value={leads.lost}
            tone={leads.lost > 0 ? "bad" : "neutral"}
          />
          <Metric
            label="Avg first response"
            value={hours(leads.avgFirstResponseHours)}
            hint={
              leads.respondedCount === 0
                ? "No responses recorded"
                : `across ${leads.respondedCount} leads`
            }
            tone={
              leads.avgFirstResponseHours !== null &&
              leads.avgFirstResponseHours > 24
                ? "warn"
                : "neutral"
            }
          />
        </div>
      </GlassCard>

      {/* --- retention --- */}
      <GlassCard className="p-5">
        <SubHeading>Patient retention</SubHeading>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Metric label="Total patients" value={patients.total} />
          <Metric label="New in range" value={patients.newInRange} />
          <Metric
            label="Returning"
            value={patients.returning}
            hint={`${RETURNING_VISIT_THRESHOLD}+ completed visits`}
          />
          <Metric
            label="Retention"
            value={pct(patients.retentionRate)}
            hint={patients.total === 0 ? "No patients yet" : "Returning ÷ total"}
          />
          <Metric
            label="Inactive"
            value={patients.inactive}
            hint="No visit in 180 days"
            tone={patients.inactive > 0 ? "warn" : "neutral"}
          />
        </div>
      </GlassCard>

      {/* --- workload + satisfaction --- */}
      <div className="grid lg:grid-cols-2 gap-4">
        <GlassCard className="p-5">
          <SubHeading>Follow-up workload by staff</SubHeading>
          {followUps.byStaff.length === 0 ? (
            <p className="text-sm text-ink-400">Nothing due in this range.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                {followUps.byStaff
                  .slice()
                  .sort((a, b) => b.total - a.total)
                  .map((s) => (
                    <BarRow
                      key={s.staff_id ?? "none"}
                      label={staffName(s.staff_id)}
                      value={s.completed}
                      max={Math.max(...followUps.byStaff.map((x) => x.total), 1)}
                      suffix={`/${s.total}`}
                    />
                  ))}
              </div>
              <p className="caption mt-3">
                Completed of total assigned. Cancelled items are excluded from
                the completion rate.
              </p>
            </>
          )}
        </GlassCard>

        <GlassCard className="p-5">
          <SubHeading>Satisfaction</SubHeading>
          {feedback.count === 0 ? (
            <EmptyState
              title="No feedback in this range"
              body="Nothing is averaged until patients respond."
            />
          ) : (
            <>
              <div className="space-y-2.5">
                <RatingLine label="Overall" value={feedback.avgOverall} />
                <RatingLine label="Branch experience" value={feedback.avgBranch} />
                <RatingLine label="Doctor" value={feedback.avgDoctor} />
                <RatingLine label="Treatment" value={feedback.avgTreatment} />
              </div>

              {feedback.byDoctor.length > 0 && (
                <>
                  <div className="caption mt-4 mb-2">By doctor</div>
                  <div className="space-y-2">
                    {feedback.byDoctor.map((d) => (
                      <div
                        key={d.doctor_id ?? "none"}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="text-sm text-ink-700">
                          {staffName(d.doctor_id)}
                        </span>
                        <Rating value={d.avg} count={d.count} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {feedback.trend.length > 1 && (
                <>
                  <div className="caption mt-4 mb-2">Rating trend</div>
                  <div className="flex items-end gap-1.5 h-20">
                    {feedback.trend.map((t) => (
                      <div
                        key={t.month}
                        className="flex-1 flex flex-col items-center gap-1"
                        title={`${t.month}: ${avg(t.avg)} from ${t.count} responses`}
                      >
                        <div
                          className="w-full rounded-t bg-mint-400"
                          style={{ height: `${((t.avg ?? 0) / 5) * 100}%` }}
                        />
                        <span className="text-[9px] text-ink-400">
                          {t.month.slice(5)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function RatingLine({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink-700">{label}</span>
      {value === null ? (
        <span className="text-xs text-ink-400">Not rated</span>
      ) : (
        <Rating value={value} />
      )}
    </div>
  );
}
