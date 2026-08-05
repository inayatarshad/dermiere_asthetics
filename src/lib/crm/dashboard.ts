/**
 * The Overview dashboard's numbers.
 *
 * Separate from analytics.ts on purpose. That file answers "how is the
 * business doing" over a chosen date range; this one answers "what does
 * today look like", which needs its own windows (the next seven days, the
 * last fourteen, the last thirty) that do not follow the range picker.
 *
 * The two rules from analytics.ts hold here as well: no invented metrics,
 * and a rate with no denominator is null rather than a confident 0%.
 * Everything is computed from rows the caller's clinic already owns.
 */

import type { Appointment, Invoice } from "@/lib/types";
import type { CrmContact, CrmConversation, CrmMessage } from "./types";
import { PIPELINE_STAGES, TERMINAL_STAGES } from "./types";

/** A rate as 0-100, or null when there is nothing to divide by. */
function rate(n: number, d: number): number | null {
  if (!d || d <= 0) return null;
  return (n / d) * 100;
}

const DAY = 86_400_000;

export interface DashboardDay {
  /** ISO date, midnight local, oldest first. */
  date: string;
  /** Consultations booked to start on this day. */
  booked: number;
  /** Appointments actually attended on this day. */
  visited: number;
  /** Messages the clinic sent on this day. */
  messages: number;
}

export interface FunnelStep {
  id: string;
  label: string;
  count: number;
  /**
   * Share of the step above, so the drop-off is visible where it happens.
   * Null on the first step, which has nothing to be a share of.
   */
  ofPrevious: number | null;
}

export interface RecentMessage {
  id: string;
  contactId?: string;
  name: string;
  body: string;
  at: string;
  direction: "inbound" | "outbound";
  state: string;
}

export interface CrmDashboard {
  /** Leads still working their way through the pipeline. */
  openLeads: number;
  totalLeads: number;
  /** Bookings starting between now and seven days out. */
  bookedNext7: number;
  /** Appointments attended in the last thirty days. */
  visited30: number;
  /** Value of open leads only, at the configured price of what they want. */
  pipelineValue: number;
  series: DashboardDay[];
  funnel: FunnelStep[];
  /** Did the people who booked actually come in? Ninety-day window. */
  attendance: {
    booked: number;
    attended: number;
    noShows: number;
    rate: number | null;
  };
  /** Visits that came back round: a rebooking is the loop closing. */
  rebooked30: number;
  messagesSent30: number;
  recentMessages: RecentMessage[];
  bySource: Array<{ id: string; count: number }>;
  byBranch: Array<{ id: string; count: number }>;
  byTreatment: Array<{ id: string; count: number }>;
}

export interface DashboardInput {
  contacts: CrmContact[];
  conversations: CrmConversation[];
  messages: CrmMessage[];
  appointments: Appointment[];
  invoices: Invoice[];
  /** Treatment id -> price, for the pipeline value. */
  prices: Record<string, number>;
  branchId?: string;
  now?: Date;
}

/** Local midnight for a timestamp, as an ISO string. */
function dayKey(iso: string): string {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function computeDashboard(input: DashboardInput): CrmDashboard {
  const now = input.now ?? new Date();
  const t = now.getTime();
  const b = input.branchId;

  const contacts = b
    ? input.contacts.filter((c) => c.branch_id === b)
    : input.contacts;
  const appointments = b
    ? input.appointments.filter((a) => a.location_id === b)
    : input.appointments;

  // Messages reach a branch through their conversation, so scope by that
  // rather than dropping the branch filter on this panel alone.
  const convById = new Map(input.conversations.map((c) => [c.id, c]));
  const messages = b
    ? input.messages.filter(
        (m) => convById.get(m.conversation_id)?.branch_id === b
      )
    : input.messages;

  const terminal = new Set<string>(TERMINAL_STAGES.map((s) => s.id));
  const open = contacts.filter((c) => !terminal.has(c.stage));

  // --- pipeline value ---------------------------------------------------
  // Open leads only. Counting won and lost leads alike would make the
  // figure grow forever and mean nothing.
  const pipelineValue = open.reduce((sum, c) => {
    if (typeof c.estimated_value === "number") return sum + c.estimated_value;
    const best = c.treatment_interest
      .map((id) => input.prices[id] ?? 0)
      .sort((x, y) => y - x)[0];
    return sum + (best ?? 0);
  }, 0);

  // --- the fourteen-day series -----------------------------------------
  const days: DashboardDay[] = [];
  const index = new Map<string, DashboardDay>();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(start.getTime() - i * DAY);
    const day: DashboardDay = {
      date: d.toISOString(),
      booked: 0,
      visited: 0,
      messages: 0,
    };
    days.push(day);
    index.set(day.date, day);
  }

  for (const a of appointments) {
    const day = index.get(dayKey(a.start));
    if (!day) continue;
    if (a.status !== "cancelled") day.booked++;
    if (a.status === "completed") day.visited++;
  }
  for (const m of messages) {
    if (m.direction !== "outbound" || m.internal) continue;
    const day = index.get(dayKey(m.created_at));
    if (day) day.messages++;
  }

  // --- the funnel -------------------------------------------------------
  // Every lead that reached a stage, counted at the furthest point it got
  // to, so the steps only ever narrow.
  const order = PIPELINE_STAGES.map((s) => s.id) as string[];
  const reachedAt = (stage: string) => order.indexOf(stage);
  const funnel: FunnelStep[] = PIPELINE_STAGES.map((s, i) => {
    const count = contacts.filter((c) => {
      const at = reachedAt(c.stage);
      return at >= i;
    }).length;
    return { id: s.id, label: s.label, count, ofPrevious: null as number | null };
  });
  for (let i = 1; i < funnel.length; i++) {
    funnel[i].ofPrevious = rate(funnel[i].count, funnel[i - 1].count);
  }

  // --- attendance, ninety days -----------------------------------------
  const since90 = t - 90 * DAY;
  const inWindow = appointments.filter((a) => {
    const at = new Date(a.start).getTime();
    return at >= since90 && at <= t;
  });
  const attended = inWindow.filter((a) => a.status === "completed").length;
  const noShows = inWindow.filter((a) => a.status === "no_show").length;
  const bookedForAttendance = inWindow.filter(
    (a) => a.status !== "cancelled"
  ).length;

  // --- thirty-day counts ------------------------------------------------
  const since30 = t - 30 * DAY;
  const within30 = (iso: string) => {
    const at = new Date(iso).getTime();
    return at >= since30 && at <= t;
  };

  const visited30 = appointments.filter(
    (a) => a.status === "completed" && within30(a.start)
  ).length;
  const rebooked30 = contacts.filter(
    (c) => c.stage === "rebooked" && within30(c.updated_at)
  ).length;
  const messagesSent30 = messages.filter(
    (m) => m.direction === "outbound" && !m.internal && within30(m.created_at)
  ).length;

  const next7 = appointments.filter((a) => {
    const at = new Date(a.start).getTime();
    return a.status !== "cancelled" && at >= t && at <= t + 7 * DAY;
  }).length;

  // --- recent conversation ----------------------------------------------
  const nameFor = new Map(contacts.map((c) => [c.id, c.name]));
  const recentMessages: RecentMessage[] = [...messages]
    .filter((m) => !m.internal)
    .sort((x, y) => y.created_at.localeCompare(x.created_at))
    .slice(0, 8)
    .map((m) => {
      const contactId = convById.get(m.conversation_id)?.contact_id;
      return {
        id: m.id,
        contactId,
        name: (contactId && nameFor.get(contactId)) || "Unknown contact",
        body: m.body,
        at: m.created_at,
        direction: m.direction,
        state: m.state,
      };
    });

  // --- breakdowns -------------------------------------------------------
  const tally = (values: string[]) => {
    const m = new Map<string, number>();
    for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m.entries()]
      .map(([id, count]) => ({ id, count }))
      .sort((x, y) => y.count - x.count);
  };

  return {
    openLeads: open.length,
    totalLeads: contacts.length,
    bookedNext7: next7,
    visited30,
    pipelineValue,
    series: days,
    funnel,
    attendance: {
      booked: bookedForAttendance,
      attended,
      noShows,
      rate: rate(attended, bookedForAttendance),
    },
    rebooked30,
    messagesSent30,
    recentMessages,
    bySource: tally(contacts.map((c) => c.source)),
    byBranch: tally(
      contacts.map((c) => c.branch_id).filter((x): x is string => !!x)
    ),
    byTreatment: tally(contacts.flatMap((c) => c.treatment_interest)),
  };
}
