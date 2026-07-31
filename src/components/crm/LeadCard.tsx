"use client";

/**
 * One person on the leads board.
 *
 * Ordered by what the front desk actually needs to know at a glance: who it
 * is, when they are coming in, what for, and how long since anyone spoke to
 * them. The stage control stays invisible until the card is hovered, so a
 * column reads as a list of people rather than a wall of dropdowns.
 */

import { CalendarDays } from "lucide-react";
import {
  PIPELINE_STAGES,
  TERMINAL_STAGES,
  type ContactStage,
  type CrmContact,
} from "@/lib/crm/types";
import { money, relativeTime, titleize } from "@/lib/crm/client";
import { formatPhone } from "@/lib/crm/phone";
import { Pill } from "./CrmUi";
import type { Appointment } from "@/lib/types";

/** Stage colour, drawn as a rule under each column heading. */
export function toneBar(tone: string): string {
  switch (tone) {
    case "violet":
      return "bg-violet-300";
    case "sky":
      return "bg-sky-300";
    case "amber":
      return "bg-amber-300";
    case "teal":
      return "bg-teal-300";
    case "green":
      return "bg-emerald-300";
    case "rose":
      return "bg-rose-300";
    default:
      return "bg-ink-400/30";
  }
}

/** Two-letter monogram, so a card is recognisable before it is read. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function LeadCard({
  contact,
  branchShort,
  staffName,
  appointment,
  busy,
  onOpen,
  onMove,
}: {
  contact: CrmContact;
  branchShort: (id?: string) => string;
  staffName: (id?: string) => string;
  appointment?: Appointment;
  busy: boolean;
  onOpen: () => void;
  onMove: (stage: ContactStage) => void;
}) {
  return (
    <article
      onClick={onOpen}
      className={`glass card-hover group p-3.5 cursor-pointer ${
        busy ? "opacity-60 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className="w-8 h-8 rounded-full bg-mint-100 text-[color:var(--mint-500)] text-[11px] font-semibold flex items-center justify-center shrink-0">
          {initials(contact.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink-900 truncate">
            {contact.name}
          </p>
          <p className="text-[11px] text-ink-400 tabular-nums">
            {formatPhone(contact.phone)}
          </p>
        </div>
        {contact.estimated_value ? (
          <span className="text-[11px] text-ink-700 tabular-nums shrink-0">
            {money(contact.estimated_value)}
          </span>
        ) : null}
      </div>

      {contact.treatment_interest.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5">
          {contact.treatment_interest.slice(0, 2).map((t) => (
            <Pill key={t} tone="teal">
              {titleize(t)}
            </Pill>
          ))}
        </div>
      )}

      {/* When they are actually coming in. The most useful line on the card,
          and the reason the board is worth looking at rather than a list. */}
      {appointment && (
        <p className="flex items-center gap-1.5 mt-2.5 text-[11px] text-ink-700">
          <CalendarDays size={12} className="text-ink-400 shrink-0" />
          {new Date(appointment.start).toLocaleString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-white/60">
        <span className="text-[11px] text-ink-400 truncate">
          {branchShort(contact.branch_id)} · {staffName(contact.assigned_to)}
        </span>
        <span className="text-[11px] text-ink-400 shrink-0">
          {relativeTime(contact.updated_at)}
        </span>
      </div>

      <select
        className="input input-xs mt-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        value={contact.stage}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onMove(e.target.value as ContactStage)}
        aria-label={`Move ${contact.name}`}
      >
        {[...PIPELINE_STAGES, ...TERMINAL_STAGES].map((st) => (
          <option key={st.id} value={st.id}>
            {st.label}
          </option>
        ))}
      </select>
    </article>
  );
}
