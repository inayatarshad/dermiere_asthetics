"use client";

/** CRM Overview: the operational picture for today. */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Inbox,
  RefreshCw,
  UserRoundCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { useSessionUser } from "@/lib/store";
import { crmCan } from "@/lib/crm/permissions";
import { fetchOverview, titleize, todayISO, daysAgoISO } from "@/lib/crm/client";
import type { CrmDashboard } from "@/lib/crm/dashboard";
import type { ClinicLocation } from "@/lib/types";
import { EmptyState, GlassCard, SectionTitle, Spinner } from "@/components/ui";
import { SubHeading } from "@/components/crm/CrmUi";
import { ActivityChart, Breakdown, Funnel, Ring } from "@/components/crm/Charts";

const money = new Intl.NumberFormat("en-PK", {
  style: "currency",
  currency: "PKR",
  maximumFractionDigits: 0,
});

export default function CrmOverviewPage() {
  const user = useSessionUser();
  const canOwner = crmCan(user?.role, "view_owner_analytics");
  const [branch, setBranch] = useState("");
  const [data, setData] = useState<CrmDashboard | null>(null);
  const [branches, setBranches] = useState<ClinicLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchOverview({
      from: daysAgoISO(30),
      to: todayISO(),
      branch: branch || undefined,
    });
    if (!res) {
      setError("Could not load the dashboard.");
      setData(null);
    } else {
      setError(null);
      setData(res.dashboard);
      setBranches(res.branches ?? []);
    }
    setLoading(false);
  }, [branch]);

  useEffect(() => {
    let cancelled = false;
    if (canOwner) {
      void (async () => {
        const res = await fetchOverview({
          from: daysAgoISO(30),
          to: todayISO(),
          branch: branch || undefined,
        });
        if (cancelled) return;
        if (!res) {
          setError("Could not load the dashboard.");
          setData(null);
        } else {
          setError(null);
          setData(res.dashboard);
          setBranches(res.branches ?? []);
        }
        setLoading(false);
      })();
    }
    return () => { cancelled = true; };
  }, [canOwner, branch]);

  if (!canOwner) return <NonOwnerOverview />;

  if (loading && !data) {
    return <div className="flex justify-center py-20"><Spinner className="w-8 h-8" /></div>;
  }

  if (error || !data) {
    return (
      <EmptyState
        title="Dashboard unavailable"
        body={error ?? "No data was returned."}
        action={<button className="btn btn-secondary btn-sm" onClick={() => void load()}>Try again</button>}
      />
    );
  }

  const branchName = (id: string) =>
    branches.find((item) => item.id === id)?.short ?? titleize(id);
  const series = data.series.map((point) => ({
    label: new Date(point.date).toLocaleDateString("en-PK", { day: "numeric", month: "short" }),
    booked: point.booked,
    visited: point.visited,
    messages: point.messages,
  }));

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Overview"
        sub={branch ? `${branchName(branch)} · live operating picture` : "All branches · live operating picture"}
        action={
          <button className="btn btn-ghost btn-sm" onClick={() => { setLoading(true); void load(); }} disabled={loading} aria-label="Refresh">
            {loading ? <Spinner className="w-4 h-4" /> : <RefreshCw size={15} />}
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-1">
        <button onClick={() => { setLoading(true); setBranch(""); }} className={`chip ${branch === "" ? "chip-active" : ""}`}>All branches</button>
        {branches.map((item) => (
          <button key={item.id} onClick={() => { setLoading(true); setBranch(item.id); }} className={`chip ${branch === item.id ? "chip-active" : ""}`}>
            {item.short}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <OverviewMetric label="Open leads" value={data.openLeads} icon={<Users size={20} />} />
        <OverviewMetric label="Booked in next 7 days" value={data.bookedNext7} icon={<CalendarDays size={20} />} />
        <OverviewMetric label="Visited (30 days)" value={data.visited30} icon={<UserRoundCheck size={20} />} />
        <OverviewMetric label="Pipeline value" value={money.format(data.pipelineValue)} icon={<WalletCards size={20} />} />
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4">
        <GlassCard className="p-5">
          <SubHeading action={<span className="text-[11px] text-ink-400">Last 14 days</span>}>Bookings, visits and messages</SubHeading>
          <ActivityChart data={series} />
        </GlassCard>
        <GlassCard className="p-5">
          <SubHeading action={<Link href="/crm/leads" className="text-xs text-mint-600 font-medium">Open →</Link>}>Funnel</SubHeading>
          <Funnel steps={data.funnel} />
        </GlassCard>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard className="p-5">
          <SubHeading>Booked → visited</SubHeading>
          <Ring value={data.attendance.rate} caption="of booked consultations attended" sub={`${data.attendance.noShows} no-show in the last 90 days`} />
        </GlassCard>
        <GlassCard className="p-5">
          <SubHeading>The loop</SubHeading>
          <p className="caption -mt-2 mb-4">Visits that came back round</p>
          <div className="flex items-center gap-4">
            <span className="w-12 h-12 rounded-xl bg-mint-100 text-mint-500 grid place-items-center"><RefreshCw size={22} /></span>
            <div><div className="text-3xl font-medium text-ink-900 tabular-nums">{data.rebooked30}</div><div className="caption">rebooked in the last 30 days</div></div>
          </div>
        </GlassCard>
        <GlassCard className="p-5">
          <SubHeading>WhatsApp</SubHeading>
          <p className="caption -mt-2 mb-4">Messages are composed and logged</p>
          <div className="flex items-center gap-4">
            <span className="w-12 h-12 rounded-xl bg-mint-100 text-ink-700 grid place-items-center"><Inbox size={22} /></span>
            <div><div className="text-3xl font-medium text-ink-900 tabular-nums">{data.messagesSent30}</div><div className="caption">messages sent in 30 days</div></div>
          </div>
        </GlassCard>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard className="p-5"><SubHeading>Lead sources</SubHeading><Breakdown rows={data.bySource.map((row) => ({ label: titleize(row.id), value: row.count }))} empty="No lead sources yet." /></GlassCard>
        <GlassCard className="p-5"><SubHeading>By branch</SubHeading><Breakdown rows={data.byBranch.map((row) => ({ label: branchName(row.id), value: row.count }))} empty="No branch data yet." /></GlassCard>
        <GlassCard className="p-5"><SubHeading>Treatment interest</SubHeading><Breakdown rows={data.byTreatment.map((row) => ({ label: titleize(row.id), value: row.count }))} empty="No treatment interests yet." /></GlassCard>
      </div>

      <GlassCard className="p-5">
        <SubHeading action={<Link href="/crm/inbox" className="text-xs text-mint-600 font-medium">Open inbox →</Link>}>Recent messages</SubHeading>
        {data.recentMessages.length === 0 ? <p className="caption">No messages yet.</p> : (
          <div className="divide-y divide-ink-100">
            {data.recentMessages.slice(0, 5).map((message) => (
              <Link key={message.id} href="/crm/inbox" className="flex items-start gap-3 py-3 first:pt-0 last:pb-0 group">
                <span className="mt-0.5 w-8 h-8 rounded-full bg-mint-50 text-mint-700 flex items-center justify-center shrink-0"><Inbox size={14} /></span>
                <span className="min-w-0 flex-1"><span className="flex justify-between gap-3"><span className="text-sm font-medium text-ink-900 group-hover:text-mint-700">{message.name}</span><span className="text-[11px] text-ink-400 whitespace-nowrap">{relativeTime(message.at)}</span></span><span className="caption block truncate mt-0.5">{message.body}</span></span>
              </Link>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function relativeTime(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function OverviewMetric({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <GlassCard className="p-5 flex items-center gap-4">
      <span className="w-11 h-11 rounded-xl bg-mint-100 text-mint-500 grid place-items-center shrink-0">{icon}</span>
      <span><span className="block text-2xl font-medium leading-none text-ink-900 tabular-nums">{value}</span><span className="caption block mt-1.5">{label}</span></span>
    </GlassCard>
  );
}

function NonOwnerOverview() {
  return (
    <div className="space-y-4">
      <SectionTitle title="CRM" sub="Your leads, follow-ups and conversations" />
      <div className="grid sm:grid-cols-3 gap-3">
        <NavCard href="/crm/followups" title="Follow-ups" body="What is due today, and what is overdue." />
        <NavCard href="/crm/inbox" title="Shared inbox" body="Patient conversations assigned to the team." />
        <NavCard href="/crm/patients" title="Contacts" body="Search leads and patients, and their history." />
      </div>
      <p className="caption">Clinic-wide analytics are limited to the owner and administrators.</p>
    </div>
  );
}

function NavCard({ href, title, body }: { href: string; title: string; body: string }) {
  return <Link href={href} className="glass card-hover p-5 block"><div className="font-medium text-ink-900">{title}</div><p className="caption mt-1">{body}</p></Link>;
}
