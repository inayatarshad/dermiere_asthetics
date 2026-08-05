"use client";

/**
 * Templates - the four messages the CRM sends on its own, plus any the
 * clinic has written by hand.
 *
 * This screen used to be "CRM settings" and showed each template as
 * `category · language · approval status`. All three were provider
 * bookkeeping: the clinic cannot act on "utility", every message is in
 * English, and "approved" is a local record until a real WhatsApp Business
 * account is connected, at which point Meta decides it anyway.
 *
 * What a person actually needs to know is what makes a message go out and
 * whether it is on, so the trigger leads each card. The Meta fields are
 * still stored - nothing here changes the schema - they are simply not the
 * headline.
 *
 * "Sent" is counted from completed follow-ups of the matching type: the
 * number of times the automation has really used this template, not a
 * figure invented for the card.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BellRing,
  CalendarCheck,
  MapPin,
  MessageSquareQuote,
  RefreshCw,
  Star,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  fetchConversations,
  fetchFollowUps,
  dateTime,
  type ConversationsResponse,
} from "@/lib/crm/client";
import type { MessageTemplate } from "@/lib/crm/types";
import { EmptyState, SectionTitle, Spinner } from "@/components/ui";

/**
 * What fires each of the four automations.
 *
 * Presentation only, and keyed by the template's stored `name`, so adding a
 * hand-written template simply falls through to "Sent by hand". The stages
 * mirror the mapping in the seed and in crmAutomation.ts; if that mapping
 * changes, this is the one place the wording follows.
 */
const AUTOMATION: Record<
  string,
  { label: string; fires: string; icon: LucideIcon }
> = {
  booking_confirmation: {
    label: "Booking confirmation",
    fires: "a lead reaches Consultation booked or Rebooked",
    icon: CalendarCheck,
  },
  appointment_reminder: {
    label: "Appointment reminder",
    fires: "a booking reaches Confirmed",
    icon: BellRing,
  },
  follow_up_consultation: {
    label: "Follow-up consultation",
    fires: "a patient reaches Follow-up",
    icon: MessageSquareQuote,
  },
  feedback_request: {
    label: "Feedback request",
    fires: "a patient has Visited",
    icon: Star,
  },
};

type Filter = "all" | "automated" | "custom";

/** Turn a stored name like `booking_confirmation` into a readable title. */
const titleOf = (t: MessageTemplate) =>
  AUTOMATION[t.name]?.label ??
  t.name.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Render the stored body with its numbered placeholders swapped for the
 * variable they stand for, so `{{1}}` reads as `{{patient_name}}`.
 * The stored body is untouched; this is display only.
 */
function readableBody(t: MessageTemplate): string {
  return t.body.replace(/\{\{(\d+)\}\}/g, (whole, n) => {
    const name = t.variables[Number(n) - 1];
    return name ? `{{${name}}}` : whole;
  });
}

export default function CrmTemplatesPage() {
  const [data, setData] = useState<ConversationsResponse | null>(null);
  /** Completed follow-ups per type: how often each template really went out. */
  const [sentByType, setSentByType] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    const [conv, fu] = await Promise.all([
      fetchConversations(),
      fetchFollowUps().catch(() => null),
    ]);
    const counts: Record<string, number> = {};
    for (const f of fu?.followUps ?? []) {
      if (f.status === "completed") counts[f.type] = (counts[f.type] ?? 0) + 1;
    }
    setSentByType(counts);
    setData(conv);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [conv, fu] = await Promise.all([
        fetchConversations(),
        fetchFollowUps().catch(() => null),
      ]);
      if (cancelled) return;
      const counts: Record<string, number> = {};
      for (const f of fu?.followUps ?? []) {
        if (f.status === "completed") counts[f.type] = (counts[f.type] ?? 0) + 1;
      }
      setSentByType(counts);
      setData(conv);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const templates = useMemo(() => data?.templates ?? [], [data]);
  const branches = data?.branches ?? [];

  const shown = useMemo(() => {
    if (filter === "automated") return templates.filter((t) => AUTOMATION[t.name]);
    if (filter === "custom") return templates.filter((t) => !AUTOMATION[t.name]);
    return templates;
  }, [templates, filter]);

  const automatedCount = templates.filter((t) => AUTOMATION[t.name]).length;

  if (loading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Templates"
        sub={`${templates.length} message${templates.length === 1 ? "" : "s"} · ${automatedCount} sent automatically`}
        action={
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setLoading(true);
              void load();
            }}
            aria-label="Refresh"
          >
            <RefreshCw size={15} />
          </button>
        }
      />

      {/* --- filters --- */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["all", `All ${templates.length}`],
            ["automated", `Automated ${automatedCount}`],
            ["custom", `Written by hand ${templates.length - automatedCount}`],
          ] as Array<[Filter, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            className={`chip ${filter === id ? "chip-active" : ""}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<MessageSquareQuote size={22} />}
          title="Nothing here yet"
          body="The four pipeline automations write their own messages. Anything the clinic adds by hand appears alongside them."
        />
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {shown.map((t) => {
            const auto = AUTOMATION[t.name];
            const Icon = auto?.icon ?? MessageSquareQuote;
            const sent = sentByType[t.name] ?? 0;
            return (
              <article key={t.id} className="glass p-5 flex flex-col gap-4">
                {/* --- who this is --- */}
                <header className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-xl bg-mint-100 text-[color:var(--mint-500)] flex items-center justify-center shrink-0">
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-medium text-ink-900 leading-snug">
                      {titleOf(t)}
                    </h3>
                    <p className="text-xs text-ink-400 mt-0.5">
                      {sent > 0
                        ? `Sent ${sent} time${sent === 1 ? "" : "s"}`
                        : "Not sent yet"}
                      {" · "}
                      Added {dateTime(t.created_at)}
                    </p>
                  </div>
                  {/* On/off is the one piece of state worth seeing at a
                      glance, so it reads as a state, not a control that
                      does nothing. */}
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0 ${
                      auto
                        ? "bg-mint-100 text-[color:var(--mint-600,var(--mint-500))]"
                        : "bg-[rgba(28,26,22,0.06)] text-ink-400"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        auto ? "bg-[color:var(--mint-500)]" : "bg-ink-400"
                      }`}
                    />
                    {auto ? "Active" : "Manual"}
                  </span>
                </header>

                {/* --- the trigger, which is the point of the card --- */}
                <p className="flex items-start gap-2 text-[13px] text-ink-700">
                  <Zap
                    size={14}
                    className="text-[color:var(--mint-500)] shrink-0 mt-0.5"
                  />
                  <span>
                    {auto ? (
                      <>
                        Fires on its own when{" "}
                        <strong className="font-medium text-ink-900">
                          {auto.fires}
                        </strong>
                        .
                      </>
                    ) : (
                      "Sent by hand from a conversation."
                    )}
                  </span>
                </p>

                {/* --- the message itself --- */}
                <div className="glass-subtle rounded-xl px-4 py-3.5 flex-1">
                  <p className="text-[13px] leading-relaxed text-ink-700 whitespace-pre-line">
                    {readableBody(t)}
                  </p>
                </div>

                {/* --- merge fields --- */}
                {t.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {t.variables.map((v) => (
                      <code
                        key={v}
                        className="text-[11px] px-2 py-1 rounded-lg bg-[rgba(28,26,22,0.05)] text-ink-700"
                      >
                        {`{{${v}}}`}
                      </code>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <p className="caption">
        Merge fields are filled from the patient and the booking as the
        message goes out. With no WhatsApp Business account connected, sends
        are recorded in the conversation rather than delivered.
      </p>

      {/* --- branches, unchanged: the CRM reads them, Settings owns them --- */}
      {branches.length > 0 && (
        <div className="glass p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-medium text-ink-900">Branches</h3>
            <Link href="/settings" className="text-xs text-mint-600 font-medium">
              Manage in Settings →
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {branches.map((b) => (
              <div key={b.id} className="glass-subtle p-3">
                <div className="flex items-center gap-1.5">
                  <MapPin size={13} className="text-ink-400" />
                  <span className="font-medium text-sm text-ink-900">{b.name}</span>
                </div>
                <p className="text-xs text-ink-700 mt-1">
                  {b.address}, {b.city}
                </p>
                {b.doctor && (
                  <p className="text-[11px] text-ink-400 mt-0.5">{b.doctor}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
