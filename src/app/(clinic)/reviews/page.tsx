"use client";

/**
 * Reviews monitoring dashboard (§5.4 + §5.5) - where Rameez and Shah Rukh
 * watch the client voice: scores over time, by location and treatment,
 * low scores flagged for follow-up, the invite funnel and the Capture
 * Circle economy (issued vs redeemed). Server truth via
 * GET /api/reviews/invites, refreshed live.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Star,
  MessageSquareHeart,
  AlertTriangle,
  Ticket,
  RefreshCw,
  Send,
  MapPin,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { StatCard, EmptyState, Spinner, Modal } from "@/components/ui";
import { findTreatment, CAPTURE_LOCATIONS } from "@/lib/capture/kb";
import type { ClinicReview, Reward, ReviewInvite } from "@/lib/types";

interface Data {
  invites: ReviewInvite[];
  reviews: ClinicReview[];
  rewards: Reward[];
}

const locShort = (id: string) =>
  CAPTURE_LOCATIONS.find((l) => l.id === id)?.short ?? id.replace(/-/g, " ");

const treatShort = (id: string) =>
  findTreatment(id)?.short ?? id.replace(/-/g, " ");

function Stars({ n, size = 13 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          fill={i <= n ? "#C4A15A" : "transparent"}
          color={i <= n ? "#C4A15A" : "#C9C2B2"}
          strokeWidth={1.5}
        />
      ))}
    </span>
  );
}

export default function ReviewsPage() {
  const mounted = useMounted();
  const patients = useStore((s) => s.patients);
  const locations = useStore((s) => s.locations);
  const users = useStore((s) => s.users);
  const sessionUserId = useStore((s) => s.sessionUserId);
  const me = users.find((u) => u.id === sessionUserId);

  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [locFilter, setLocFilter] = useState<string>("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  // Empty means "not chosen"; falls back to the clinic's first site.
  const [pickedInviteLoc, setPickedInviteLoc] = useState("");
  const inviteLoc = pickedInviteLoc || locations[0]?.id || "";
  const [inviteBusy, setInviteBusy] = useState(false);

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/reviews/invites", { cache: "no-store" });
      if (res.ok) {
        const d = (await res.json()) as Data & { ok: boolean };
        setData({ invites: d.invites ?? [], reviews: d.reviews ?? [], rewards: d.rewards ?? [] });
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const reviews = useMemo(
    () =>
      (data?.reviews ?? []).filter(
        (r) => locFilter === "all" || r.location_id === locFilter
      ),
    [data, locFilter]
  );

  const kpis = useMemo(() => {
    const n = reviews.length;
    const avg = n ? reviews.reduce((s, r) => s + r.rating, 0) / n : 0;
    const five = reviews.filter((r) => r.rating === 5).length;
    const low = reviews.filter((r) => r.rating <= 3 && !r.followed_up).length;
    const rewards = data?.rewards ?? [];
    return {
      n,
      avg: avg.toFixed(1),
      fivePct: n ? Math.round((five / n) * 100) : 0,
      low,
      issued: rewards.length,
      redeemed: rewards.filter((r) => r.status === "redeemed").length,
    };
  }, [reviews, data]);

  // rating trend: last 6 weeks, avg per week
  const trend = useMemo(() => {
    const weeks: { label: string; sum: number; n: number }[] = [];
    for (let w = 5; w >= 0; w--) {
      const start = new Date();
      start.setDate(start.getDate() - w * 7 - 6);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      weeks.push({
        label: `${start.getDate()}/${start.getMonth() + 1}`,
        sum: 0,
        n: 0,
      });
      for (const r of reviews) {
        const at = new Date(r.created_at);
        if (at >= start && at < end) {
          weeks[weeks.length - 1].sum += r.rating;
          weeks[weeks.length - 1].n++;
        }
      }
    }
    return weeks.map((w) => ({ label: w.label, avg: w.n ? w.sum / w.n : null, n: w.n }));
  }, [reviews]);

  const byTreatment = useMemo(() => {
    const m = new Map<string, { sum: number; n: number }>();
    for (const r of reviews) {
      for (const t of r.treatments.length ? r.treatments : ["other"]) {
        const e = m.get(t) ?? { sum: 0, n: 0 };
        e.sum += r.rating;
        e.n++;
        m.set(t, e);
      }
    }
    return [...m.entries()]
      .map(([id, { sum, n }]) => ({ id, avg: sum / n, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 6);
  }, [reviews]);

  const byLocation = useMemo(() => {
    const m = new Map<string, { sum: number; n: number }>();
    for (const r of data?.reviews ?? []) {
      const e = m.get(r.location_id) ?? { sum: 0, n: 0 };
      e.sum += r.rating;
      e.n++;
      m.set(r.location_id, e);
    }
    return [...m.entries()]
      .map(([id, { sum, n }]) => ({ id, avg: sum / n, n }))
      .sort((a, b) => b.n - a.n);
  }, [data]);

  const funnel = useMemo(() => {
    const invites = data?.invites ?? [];
    const sent = invites.length;
    const opened = invites.filter((i) => i.status !== "PENDING").length;
    const completed = invites.filter((i) => i.status === "COMPLETED").length;
    return { sent, opened, completed, rate: sent ? Math.round((completed / sent) * 100) : 0 };
  }, [data]);

  const createInvite = async () => {
    if (!inviteName.trim() || inviteBusy) return;
    setInviteBusy(true);
    try {
      const patient = patients.find(
        (p) => p.name.toLowerCase() === inviteName.trim().toLowerCase()
      );
      const res = await fetch("/api/reviews/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: patient?.id,
          patient_name: inviteName.trim(),
          location_id: inviteLoc,
          treatments: [],
          staff_name: me?.name,
        }),
      });
      const d = (await res.json()) as { ok?: boolean; url?: string };
      if (d.ok && d.url) {
        setInviteUrl(d.url);
        void load();
      }
    } finally {
      setInviteBusy(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-center gap-3 mb-5 fade-up">
        <h1 className="h1 flex items-center gap-2.5">
          <MessageSquareHeart size={22} className="text-[color:var(--mint-500)]" />
          Reviews &amp; Capture Circle
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setInviteOpen(true)} className="btn btn-primary btn-sm">
            <Send size={14} /> New review link
          </button>
          <button onClick={() => void load()} className="btn btn-ghost btn-sm" disabled={busy}>
            {busy ? <Spinner className="w-3.5 h-3.5" /> : <RefreshCw size={14} />}
          </button>
        </div>
      </div>

      {/* location filter */}
      <div className="flex flex-wrap gap-1.5 mb-4 fade-up">
        <button onClick={() => setLocFilter("all")} className={`chip ${locFilter === "all" ? "chip-active" : ""}`}>
          All locations
        </button>
        {(locations.length ? locations : CAPTURE_LOCATIONS).map((l) => (
          <button key={l.id} onClick={() => setLocFilter(l.id)} className={`chip ${locFilter === l.id ? "chip-active" : ""}`}>
            <MapPin size={12} /> {l.short}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5 fade-up-1">
        <StatCard label="Average rating" value={kpis.avg} icon={<Star size={18} />} accent />
        <StatCard label="Reviews" value={kpis.n} icon={<MessageSquareHeart size={18} />} />
        <StatCard label="5-star share" value={`${kpis.fivePct}%`} />
        <StatCard label="Needs follow-up" value={kpis.low} icon={<AlertTriangle size={18} />} />
        <StatCard label="Rewards (redeemed)" value={`${kpis.issued} (${kpis.redeemed})`} icon={<Ticket size={18} />} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-5">
        {/* trend */}
        <div className="glass p-5 fade-up-1">
          <div className="field-label">Rating trend · 6 weeks</div>
          <div className="flex items-end gap-2 h-32 mt-3">
            {trend.map((w, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full flex flex-col justify-end h-24">
                  <div
                    className="w-full rounded-t-md"
                    style={{
                      height: w.avg ? `${(w.avg / 5) * 100}%` : "3px",
                      background: w.avg
                        ? "linear-gradient(180deg, #D4B878, #C4A15A)"
                        : "rgba(28,26,22,0.08)",
                    }}
                    title={w.avg ? `${w.avg.toFixed(1)} (${w.n})` : "no reviews"}
                  />
                </div>
                <span className="text-[10px] text-ink-400">{w.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* by treatment */}
        <div className="glass p-5 fade-up-2">
          <div className="field-label">By treatment</div>
          <div className="space-y-2.5 mt-3">
            {byTreatment.length === 0 && <p className="caption">No reviews yet.</p>}
            {byTreatment.map((t) => (
              <div key={t.id}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-ink-900">{treatShort(t.id)}</span>
                  <span className="tabular-nums text-ink-700">
                    {t.avg.toFixed(1)} · {t.n}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[rgba(28,26,22,0.07)] mt-1 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(t.avg / 5) * 100}%`, background: "#C4A15A" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* by location + funnel */}
        <div className="glass p-5 fade-up-3">
          <div className="field-label">By location</div>
          <div className="space-y-2 mt-3">
            {byLocation.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-sm">
                <span className="text-ink-900">{locShort(l.id)}</span>
                <span className="inline-flex items-center gap-2">
                  <Stars n={Math.round(l.avg)} />
                  <span className="tabular-nums text-ink-700 w-14 text-right">
                    {l.avg.toFixed(1)} · {l.n}
                  </span>
                </span>
              </div>
            ))}
            {byLocation.length === 0 && <p className="caption">No reviews yet.</p>}
          </div>
          <div className="mt-4 pt-3 border-t border-[rgba(28,26,22,0.08)]">
            <div className="field-label">Invite funnel</div>
            <div className="flex items-center gap-3 text-sm mt-1.5">
              <Funnel label="Sent" v={funnel.sent} />
              <Funnel label="Opened" v={funnel.opened} />
              <Funnel label="Completed" v={funnel.completed} />
              <span className="ml-auto chip chip-static">{funnel.rate}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* review stream */}
      <div className="glass p-5 fade-up-3">
        <div className="field-label mb-3">Latest reviews</div>
        {reviews.length === 0 ? (
          <EmptyState
            icon={<MessageSquareHeart size={26} />}
            title="No reviews here yet"
            body="Close a sale in the Point of Sale and send the review link - submissions appear live."
          />
        ) : (
          <div className="space-y-2.5">
            {reviews.slice(0, 14).map((r) => (
              <div
                key={r.id}
                className={`rounded-xl px-4 py-3 ${
                  r.rating <= 3
                    ? "bg-[rgba(200,96,96,0.06)] border border-[rgba(200,96,96,0.25)]"
                    : "bg-white/50 border border-[rgba(28,26,22,0.06)]"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Stars n={r.rating} />
                  <span className="text-sm font-medium text-ink-900">{r.patient_name}</span>
                  <span className="text-[11px] text-ink-400">
                    {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    {" · "}
                    {locShort(r.location_id)}
                  </span>
                  {r.treatments.map((t) => (
                    <span key={t} className="rb-chip !text-[10.5px]">
                      {treatShort(t)}
                    </span>
                  ))}
                  {r.rating <= 3 && (
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-danger">
                      <AlertTriangle size={12} /> Follow up
                    </span>
                  )}
                </div>
                {r.comment && (
                  <p className="text-[13px] text-ink-700 mt-1.5 leading-relaxed">{r.comment}</p>
                )}
                {r.highlights.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {r.highlights.map((h) => (
                      <span key={h} className="text-[10.5px] text-[#8A6F35] bg-[rgba(196,161,90,0.1)] rounded-full px-2 py-0.5">
                        {h}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* new invite modal */}
      <Modal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setInviteUrl(null);
          setInviteName("");
        }}
        title="New review link"
      >
        {inviteUrl ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-700">Link created - share it on WhatsApp:</p>
            <p className="text-[12px] bg-mint-100 rounded-lg px-3 py-2 break-all">{inviteUrl}</p>
            <a
              className="btn btn-primary w-full"
              target="_blank"
              href={`https://wa.me/?text=${encodeURIComponent(
                `Thank you for visiting CAPTURE! We would love to hear about your experience: ${inviteUrl} - your review earns a Capture Circle reward.`
              )}`}
            >
              Share via WhatsApp
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <span className="field-label">Client name</span>
              <input
                className="input"
                list="review-patients"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Client name"
              />
              <datalist id="review-patients">
                {patients.map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </div>
            <div>
              <span className="field-label">Location</span>
              <select className="input" value={inviteLoc} onChange={(e) => setPickedInviteLoc(e.target.value)}>
                {(locations.length ? locations : CAPTURE_LOCATIONS).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => void createInvite()}
              disabled={inviteBusy || !inviteName.trim()}
              className="btn btn-primary w-full"
            >
              {inviteBusy ? <Spinner className="w-4 h-4" /> : <Send size={15} />} Create link
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Funnel({ label, v }: { label: string; v: number }) {
  return (
    <span className="inline-flex flex-col">
      <span className="tabular-nums font-semibold text-ink-900">{v}</span>
      <span className="text-[10.5px] text-ink-400">{label}</span>
    </span>
  );
}
