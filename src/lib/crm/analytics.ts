/**
 * CRM analytics - every number on the owner dashboard is computed here.
 *
 * Two rules run through this file:
 *
 *  1. No invented metrics. A rate whose denominator is zero is `null`, not 0
 *     and not 100 - the UI renders "-" and says why. `rate()` is the only
 *     place a division happens, so a divide-by-zero cannot slip in.
 *  2. Definitions are stated once. "Returning patient" means a patient with
 *     at least RETURNING_VISIT_THRESHOLD completed visits, and that constant
 *     is used by every metric that mentions returning patients.
 */

import type { Appointment, Invoice, Patient } from "@/lib/types";
import type {
  CrmContact,
  CrmConversation,
  CrmFeedback,
  CrmFollowUp,
  CrmMessage,
} from "./types";
import {
  BOOKED_OR_BEYOND,
  LOW_RATING_THRESHOLD,
  WON_STAGES,
  followUpState,
} from "./types";

/** A patient is "returning" once they have this many completed visits. */
export const RETURNING_VISIT_THRESHOLD = 2;
/** A patient with no completed visit in this many days counts as inactive. */
export const INACTIVE_AFTER_DAYS = 180;

export interface DateRange {
  /** ISO date (inclusive). Undefined means "from the beginning". */
  from?: string;
  /** ISO date (inclusive). Undefined means "up to now". */
  to?: string;
}

/**
 * A rate as a 0-100 percentage, or null when there is nothing to divide by.
 * Null is meaningful: it tells the UI to show an empty state rather than a
 * confident-looking 0%.
 */
export function rate(numerator: number, denominator: number): number | null {
  if (!denominator || denominator <= 0) return null;
  return (numerator / denominator) * 100;
}

/** Mean of a list, or null when the list is empty. */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function inRange(iso: string | undefined, r: DateRange): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (r.from && t < new Date(r.from).getTime()) return false;
  // `to` is an inclusive day, so compare against its end.
  if (r.to && t > new Date(r.to).getTime() + 86_399_999) return false;
  return true;
}

export interface AnalyticsInput {
  contacts: CrmContact[];
  followUps: CrmFollowUp[];
  feedback: CrmFeedback[];
  conversations: CrmConversation[];
  messages: CrmMessage[];
  patients: Patient[];
  appointments: Appointment[];
  invoices: Invoice[];
  range: DateRange;
  /** Restrict every metric to one branch. Undefined = all branches. */
  branchId?: string;
  now?: Date;
}

// ---------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------

function scope(input: AnalyticsInput) {
  const { range, branchId } = input;
  const b = <T extends { branch_id?: string }>(rows: T[]) =>
    branchId ? rows.filter((r) => r.branch_id === branchId) : rows;

  const contacts = b(input.contacts);
  const followUps = b(input.followUps);
  const feedback = b(input.feedback);
  const conversations = b(input.conversations);

  const appointments = branchId
    ? input.appointments.filter((a) => a.location_id === branchId)
    : input.appointments;
  const invoices = branchId
    ? input.invoices.filter((i) => i.location_id === branchId)
    : input.invoices;

  // The patient registry is authoritative for a patient's home branch.
  // Fall back to the CRM contact only for older rows created before patients
  // carried branch_id, so CRM analytics mirrors Clinic OS without rewriting it.
  const patientBranch = new Map<string, string | undefined>();
  for (const p of input.patients) {
    patientBranch.set(p.id, p.branch_id);
  }
  for (const c of input.contacts) {
    if (c.patient_id && !patientBranch.get(c.patient_id)) {
      patientBranch.set(c.patient_id, c.branch_id);
    }
  }
  const patients = branchId
    ? input.patients.filter((p) => patientBranch.get(p.id) === branchId)
    : input.patients;

  return {
    contacts,
    followUps,
    feedback,
    conversations,
    appointments,
    invoices,
    patients,
    range,
    patientBranch,
  };
}

// ---------------------------------------------------------------------
// Metric groups
// ---------------------------------------------------------------------

export interface PatientMetrics {
  total: number;
  newInRange: number;
  returning: number;
  retentionRate: number | null;
  inactive: number;
  byBranch: Array<{ branch_id: string | undefined; count: number }>;
}

export interface LeadMetrics {
  newLeads: number;
  awaitingResponse: number;
  consultationBookings: number;
  leadToBookingRate: number | null;
  leadToPatientRate: number | null;
  won: number;
  lost: number;
  bySource: Array<{ source: string; count: number }>;
  byTreatment: Array<{ treatment: string; count: number }>;
  /** Hours from lead creation to first staff response; null when unknown. */
  avgFirstResponseHours: number | null;
  respondedCount: number;
}

export interface FollowUpMetrics {
  dueToday: number;
  pending: number;
  overdue: number;
  completed: number;
  cancelled: number;
  completionRate: number | null;
  byStaff: Array<{ staff_id: string | undefined; total: number; completed: number }>;
  byBranch: Array<{ branch_id: string | undefined; total: number; completed: number }>;
}

export interface FeedbackMetrics {
  count: number;
  avgOverall: number | null;
  avgBranch: number | null;
  avgDoctor: number | null;
  avgTreatment: number | null;
  responseRate: number | null;
  lowRatingCount: number;
  openRecovery: number;
  resolvedRecovery: number;
  byDoctor: Array<{ doctor_id: string | undefined; avg: number | null; count: number }>;
  byTreatment: Array<{ treatment_id: string | undefined; avg: number | null; count: number }>;
  trend: Array<{ month: string; avg: number | null; count: number }>;
}

export interface BranchMetrics {
  branch_id: string;
  leads: number;
  conversions: number;
  conversionRate: number | null;
  newPatients: number;
  returningPatients: number;
  appointmentsTotal: number;
  appointmentsCompleted: number;
  completionRate: number | null;
  noShows: number;
  noShowRate: number | null;
  followUpsTotal: number;
  followUpsCompleted: number;
  followUpCompletionRate: number | null;
  feedbackAvg: number | null;
  feedbackCount: number;
  revenue: number;
  revenueSupported: boolean;
  avgResponseHours: number | null;
  responseSupported: boolean;
}

export interface CrmAnalytics {
  patients: PatientMetrics;
  leads: LeadMetrics;
  followUps: FollowUpMetrics;
  feedback: FeedbackMetrics;
  branches: BranchMetrics[];
  generatedAt: string;
}

// ---------------------------------------------------------------------

function completedVisitsByPatient(appointments: Appointment[]) {
  const m = new Map<string, Appointment[]>();
  for (const a of appointments) {
    if (a.status !== "completed" || !a.patient_id) continue;
    const list = m.get(a.patient_id) ?? [];
    list.push(a);
    m.set(a.patient_id, list);
  }
  return m;
}

export function computeAnalytics(input: AnalyticsInput): CrmAnalytics {
  const now = input.now ?? new Date();
  const s = scope(input);
  const r = s.range;

  // --- patients ---------------------------------------------------------
  const visits = completedVisitsByPatient(s.appointments);
  const returningIds = new Set(
    [...visits.entries()]
      .filter(([, list]) => list.length >= RETURNING_VISIT_THRESHOLD)
      .map(([id]) => id)
  );
  const inactiveCutoff = now.getTime() - INACTIVE_AFTER_DAYS * 86_400_000;
  const inactive = s.patients.filter((p) => {
    const list = visits.get(p.id);
    if (!list || list.length === 0) return true;
    const last = Math.max(...list.map((a) => new Date(a.start).getTime()));
    return last < inactiveCutoff;
  }).length;

  const branchCounts = new Map<string | undefined, number>();
  for (const p of s.patients) {
    const b = s.patientBranch.get(p.id);
    branchCounts.set(b, (branchCounts.get(b) ?? 0) + 1);
  }

  const newPatients = s.patients.filter((p) => inRange(p.created_at, r)).length;

  const patients: PatientMetrics = {
    total: s.patients.length,
    newInRange: newPatients,
    returning: s.patients.filter((p) => returningIds.has(p.id)).length,
    retentionRate: rate(
      s.patients.filter((p) => returningIds.has(p.id)).length,
      s.patients.length
    ),
    inactive,
    byBranch: [...branchCounts.entries()].map(([branch_id, count]) => ({
      branch_id,
      count,
    })),
  };

  // --- leads ------------------------------------------------------------
  const leadsInRange = s.contacts.filter((c) => inRange(c.created_at, r));
  const awaiting = s.contacts.filter(
    (c) => c.stage === "consult_booked"
  ).length;
  const booked = leadsInRange.filter((c) =>
    BOOKED_OR_BEYOND.includes(c.stage)
  ).length;
  const won = leadsInRange.filter((c) => WON_STAGES.includes(c.stage)).length;
  const lost = leadsInRange.filter(
    (c) => c.stage === "cancelled" || c.stage === "no_show"
  ).length;

  const sourceCounts = new Map<string, number>();
  const treatmentCounts = new Map<string, number>();
  for (const c of leadsInRange) {
    sourceCounts.set(c.source, (sourceCounts.get(c.source) ?? 0) + 1);
    for (const t of c.treatment_interest ?? []) {
      treatmentCounts.set(t, (treatmentCounts.get(t) ?? 0) + 1);
    }
  }

  const responseHours = leadsInRange
    .filter((c) => c.first_response_at)
    .map(
      (c) =>
        (new Date(c.first_response_at!).getTime() -
          new Date(c.created_at).getTime()) /
        3_600_000
    )
    .filter((h) => h >= 0);

  const leads: LeadMetrics = {
    newLeads: leadsInRange.length,
    awaitingResponse: awaiting,
    consultationBookings: booked,
    leadToBookingRate: rate(booked, leadsInRange.length),
    leadToPatientRate: rate(won, leadsInRange.length),
    won,
    lost,
    bySource: [...sourceCounts.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
    byTreatment: [...treatmentCounts.entries()]
      .map(([treatment, count]) => ({ treatment, count }))
      .sort((a, b) => b.count - a.count),
    avgFirstResponseHours: mean(responseHours),
    respondedCount: responseHours.length,
  };

  // --- follow-ups -------------------------------------------------------
  // Follow-ups are filtered by due date: "what is on the desk in this
  // window", which is what a manager is actually asking.
  const fuInRange = s.followUps.filter((f) => inRange(f.due_at, r));
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86_399_999);

  const dueToday = s.followUps.filter((f) => {
    if (f.status !== "pending") return false;
    const t = new Date(f.due_at).getTime();
    return t >= startOfDay.getTime() && t <= endOfDay.getTime();
  }).length;

  const states = fuInRange.map((f) => followUpState(f, now));
  const completed = states.filter((x) => x === "completed").length;
  const cancelled = states.filter((x) => x === "cancelled").length;
  const overdue = states.filter((x) => x === "overdue").length;
  const pending = states.filter((x) => x === "pending").length;

  const staffMap = new Map<string | undefined, { total: number; completed: number }>();
  for (const f of fuInRange) {
    const cur = staffMap.get(f.assigned_to) ?? { total: 0, completed: 0 };
    cur.total += 1;
    if (f.status === "completed") cur.completed += 1;
    staffMap.set(f.assigned_to, cur);
  }
  const fuBranchMap = new Map<string | undefined, { total: number; completed: number }>();
  for (const f of fuInRange) {
    const cur = fuBranchMap.get(f.branch_id) ?? { total: 0, completed: 0 };
    cur.total += 1;
    if (f.status === "completed") cur.completed += 1;
    fuBranchMap.set(f.branch_id, cur);
  }

  const followUps: FollowUpMetrics = {
    dueToday,
    pending,
    overdue,
    completed,
    cancelled,
    // Cancelled follow-ups are excluded: they were never work to finish.
    completionRate: rate(completed, completed + pending + overdue),
    byStaff: [...staffMap.entries()].map(([staff_id, v]) => ({ staff_id, ...v })),
    byBranch: [...fuBranchMap.entries()].map(([branch_id, v]) => ({
      branch_id,
      ...v,
    })),
  };

  // --- feedback ---------------------------------------------------------
  const fbInRange = s.feedback.filter((f) => inRange(f.created_at, r));
  const doctorMap = new Map<string | undefined, number[]>();
  const treatMap = new Map<string | undefined, number[]>();
  const monthMap = new Map<string, number[]>();
  for (const f of fbInRange) {
    if (f.doctor_rating != null) {
      doctorMap.set(f.doctor_id, [...(doctorMap.get(f.doctor_id) ?? []), f.doctor_rating]);
    }
    if (f.treatment_rating != null) {
      treatMap.set(f.treatment_id, [
        ...(treatMap.get(f.treatment_id) ?? []),
        f.treatment_rating,
      ]);
    }
    const month = f.created_at.slice(0, 7);
    monthMap.set(month, [...(monthMap.get(month) ?? []), f.overall_rating]);
  }

  // Response rate: feedback received against completed visits in the window,
  // which is the population that could plausibly have been asked.
  const completedVisitsInRange = s.appointments.filter(
    (a) => a.status === "completed" && inRange(a.start, r)
  ).length;

  const feedback: FeedbackMetrics = {
    count: fbInRange.length,
    avgOverall: mean(fbInRange.map((f) => f.overall_rating)),
    avgBranch: mean(
      fbInRange.filter((f) => f.branch_rating != null).map((f) => f.branch_rating!)
    ),
    avgDoctor: mean(
      fbInRange.filter((f) => f.doctor_rating != null).map((f) => f.doctor_rating!)
    ),
    avgTreatment: mean(
      fbInRange
        .filter((f) => f.treatment_rating != null)
        .map((f) => f.treatment_rating!)
    ),
    responseRate: rate(fbInRange.length, completedVisitsInRange),
    lowRatingCount: fbInRange.filter(
      (f) => f.overall_rating <= LOW_RATING_THRESHOLD
    ).length,
    openRecovery: fbInRange.filter(
      (f) => f.recovery_status === "open" || f.recovery_status === "in_progress"
    ).length,
    resolvedRecovery: fbInRange.filter((f) => f.recovery_status === "resolved")
      .length,
    byDoctor: [...doctorMap.entries()].map(([doctor_id, vals]) => ({
      doctor_id,
      avg: mean(vals),
      count: vals.length,
    })),
    byTreatment: [...treatMap.entries()].map(([treatment_id, vals]) => ({
      treatment_id,
      avg: mean(vals),
      count: vals.length,
    })),
    trend: [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, vals]) => ({ month, avg: mean(vals), count: vals.length })),
  };

  // --- per-branch comparison -------------------------------------------
  // Computed from the UNSCOPED input so the comparison always shows every
  // branch, even when the page is filtered to one of them.
  const allBranchIds = [
    ...new Set(
      [
        ...input.contacts.map((c) => c.branch_id),
        ...input.followUps.map((f) => f.branch_id),
        ...input.appointments.map((a) => a.location_id),
        ...input.invoices.map((i) => i.location_id),
      ].filter((x): x is string => !!x)
    ),
  ].sort();

  const patientBranch = s.patientBranch;
  const branches: BranchMetrics[] = allBranchIds.map((bid) => {
    const bLeads = input.contacts.filter(
      (c) => c.branch_id === bid && inRange(c.created_at, r)
    );
    const bWon = bLeads.filter((c) => WON_STAGES.includes(c.stage)).length;
    const bAppts = input.appointments.filter(
      (a) => a.location_id === bid && inRange(a.start, r)
    );
    const bDone = bAppts.filter((a) => a.status === "completed").length;
    const bNoShow = bAppts.filter((a) => a.status === "no_show").length;
    const bFu = input.followUps.filter(
      (f) => f.branch_id === bid && inRange(f.due_at, r)
    );
    const bFuDone = bFu.filter((f) => f.status === "completed").length;
    const bFuActionable = bFu.filter((f) => f.status !== "cancelled").length;
    const bFb = input.feedback.filter(
      (f) => f.branch_id === bid && inRange(f.created_at, r)
    );
    const bInv = input.invoices.filter(
      (i) => i.location_id === bid && i.status === "paid" && inRange(i.created_at, r)
    );
    const bPatients = input.patients.filter((p) => patientBranch.get(p.id) === bid);
    const bResponses = bLeads
      .filter((c) => c.first_response_at)
      .map(
        (c) =>
          (new Date(c.first_response_at!).getTime() -
            new Date(c.created_at).getTime()) /
          3_600_000
      )
      .filter((h) => h >= 0);

    return {
      branch_id: bid,
      leads: bLeads.length,
      conversions: bWon,
      conversionRate: rate(bWon, bLeads.length),
      newPatients: bPatients.filter((p) => inRange(p.created_at, r)).length,
      returningPatients: bPatients.filter((p) => returningIds.has(p.id)).length,
      appointmentsTotal: bAppts.length,
      appointmentsCompleted: bDone,
      completionRate: rate(bDone, bAppts.length),
      noShows: bNoShow,
      noShowRate: rate(bNoShow, bAppts.length),
      followUpsTotal: bFu.length,
      followUpsCompleted: bFuDone,
      followUpCompletionRate: rate(bFuDone, bFuActionable),
      feedbackAvg: mean(bFb.map((f) => f.overall_rating)),
      feedbackCount: bFb.length,
      revenue: bInv.reduce((sum, i) => sum + (i.total ?? 0), 0),
      // Only claim a revenue figure when invoices actually exist for it.
      revenueSupported: bInv.length > 0,
      avgResponseHours: mean(bResponses),
      responseSupported: bResponses.length > 0,
    };
  });

  return {
    patients,
    leads,
    followUps,
    feedback,
    branches,
    generatedAt: now.toISOString(),
  };
}
