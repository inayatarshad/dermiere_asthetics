/**
 * CRM domain model - shared by server and client.
 *
 * Everything here is clinic-scoped at the query layer (see crmStore.ts); the
 * types carry `clinic_id` so a payload read back from jsonb is self-describing.
 *
 * Branches are NOT modelled here: a branch is a `ClinicLocation` from the
 * clinic's own config (clinics.payload.locations), so new branches are added
 * in Settings without a code change. CRM rows reference one by `branch_id`.
 */

// ---------------------------------------------------------------------
// Pipeline - defined ONCE. Never hardcode a stage string elsewhere.
// ---------------------------------------------------------------------

export const PIPELINE_STAGES = [
  { id: "new", label: "New", tone: "slate" },
  { id: "contacted", label: "Contacted", tone: "sky" },
  { id: "consult_booked", label: "Consultation booked", tone: "violet" },
  { id: "visited", label: "Visited", tone: "amber" },
  { id: "treatment_planned", label: "Treatment planned", tone: "teal" },
  { id: "won", label: "Converted", tone: "green" },
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number]["id"];

/** Terminal states that sit outside the forward-moving pipeline. */
export const TERMINAL_STAGES = [
  { id: "lost", label: "Lost", tone: "rose" },
  { id: "archived", label: "Archived", tone: "slate" },
] as const;

export type TerminalStage = (typeof TERMINAL_STAGES)[number]["id"];
export type ContactStage = PipelineStage | TerminalStage;

export const ALL_STAGES = [...PIPELINE_STAGES, ...TERMINAL_STAGES];

const STAGE_INDEX = new Map<string, (typeof ALL_STAGES)[number]>(
  ALL_STAGES.map((s) => [s.id, s])
);

export function stageLabel(id: string): string {
  return STAGE_INDEX.get(id)?.label ?? id;
}

export function stageTone(id: string): string {
  return STAGE_INDEX.get(id)?.tone ?? "slate";
}

export function isStage(v: unknown): v is ContactStage {
  return typeof v === "string" && STAGE_INDEX.has(v);
}

/** Stages that mean "this lead became a paying patient". */
export const WON_STAGES: readonly ContactStage[] = ["won"];
/** Stages that count as a booked consultation (or anything past it). */
export const BOOKED_OR_BEYOND: readonly ContactStage[] = [
  "consult_booked",
  "visited",
  "treatment_planned",
  "won",
];

// ---------------------------------------------------------------------
// Lead sources & treatment interest
// ---------------------------------------------------------------------

export const LEAD_SOURCES = [
  "walk_in",
  "whatsapp",
  "instagram",
  "facebook",
  "google",
  "referral",
  "phone",
  "website",
  "event",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  walk_in: "Walk-in",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  google: "Google",
  referral: "Referral",
  phone: "Phone",
  website: "Website",
  event: "Event",
  other: "Other",
};

export const LOST_REASONS = [
  "price",
  "distance",
  "went_elsewhere",
  "not_ready",
  "unreachable",
  "not_suitable",
  "other",
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  price: "Price",
  distance: "Distance",
  went_elsewhere: "Went elsewhere",
  not_ready: "Not ready yet",
  unreachable: "Unreachable",
  not_suitable: "Not clinically suitable",
  other: "Other",
};

// ---------------------------------------------------------------------
// Contact (a lead and a contact are the same row; `stage` tells them apart)
// ---------------------------------------------------------------------

export interface CrmContact {
  id: string;
  clinic_id: string;
  /** Set once converted - links to the existing `patients` record. */
  patient_id?: string;
  name: string;
  phone: string;
  /** E.164-ish normalized form; the dedupe key. */
  phone_norm: string;
  email?: string;
  city?: string;
  gender?: "female" | "male" | "other";
  stage: ContactStage;
  source: LeadSource;
  /** Treatment ids from the clinic menu, or free text when off-menu. */
  treatment_interest: string[];
  assigned_to?: string; // staff user id
  branch_id?: string; // ClinicLocation id
  tags: string[];
  notes?: string;
  estimated_value?: number; // PKR
  lost_reason?: LostReason;
  lost_note?: string;
  /** Marketing / communication consent - drives who may be messaged. */
  marketing_opt_in: boolean;
  opted_out_at?: string;
  created_at: string;
  updated_at: string;
  /** First outbound/staff response, used for average-first-response time. */
  first_response_at?: string;
  /**
   * A slot offered to this contact and awaiting their "yes".
   *
   * The booking is NOT on the calendar yet: this is the held offer between
   * "can I come Tuesday?" and the patient confirming. Storing it is what
   * lets an affirmative reply book the right slot instead of guessing, and
   * what stops a stale offer being confirmed a week later.
   */
  pending_slot?: {
    /** ISO datetime of the offered appointment. */
    start: string;
    offered_at: string;
    /** After this, the offer is stale and must be re-proposed. */
    expires_at: string;
  };
}

// ---------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------

export const FOLLOWUP_STATUSES = ["pending", "completed", "cancelled"] as const;
export type FollowUpStatus = (typeof FOLLOWUP_STATUSES)[number];

/**
 * "Overdue" is derived, never stored - a pending follow-up whose due time has
 * passed. Storing it would go stale the moment the clock moved.
 */
export type FollowUpDerivedStatus = FollowUpStatus | "overdue";

export const FOLLOWUP_TYPES = [
  "call",
  "whatsapp",
  "consultation",
  "post_treatment",
  "payment",
  "review_request",
  "other",
] as const;
export type FollowUpType = (typeof FOLLOWUP_TYPES)[number];

export const FOLLOWUP_TYPE_LABELS: Record<FollowUpType, string> = {
  call: "Call",
  whatsapp: "WhatsApp",
  consultation: "Consultation",
  post_treatment: "Post-treatment check",
  payment: "Payment",
  review_request: "Review request",
  other: "Other",
};

export const PRIORITIES = ["low", "normal", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface CrmFollowUp {
  id: string;
  clinic_id: string;
  contact_id?: string;
  patient_id?: string;
  title: string;
  description?: string;
  type: FollowUpType;
  priority: Priority;
  status: FollowUpStatus;
  assigned_to?: string;
  branch_id?: string;
  due_at: string;
  completed_at?: string;
  completion_note?: string;
  cancelled_at?: string;
  cancel_reason?: string;
  /**
   * Reserve this one for a person: automation will leave it alone.
   * Unset means the follow-up sends itself when it comes due.
   */
  manual?: boolean;
  /** Audit trail of reschedules: previous due dates, most recent last. */
  rescheduled_from: string[];
  created_at: string;
  created_by?: string;
  updated_at: string;
}

/** Derives overdue from the clock - call this everywhere instead of reading status. */
export function followUpState(
  f: Pick<CrmFollowUp, "status" | "due_at">,
  now: Date = new Date()
): FollowUpDerivedStatus {
  if (f.status !== "pending") return f.status;
  return new Date(f.due_at).getTime() < now.getTime() ? "overdue" : "pending";
}

// ---------------------------------------------------------------------
// Conversations & messages (WhatsApp-shaped, provider-agnostic)
// ---------------------------------------------------------------------

export const CONVERSATION_STATUSES = ["open", "pending", "closed"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export interface CrmConversation {
  id: string;
  clinic_id: string;
  contact_id: string;
  channel: "whatsapp" | "sms" | "internal";
  status: ConversationStatus;
  assigned_to?: string;
  branch_id?: string;
  subject?: string;
  last_message_at: string;
  last_message_preview?: string;
  /** Inbound messages the assigned staff member has not opened yet. */
  unread_count: number;
  created_at: string;
  updated_at: string;
}

/** Draft -> Queued -> Sent -> Delivered -> Read, with Failed as a sink. */
export const MESSAGE_STATES = [
  "draft",
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
] as const;
export type MessageState = (typeof MESSAGE_STATES)[number];

export interface MessageAttachment {
  kind: "image" | "document" | "audio" | "video";
  filename?: string;
  mime?: string;
  size?: number;
  /** Provider-side media handle. No binary ever lands in the database. */
  provider_media_id?: string;
}

export interface CrmMessage {
  id: string;
  clinic_id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  /** An internal note is staff-only and never leaves the building. */
  internal: boolean;
  body: string;
  template_id?: string;
  attachments: MessageAttachment[];
  state: MessageState;
  error?: string;
  /** Provider's own id - the idempotency key for webhook ingestion. */
  provider_message_id?: string;
  provider: string;
  author_id?: string; // staff user id for outbound/internal
  created_at: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
}

export interface MessageTemplate {
  id: string;
  clinic_id: string;
  name: string;
  /** Mirrors Meta's approval lifecycle so the real provider slots in later. */
  status: "draft" | "pending" | "approved" | "rejected";
  language: string;
  category: "utility" | "marketing" | "authentication";
  body: string;
  /** Ordered placeholder names for {{1}}, {{2}}, ... */
  variables: string[];
  created_at: string;
}

// ---------------------------------------------------------------------
// Feedback (extends the existing review capture with structured ratings)
// ---------------------------------------------------------------------

export const RECOVERY_STATUSES = [
  "none",
  "open",
  "in_progress",
  "resolved",
] as const;
export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number];

/** At or below this overall rating, a feedback row raises a recovery case. */
export const LOW_RATING_THRESHOLD = 3;

export interface CrmFeedback {
  id: string;
  clinic_id: string;
  contact_id?: string;
  patient_id?: string;
  branch_id?: string;
  doctor_id?: string;
  /** Links back to an existing review_invites token when sent that way. */
  invite_token?: string;
  overall_rating: number; // 1-5
  branch_rating?: number;
  doctor_rating?: number;
  treatment_rating?: number;
  treatment_id?: string;
  comment?: string;
  recovery_status: RecoveryStatus;
  assigned_to?: string;
  resolution_note?: string;
  resolved_at?: string;
  resolved_by?: string;
  created_at: string;
}

// ---------------------------------------------------------------------
// Timeline activity
// ---------------------------------------------------------------------

export const ACTIVITY_KINDS = [
  "lead_created",
  "note",
  "assignment",
  "stage_change",
  "followup_created",
  "followup_completed",
  "followup_rescheduled",
  "followup_cancelled",
  "message_in",
  "message_out",
  "conversation_assigned",
  "feedback",
  "appointment",
  "visit",
  "treatment_plan",
  "invoice",
  "converted",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export interface CrmActivity {
  id: string;
  clinic_id: string;
  contact_id?: string;
  patient_id?: string;
  kind: ActivityKind;
  summary: string;
  detail?: string;
  actor_id?: string;
  branch_id?: string;
  /** Free-form pointer to the row that caused this entry. */
  ref_id?: string;
  created_at: string;
}
