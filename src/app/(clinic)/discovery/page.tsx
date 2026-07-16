"use client";

/**
 * Brand Discovery — admin dashboard for the WhatsApp intake portal
 * (spec: Brand-Discovery-Portal-BUILD-SPEC.md §9/§12).
 * Create per-doctor invite links, share them on WhatsApp, watch the
 * sent -> opened -> completed funnel, read every response, export CSV.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link2,
  MessageCircle,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Download,
  Check,
  Eye,
  Send,
} from "lucide-react";
import { useStore, useSessionUser, can } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import type {
  PortalInvite,
  PortalResponse,
} from "@/lib/server/portalStore";
import {
  GlassCard,
  EmptyState,
  Field,
  Modal,
  SectionTitle,
  Spinner,
  StatCard,
} from "@/components/ui";

const LABELS: Record<string, string> = {
  phone_calls: "phone calls",
  instagram_dms: "instagram DMs",
  walk_ins: "walk-ins",
  front_desk: "front desk",
  missed_calls: "missed calls",
  no_shows: "no-shows",
  front_desk_load: "front-desk load",
  new_patients: "getting new patients",
  vybero: "VYBERO (AI call answering)",
  contour_3d: "Clinic OS (3D consult)",
  ai_report: "free AI aesthetic report",
  website_branding: "website & branding",
  chorus_ugc: "Chorus (UGC marketing)",
  none: "none yet",
  under_50k: "under 50k",
  "50_150k": "50–150k",
  over_150k: "150k+",
};
const label = (v?: string) => (v ? (LABELS[v] ?? v) : "—");

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-white/60 text-ink-400",
  OPENED: "bg-amber-100 text-amber-900",
  COMPLETED: "bg-mint-500 text-white",
};

function waShare(doctorName: string | undefined, link: string): string {
  const name = doctorName ? ` ${doctorName.replace(/^dr\.?\s*/i, "dr ")}` : "";
  const text = `hi${name}, here's the quick form i mentioned, takes about two minutes:\n${link}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export default function DiscoveryPage() {
  const mounted = useMounted();
  const user = useSessionUser();
  const clinic = useStore((s) => s.clinic);
  void clinic;

  const [invites, setInvites] = useState<PortalInvite[]>([]);
  const [responses, setResponses] = useState<PortalResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<PortalInvite | null>(null);
  const [detail, setDetail] = useState<PortalResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [clinicName, setClinicName] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [city, setCity] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/portal/invites", { cache: "no-store" });
      const data = (await res.json()) as {
        invites?: PortalInvite[];
        responses?: PortalResponse[];
        message?: string;
      };
      if (!res.ok) {
        setLoadError(data.message ?? "Could not load invites.");
      } else {
        setInvites(data.invites ?? []);
        setResponses(data.responses ?? []);
      }
    } catch {
      setLoadError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted && user) void refresh();
  }, [mounted, user, refresh]);

  const linkFor = (invite: PortalInvite) =>
    `${window.location.origin}/portal/${invite.token}`;

  const copy = async (invite: PortalInvite) => {
    await navigator.clipboard.writeText(linkFor(invite)).catch(() => {});
    setCopied(invite.id);
    setTimeout(() => setCopied(null), 1600);
  };

  const create = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/portal/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clinicName: clinicName.trim() || undefined,
          doctorName: doctorName.trim() || undefined,
          city: city.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { invite?: PortalInvite };
      if (res.ok && data.invite) {
        setCreated(data.invite);
        setClinicName("");
        setDoctorName("");
        setCity("");
        void refresh();
      }
    } finally {
      setCreating(false);
    }
  };

  const responseFor = (invite: PortalInvite) =>
    responses.find((r) => r.inviteId === invite.id) ?? null;

  const funnel = useMemo(() => {
    const sent = invites.length;
    const opened = invites.filter((i) => i.status !== "PENDING").length;
    const completed = invites.filter((i) => i.status === "COMPLETED").length;
    return {
      sent,
      opened,
      completed,
      rate: sent > 0 ? Math.round((completed / sent) * 100) : 0,
    };
  }, [invites]);

  const exportCsv = () => {
    const cols = [
      "createdAt", "clinicName", "doctorName", "cityArea", "whatsapp",
      "instagram", "website", "patientsPerDay", "monthlyBudget",
      "bookingMethods", "painPoints", "interests", "servicesInDemand",
      "helpNotes",
    ] as const;
    const esc = (v: unknown) => {
      const s = Array.isArray(v) ? v.join("; ") : String(v ?? "");
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csv = [
      cols.join(","),
      ...responses.map((r) => cols.map((c) => esc(r[c])).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `brand-discovery-responses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  if (!mounted) return null;
  if (!can.manageUsers(user?.role)) {
    return (
      <div className="pt-4">
        <EmptyState
          icon={<ShieldCheck size={28} />}
          title="Admin access required"
          body="Brand Discovery invites are managed by the clinic administrator role."
        />
      </div>
    );
  }

  return (
    <div className="fade-up">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <SectionTitle
          title="Brand Discovery"
          sub="Send a doctor a private WhatsApp link, watch it come back as a structured proposal brief"
        />
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => void refresh()}>
            <RefreshCcw size={14} />
            Refresh
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={exportCsv}
            disabled={responses.length === 0}
          >
            <Download size={14} />
            Export CSV
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <Plus size={15} />
            New invite
          </button>
        </div>
      </div>

      {/* funnel */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Send size={17} />} label="Invites sent" value={String(funnel.sent)} />
        <StatCard icon={<Eye size={17} />} label="Opened" value={String(funnel.opened)} />
        <StatCard icon={<Check size={17} />} label="Completed" value={String(funnel.completed)} />
        <StatCard icon={<MessageCircle size={17} />} label="Completion rate" value={`${funnel.rate}%`} />
      </div>

      {/* invites table */}
      <GlassCard className="p-5 mt-4">
        <h3 className="h2 text-ink-900 mb-3">Invites</h3>
        {loading && <Spinner />}
        {loadError && <p className="text-sm text-warning">{loadError}</p>}
        {!loading && !loadError && invites.length === 0 && (
          <p className="caption">
            No invites yet. Create one and share the link on WhatsApp.
          </p>
        )}
        {!loading && invites.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left caption border-b border-white/60">
                  <th className="py-2 pr-3 font-medium">Doctor / clinic</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Created</th>
                  <th className="py-2 pr-3 font-medium">Completed</th>
                  <th className="py-2 pr-0 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((invite) => {
                  const resp = responseFor(invite);
                  return (
                    <tr key={invite.id} className="border-b border-white/40 last:border-0">
                      <td className="py-2.5 pr-3">
                        <span className="font-medium text-ink-900">
                          {invite.doctorName || resp?.doctorName || "—"}
                        </span>
                        <span className="caption block">
                          {invite.clinicName || resp?.clinicName || "unnamed clinic"}
                          {invite.city ? ` · ${invite.city}` : ""}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[invite.status]}`}
                        >
                          {invite.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 caption whitespace-nowrap">
                        {new Date(invite.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                      </td>
                      <td className="py-2.5 pr-3 caption whitespace-nowrap">
                        {invite.completedAt
                          ? new Date(invite.completedAt).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                            })
                          : "—"}
                      </td>
                      <td className="py-2.5 pr-0">
                        <span className="flex gap-1.5 justify-end">
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => void copy(invite)}
                            title="Copy the private link"
                          >
                            {copied === invite.id ? (
                              <Check size={14} className="text-mint-500" />
                            ) : (
                              <Link2 size={14} />
                            )}
                          </button>
                          <a
                            className="btn btn-ghost btn-sm"
                            href={waShare(invite.doctorName, linkFor(invite))}
                            target="_blank"
                            rel="noreferrer"
                            title="Share on WhatsApp"
                          >
                            <MessageCircle size={14} />
                          </a>
                          {resp && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setDetail(resp)}
                            >
                              View
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* create invite */}
      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setCreated(null);
        }}
        title="New discovery invite"
      >
        {!created ? (
          <div className="space-y-3">
            <p className="caption">
              Everything is optional; whatever you prefill appears in the
              doctor&rsquo;s form so the link feels personal.
            </p>
            <Field label="Doctor name">
              <input
                className="input"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="Dr Anusha"
                autoFocus
              />
            </Field>
            <Field label="Clinic / brand name">
              <input
                className="input"
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                placeholder="Dermiére"
              />
            </Field>
            <Field label="City & area">
              <input
                className="input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Islamabad, F-10"
              />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn btn-ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => void create()} disabled={creating}>
                {creating ? <Spinner className="w-4 h-4" /> : <Plus size={15} />}
                Create link
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-700">
              Link ready{created.doctorName ? ` for ${created.doctorName}` : ""}.
              Copy it or share straight to WhatsApp:
            </p>
            <code className="block text-xs bg-mint-100 rounded-xl px-3 py-2.5 break-all">
              {linkFor(created)}
            </code>
            <div className="flex gap-2 justify-end">
              <button className="btn btn-secondary" onClick={() => void copy(created)}>
                {copied === created.id ? <Check size={15} /> : <Link2 size={15} />}
                Copy link
              </button>
              <a
                className="btn btn-primary"
                href={waShare(created.doctorName, linkFor(created))}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={15} />
                Share on WhatsApp
              </a>
            </div>
          </div>
        )}
      </Modal>

      {/* response detail */}
      {detail && (
        <Modal
          open
          onClose={() => setDetail(null)}
          title={`${detail.doctorName} · ${detail.clinicName}`}
        >
          <div className="space-y-3 text-sm text-ink-700">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <div className="caption">City & area</div>
                {detail.cityArea ?? "—"}
              </div>
              <div>
                <div className="caption">WhatsApp</div>
                {detail.whatsapp ?? "—"}
              </div>
              <div>
                <div className="caption">Instagram</div>
                {detail.instagram ?? "—"}
              </div>
              <div>
                <div className="caption">Website</div>
                {detail.website ?? "—"}
              </div>
              <div>
                <div className="caption">Patients / day</div>
                {detail.patientsPerDay ?? "—"}
              </div>
              <div>
                <div className="caption">Marketing budget (PKR)</div>
                {label(detail.monthlyBudget)}
              </div>
            </div>
            <div>
              <div className="caption mb-1">How patients book</div>
              <div className="flex gap-1.5 flex-wrap">
                {detail.bookingMethods.length > 0
                  ? detail.bookingMethods.map((v) => (
                      <span key={v} className="chip chip-static text-[11px]">
                        {label(v)}
                      </span>
                    ))
                  : "—"}
              </div>
            </div>
            <div>
              <div className="caption mb-1">Biggest headaches</div>
              <div className="flex gap-1.5 flex-wrap">
                {detail.painPoints.length > 0
                  ? detail.painPoints.map((v) => (
                      <span key={v} className="chip chip-static text-[11px]">
                        {label(v)}
                      </span>
                    ))
                  : "—"}
              </div>
            </div>
            <div>
              <div className="caption mb-1">Wants in the proposal</div>
              <div className="flex gap-1.5 flex-wrap">
                {detail.interests.length > 0
                  ? detail.interests.map((v) => (
                      <span key={v} className="chip chip-static text-[11px]">
                        {label(v)}
                      </span>
                    ))
                  : "—"}
              </div>
            </div>
            {detail.servicesInDemand && (
              <div>
                <div className="caption">Services most in demand</div>
                <p>{detail.servicesInDemand}</p>
              </div>
            )}
            {detail.helpNotes && (
              <div>
                <div className="caption">Anything specific</div>
                <p>{detail.helpNotes}</p>
              </div>
            )}
            <p className="caption">
              Submitted{" "}
              {new Date(detail.createdAt).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · consented to contact
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
