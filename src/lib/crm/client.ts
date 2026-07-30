"use client";

/**
 * Client-side CRM helpers: fetch wrappers and the formatters the screens
 * share. Everything here is presentation - the authority for what a user may
 * do lives on the server (see crmApi.requireCrm).
 */

import type {
  CrmActivity,
  CrmContact,
  CrmConversation,
  CrmFeedback,
  CrmFollowUp,
  CrmMessage,
  MessageTemplate,
} from "./types";
import type { CrmAnalytics } from "./analytics";
import type { ClinicLocation, Patient } from "@/lib/types";

export interface StaffLite {
  id: string;
  name: string;
  role: string;
  title?: string;
  active?: boolean;
}

async function get<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function send<T>(
  url: string,
  method: "POST" | "PATCH",
  body: unknown
): Promise<{ ok: boolean; data?: T; error?: string; status: number }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) {
      return { ok: false, error: data?.message ?? "Request failed.", status: res.status, data };
    }
    return { ok: true, data, status: res.status };
  } catch {
    return { ok: false, error: "No connection.", status: 0 };
  }
}

// --- overview ---------------------------------------------------------

export interface OverviewResponse {
  ok: true;
  analytics: CrmAnalytics;
  branches: ClinicLocation[];
}

export function fetchOverview(params: {
  from?: string;
  to?: string;
  branch?: string;
}) {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.branch) q.set("branch", params.branch);
  return get<OverviewResponse>(`/api/crm/overview?${q.toString()}`);
}

// --- contacts ---------------------------------------------------------

export interface ContactsResponse {
  ok: true;
  contacts: CrmContact[];
  staff: StaffLite[];
  branches: ClinicLocation[];
  treatments: string[];
}

export const fetchContacts = () => get<ContactsResponse>("/api/crm/contacts");

export interface PatientSummary {
  visits: number;
  upcoming: number;
  noShows: number;
  lastVisit: string | null;
  totalBilled: number;
  invoiceCount: number;
}

export interface ContactDetailResponse {
  ok: true;
  contact: CrmContact;
  /** The linked record from the clinic's existing patient registry. */
  patient: Patient | null;
  patientSummary: PatientSummary | null;
  timeline: CrmActivity[];
  followUps: CrmFollowUp[];
  conversations: CrmConversation[];
  feedback: CrmFeedback[];
}

export const fetchContact = (id: string) =>
  get<ContactDetailResponse>(`/api/crm/contacts/${id}`);

export const createContact = (body: Record<string, unknown>) =>
  send<{ contact: CrmContact }>("/api/crm/contacts", "POST", body);

export const updateContact = (id: string, body: Record<string, unknown>) =>
  send<{ contact: CrmContact }>(`/api/crm/contacts/${id}`, "PATCH", body);

export const convertContact = (id: string) =>
  send<{ contact: CrmContact; patient_id: string; linkedExisting?: boolean }>(
    `/api/crm/contacts/${id}`,
    "POST",
    {}
  );

// --- follow-ups -------------------------------------------------------

export interface FollowUpsResponse {
  ok: true;
  followUps: CrmFollowUp[];
  staff: StaffLite[];
  branches: ClinicLocation[];
  me: string;
}

export const fetchFollowUps = () => get<FollowUpsResponse>("/api/crm/followups");

export interface AutomationRunResponse {
  ok: true;
  sent: number;
  needsPerson: number;
  skipped: number;
  errors: string[];
}

/**
 * Send every automated follow-up that has come due.
 *
 * The follow-ups screen calls this before it loads, so what you see is the
 * board after automation has run rather than a pile of things the system
 * could have done itself.
 */
export const runAutomations = () =>
  send<AutomationRunResponse>("/api/crm/automation/run", "POST", {});

export const createFollowUp = (body: Record<string, unknown>) =>
  send<{ followUp: CrmFollowUp }>("/api/crm/followups", "POST", body);

export const updateFollowUp = (id: string, body: Record<string, unknown>) =>
  send<{ followUp: CrmFollowUp }>(`/api/crm/followups/${id}`, "PATCH", body);

// --- conversations ----------------------------------------------------

export interface ConversationListItem extends CrmConversation {
  contact: {
    id: string;
    name: string;
    phone: string;
    stage: string;
    patient_id?: string;
    opted_out: boolean;
  } | null;
}

export interface ConversationsResponse {
  ok: true;
  conversations: ConversationListItem[];
  staff: StaffLite[];
  branches: ClinicLocation[];
  templates: MessageTemplate[];
  provider: { id: string; label: string; configured: boolean; live: boolean };
  me: string;
}

export const fetchConversations = () =>
  get<ConversationsResponse>("/api/crm/conversations");

export interface ThreadResponse {
  ok: true;
  conversation: CrmConversation;
  messages: CrmMessage[];
  contact: CrmContact | null;
}

export const fetchThread = (id: string) =>
  get<ThreadResponse>(`/api/crm/conversations/${id}`);

export const postMessage = (
  id: string,
  body: { body: string; internal?: boolean; template_id?: string; idempotency_key?: string }
) => send<{ message: CrmMessage }>(`/api/crm/conversations/${id}`, "POST", body);

export const patchConversation = (id: string, body: Record<string, unknown>) =>
  send<{ conversation: CrmConversation }>(
    `/api/crm/conversations/${id}`,
    "PATCH",
    body
  );

export const simulateInbound = (body: Record<string, unknown>) =>
  send<{ conversation_id: string; contact_id: string; duplicate: boolean }>(
    "/api/crm/messaging/simulate",
    "POST",
    body
  );

// --- feedback ---------------------------------------------------------

export interface FeedbackResponse {
  ok: true;
  feedback: CrmFeedback[];
  staff: StaffLite[];
  branches: ClinicLocation[];
  lowRatingThreshold: number;
  me: string;
}

export const fetchFeedback = () => get<FeedbackResponse>("/api/crm/feedback");

export const updateFeedback = (body: Record<string, unknown>) =>
  send<{ feedback: CrmFeedback }>("/api/crm/feedback", "PATCH", body);

// ---------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------

/** A rate that may be null. Null renders as an em dash, never as 0%. */
export function pct(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(digits)}%`;
}

/** An average that may be null. */
export function avg(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

export function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `Rs. ${Math.round(value).toLocaleString("en-PK")}`;
}

export function hours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  if (value < 1) return `${Math.round(value * 60)} min`;
  if (value < 48) return `${value.toFixed(1)} h`;
  return `${(value / 24).toFixed(1)} d`;
}

/** "3 days ago", "in 2 hours", "just now". */
export function relativeTime(iso: string | undefined): string {
  if (!iso) return "-";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "-";
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  if (mins < 1) return "just now";
  const fmt = (n: number, unit: string) =>
    diff < 0 ? `${n} ${unit}${n === 1 ? "" : "s"} ago` : `in ${n} ${unit}${n === 1 ? "" : "s"}`;
  if (mins < 60) return fmt(mins, "min");
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return fmt(hrs, "hour");
  const days = Math.round(hrs / 24);
  if (days < 30) return fmt(days, "day");
  const months = Math.round(days / 30);
  return fmt(months, "month");
}

export function dateTime(iso: string | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function dateOnly(iso: string | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Today, in the input[type=date] format. */
export function todayISO(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** Human label for a treatment id, falling back to a tidied id. */
export function titleize(id: string | undefined): string {
  if (!id) return "-";
  return id
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
