"use client";

/**
 * CRM Overview — "what needs attention today".
 *
 * Deliberately kept to the operational picture: what came in, what is owed
 * to someone, what went wrong. The business analysis — branch comparison,
 * lead sources, treatment demand, trends — lives on /crm/analytics so the
 * two screens do not say the same thing twice.
 *
 * Every figure comes from /api/crm/overview, computed server-side from the
 * caller's clinic. Rates arrive as `number | null`; null means the
 * denominator was empty and renders as "—" with a reason, never as 0%.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CircleCheck,
  Clock,
  Inbox,
  RefreshCw,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { useSessionUser } from "@/lib/store";
import { crmCan } from "@/lib/crm/permissions";
import {
  avg,
  daysAgoISO,
  fetchOverview,
  hours,
  pct,
  titleize,
  todayISO,
} from "@/lib/crm/client";
import type { CrmAnalytics } from "@/lib/crm/analytics";
import { RETURNING_VISIT_THRESHOLD } from "@/lib/crm/analytics";
import { GlassCard, EmptyState, SectionTitle, Spinner } from "@/components/ui";
import { Metric, Rating, SubHeading } from "@/components/crm/CrmUi";
import { CrmFilters } from "@/components/crm/OverviewFilters";
import type { ClinicLocation } from "@/lib/types";

export default function CrmOverviewPage() {
  const user = useSessionUser();
  const canOwner = crmCan(user?.role, "view_owner_analytics");

  const [days, setDays] = useState(30);
  const [branch, setBranch] = useState("");
  const [data, setData] = useState<CrmAnalytics | null>(null);
  const [branches, setBranches] = useState<ClinicLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof fetchOverview>>) => {
    if (!res) {
      setError("Could not load the dashboard.");
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
      if (!canOwner) {
        if (!cancelled) setLoading(false);
        return;
      }
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
  }, [canOwner, days, branch, apply]);

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

  const branchName = (id: string | undefined) =>
    branches.find((b) => b.id === id)?.short ?? (id ? titleize(id) : "No branch");

  if (!canOwner) return <NonOwnerOverview />;

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
        title="Dashboard unavailable"
        body={error ?? "No data was returned."}
        action={
          <button className="btn btn-secondary btn-sm" onClick={refresh}>
            Try again
          </button>
        }
      />
    );
  }

  const { patients, leads, followUps, feedback } = data;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Overview"
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

      {/* --- headline --- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric
          label="New leads"
          value={leads.newLeads}
          icon={<UserPlus size={16} />}
          hint={`${leads.awaitingResponse} awaiting a first response`}
          tone={leads.awaitingResponse > 0 ? "warn" : "neutral"}
        />
        <Metric
          label="Lead → patient"
          value={pct(leads.leadToPatientRate)}
          icon={<TrendingUp size={16} />}
          hint={
            leads.newLeads === 0
              ? "No leads in this range"
              : `${leads.won} converted of ${leads.newLeads}`
          }
        />
        <Metric
          label="Follow-ups due today"
          value={followUps.dueToday}
          icon={<CalendarClock size={16} />}
          hint={`${followUps.overdue} overdue`}
          tone={followUps.overdue > 0 ? "bad" : "good"}
          emphasis={followUps.overdue > 0}
        />
        <Metric
          label="Average rating"
          value={avg(feedback.avgOverall)}
          icon={<CircleCheck size={16} />}
          hint={
            feedback.count === 0
              ? "No feedback in this range"
              : `${feedback.count} responses · ${feedback.lowRatingCount} low`
          }
          tone={
            feedback.avgOverall === null
              ? "neutral"
              : feedback.avgOverall >= 4
              ? "good"
              : "warn"
          }
        />
      </div>

      {/* --- needs attention --- */}
      <div className="grid lg:grid-cols-3 gap-4">
        <ActionCard
          href="/crm/leads"
          icon={<UserPlus size={18} />}
          title="Leads awaiting a reply"
          value={leads.awaitingResponse}
          tone={leads.awaitingResponse > 0 ? "warn" : "good"}
          body={
            leads.awaitingResponse > 0
              ? "New leads nobody has responded to yet."
              : "Every new lead has had a first response."
          }
        />
        <ActionCard
          href="/crm/followups"
          icon={<AlertTriangle size={18} />}
          title="Overdue follow-ups"
          value={followUps.overdue}
          tone={followUps.overdue > 0 ? "bad" : "good"}
          body={
            followUps.overdue > 0
              ? "Past their due date and still open."
              : "Nothing is past its due date."
          }
        />
        <ActionCard
          href="/crm/feedback"
          icon={<AlertTriangle size={18} />}
          title="Open recovery cases"
          value={feedback.openRecovery}
          tone={feedback.openRecovery > 0 ? "warn" : "good"}
          body={
            feedback.openRecovery > 0
              ? "Low ratings still waiting to be put right."
              : "No unresolved complaints."
          }
        />
      </div>

      {/* --- the day's numbers --- */}
      <div className="grid lg:grid-cols-2 gap-4">
        <GlassCard className="p-5">
          <SubHeading
            action={
              <Link href="/crm/followups" className="text-xs text-mint-600 font-medium">
                Open follow-ups →
              </Link>
            }
          >
            Follow-ups
          </SubHeading>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Due today" value={followUps.dueToday} icon={<CalendarClock size={16} />} />
            <Metric label="Pending" value={followUps.pending} icon={<Clock size={16} />} />
            <Metric label="Completed" value={followUps.completed} tone="good" />
            <Metric
              label="Completion rate"
              value={pct(followUps.completionRate)}
              hint={
                followUps.completionRate === null
                  ? "Nothing due in this range"
                  : "Cancelled excluded"
              }
            />
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <SubHeading
            action={
              <Link href="/crm/leads" className="text-xs text-mint-600 font-medium">
                Open pipeline →
              </Link>
            }
          >
            Pipeline
          </SubHeading>
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="Consultations booked"
              value={leads.consultationBookings}
              hint={`${pct(leads.leadToBookingRate)} of new leads`}
            />
            <Metric
              label="Avg first response"
              value={hours(leads.avgFirstResponseHours)}
              hint={
                leads.respondedCount === 0
                  ? "No responses recorded yet"
                  : `across ${leads.respondedCount} leads`
              }
              tone={
                leads.avgFirstResponseHours !== null &&
                leads.avgFirstResponseHours > 24
                  ? "warn"
                  : "neutral"
              }
            />
            <Metric label="Won" value={leads.won} tone="good" />
            <Metric
              label="Lost"
              value={leads.lost}
              tone={leads.lost > 0 ? "bad" : "neutral"}
            />
          </div>
        </GlassCard>
      </div>

      {/* --- patients + satisfaction, at a glance --- */}
      <div className="grid lg:grid-cols-2 gap-4">
        <GlassCard className="p-5">
          <SubHeading>Patients</SubHeading>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Total" value={patients.total} icon={<Users size={16} />} />
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
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <SubHeading
            action={
              <Link href="/crm/analytics" className="text-xs text-mint-600 font-medium">
                Full analytics →
              </Link>
            }
          >
            Satisfaction
          </SubHeading>
          {feedback.count === 0 ? (
            <EmptyState
              title="No feedback in this range"
              body="Ratings appear once patients respond. Nothing is averaged until then."
            />
          ) : (
            <div className="space-y-2.5">
              <RatingLine label="Overall" value={feedback.avgOverall} />
              <RatingLine label="Branch experience" value={feedback.avgBranch} />
              <RatingLine label="Doctor" value={feedback.avgDoctor} />
              <RatingLine label="Treatment" value={feedback.avgTreatment} />
            </div>
          )}
        </GlassCard>
      </div>

      <Link
        href="/crm/analytics"
        className="glass card-hover p-5 flex items-center justify-between gap-3"
      >
        <div>
          <div className="font-medium text-ink-900">Branch comparison and trends</div>
          <p className="caption mt-0.5">
            Gulberg versus F-11 on leads, conversion, no-shows, revenue and
            satisfaction — plus lead sources and treatment demand.
          </p>
        </div>
        <ArrowRight size={18} className="text-ink-400 shrink-0" />
      </Link>
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

function ActionCard({
  href,
  icon,
  title,
  value,
  body,
  tone,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  value: number;
  body: string;
  tone: "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "bad"
      ? "text-rose-700"
      : tone === "warn"
      ? "text-amber-700"
      : "text-emerald-700";
  return (
    <Link
      href={href}
      className={`glass card-hover p-5 block ${
        value > 0 && tone !== "good" ? "ring-1 ring-amber-200" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-400">{icon}</span>
        <span className={`text-2xl font-medium ${toneClass}`}>{value}</span>
      </div>
      <div className="font-medium text-ink-900 mt-2">{title}</div>
      <p className="caption mt-0.5">{body}</p>
    </Link>
  );
}

/**
 * What front desk and doctors see: their own work, not the owner's numbers.
 * A role-appropriate landing page beats a 403.
 */
function NonOwnerOverview() {
  return (
    <div className="space-y-4">
      <SectionTitle title="CRM" sub="Your leads, follow-ups and conversations" />
      <div className="grid sm:grid-cols-3 gap-3">
        <Link href="/crm/followups" className="glass card-hover p-5 block">
          <CalendarClock size={20} className="text-mint-600 mb-2" />
          <div className="font-medium text-ink-900">Follow-ups</div>
          <p className="caption mt-1">What is due today, and what is overdue.</p>
        </Link>
        <Link href="/crm/inbox" className="glass card-hover p-5 block">
          <Inbox size={20} className="text-mint-600 mb-2" />
          <div className="font-medium text-ink-900">Shared inbox</div>
          <p className="caption mt-1">Patient conversations assigned to the team.</p>
        </Link>
        <Link href="/crm/contacts" className="glass card-hover p-5 block">
          <Users size={20} className="text-mint-600 mb-2" />
          <div className="font-medium text-ink-900">Contacts</div>
          <p className="caption mt-1">Search leads and patients, and their history.</p>
        </Link>
      </div>
      <p className="caption">
        Clinic-wide analytics are limited to the owner and administrators.
      </p>
    </div>
  );
}
