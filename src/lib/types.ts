/**
 * CAPTURE Clinic OS - data model.
 * Everything is clinic-scoped. Extends the Contour engine data model with
 * Clinic entities: Location, Invoice, Review, Reward.
 */

export type Role = "front_desk" | "doctor" | "admin";

/**
 * One physical CAPTURE location - the Experience Centre or a partner
 * clinic. Appointments, invoices and reviews are tagged with a location so
 * calendars, billing and monitoring can be filtered per site.
 */
export interface ClinicLocation {
  id: string;
  name: string;
  short: string;
  kind: "experience_centre" | "partner";
  doctor?: string;
  address: string;
  area: string;
  city: string;
  phone?: string;
  /** Prefix for invoice numbers issued at this location, e.g. "EC". */
  invoicePrefix: string;
}

export interface Clinic {
  id: string;
  name: string;
  city: string;
  branding: {
    tagline?: string;
    phone?: string;
    email?: string;
    address?: string;
    logoUrl?: string;
    brandColor?: string;
  };
}

/**
 * The per-clinic configuration row (clinics.payload in Postgres). This is
 * the tenant's runtime config - branding, hours, which treatments are on,
 * prices, voice-agent identity, AI spend caps. Provisioning writes it;
 * Settings edits it; reports and the portal read it.
 */
export interface ClinicConfig {
  id: string;
  name: string;
  slug: string;
  city: string;
  branding: Clinic["branding"];
  hours: ClinicHours;
  /** Enabled treatment template ids. Empty = every available template. */
  menu: string[];
  /** templateId -> price (clinic currency). */
  prices: Record<string, number>;
  toxinPricePerUnit: number;
  vyberoAgentId?: string;
  bookingUrl?: string;
  /** Monthly AI spend caps enforced server-side (0 = unlimited). */
  aiCaps: { generations: number; assessments: number };
  /** Demo clinic seeds sample data; real clinics start clean. */
  demo: boolean;
  /** Physical locations (Experience Centre + partner clinics). */
  locations?: ClinicLocation[];
  /** Sales tax percentage applied at POS (Punjab services default 16). */
  taxRate?: number;
  /** Review incentive: what a submitted review earns ("Capture Circle"). */
  reviewIncentive?: {
    kind: "discount";
    /** percent off the next visit */
    value: number;
    validityDays: number;
  };
}

/**
 * Which product surface a user works in.
 *
 * Independent of `role`, which still decides every permission. A "crm" user
 * is an ordinary member of the clinic - same auth, same database - who sees
 * the CRM workspace instead of the Clinic OS one.
 */
export type Workspace = "clinic" | "crm";

export interface User {
  id: string;
  clinic_id: string;
  name: string;
  email: string;
  role: Role;
  /** Demo build: plain credential check against seeded users. Replace with real auth for production. */
  password: string;
  title?: string; // e.g. "Consultant Plastic Surgeon"
  /**
   * The site this person works at, when they work at one.
   *
   * Presentation only: it decides which branch a screen opens filtered to,
   * never what they are permitted to see. The security boundary is
   * clinic_id, and it stays that way - a patient belongs to the clinic, not
   * to a building, and hiding half a history from the clinician treating
   * someone today would be worse than showing too much.
   *
   * Absent for clinic-wide accounts (founder, operations, marketing, CRM).
   */
  branch_id?: string;
  active: boolean;
  /** Defaults to "clinic" when absent. */
  workspace?: Workspace;
}

export type PatientSource =
  | "walk_in"
  | "vibro"
  | "referral"
  | "social"
  | "tourism";

export type Language = "urdu" | "english" | "other";

export interface ClinicalFlags {
  allergies?: string;
  medications?: string;
  blood_thinners?: boolean;
  prior_surgery?: boolean;
  keloid_tendency?: boolean;
  pregnancy_breastfeeding?: boolean;
  fitzpatrick?: 1 | 2 | 3 | 4 | 5 | 6 | null;
  prior_treatments?: string;
  notes?: string;
}

export interface Patient {
  id: string;
  clinic_id: string;
  name: string;
  phone: string;
  email?: string;
  age?: number;
  dob?: string;
  gender: "female" | "male" | "other";
  city: string;
  language: Language;
  source: PatientSource;
  clinical_flags: ClinicalFlags;
  /** Booth handoff id - set when this record travelled via the booth inbox. */
  booth_id?: string;
  created_at: string;
}

export type ConsentType = "treatment" | "photography" | "marketing";

export interface Consent {
  id: string;
  patient_id: string;
  type: ConsentType;
  granted: boolean;
  granted_at: string;
  captured_by: string; // staff user id
  text_version: string;
}

export type AssetKind =
  | "photo_front"
  | "photo_left"
  | "photo_right"
  | "photo_closeup"
  | "photo_body"
  | "ai_after"
  | "assessment"
  | "report_pdf";

export interface Asset {
  id: string;
  patient_id: string;
  consultation_id?: string;
  kind: AssetKind;
  /**
   * Where the image lives. Either a public path (seeded demo assets,
   * e.g. "/seed/ayesha_front.jpg") or "idb:<key>" for captured/generated
   * images stored in IndexedDB on the device.
   */
  storage_url: string;
  visit_date: string; // ISO date - powers the timeline
  meta?: {
    procedure?: string;
    params?: Record<string, number>;
    model?: string;
    label?: string;
  };
  created_at: string;
}

export type ProcedureCategory = "surgical" | "injectable" | "skin" | "hair" | "other";

// ---------------------------------------------------------------------
// Appointments (Calendar module) + VYBERO voice-agent integration
// ---------------------------------------------------------------------

export type AppointmentType = "consultation" | "treatment" | "follow_up";
export type AppointmentStatus =
  | "booked"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";
/** Who created the booking. "vybero" = the phone voice agent. */
/**
 * Where a booking came from. Every one of these lands in the SAME
 * appointments table and therefore on the same calendar - the front desk,
 * the voice agent, the booth and the CRM all book into one diary.
 */
export type AppointmentSource = "front_desk" | "vybero" | "booth" | "crm";

export interface Appointment {
  id: string;
  /** Linked patient when known; VYBERO bookings may arrive with a name only. */
  patient_id?: string;
  patient_name: string;
  phone?: string;
  start: string; // ISO datetime
  duration_min: number;
  type: AppointmentType;
  procedure_interest?: string; // template id, e.g. "lip_filler"
  source: AppointmentSource;
  status: AppointmentStatus;
  notes?: string;
  /** Set when the booking came out of a VYBERO call. */
  vybero_call_id?: string;
  /** Which CAPTURE location the booking is for (defaults to the Experience Centre). */
  location_id?: string;
  created_at: string;
  updated_at: string;
}

/** Clinic opening pattern that defines bookable slots. */
export interface ClinicHours {
  open: string; // "10:00"
  close: string; // "19:00"
  slot_min: number; // grid + default booking length
  days: number[]; // 0=Sun ... 6=Sat
}

export const DEFAULT_CLINIC_HOURS: ClinicHours = {
  open: "10:00",
  close: "19:00",
  slot_min: 30,
  days: [1, 2, 3, 4, 5, 6],
};

/**
 * One VYBERO voice-agent call record (modeled on the VYBERO Analytics
 * conversation schema, clinic-flavored). The agent may send topics and
 * questions pre-labeled; otherwise they are keyword-detected from the
 * summary on our side.
 */
export type CallOutcome =
  | "booked"
  | "info"
  | "callback"
  | "transferred"
  | "missed";

export interface VyberoCall {
  id: string;
  started_at: string; // ISO datetime
  duration_secs: number;
  direction: "inbound" | "outbound";
  caller_name?: string;
  caller_phone?: string;
  language?: string;
  outcome: CallOutcome;
  /** Procedure/topic tags, e.g. "lip_filler", "pricing", "aftercare". */
  topics: string[];
  /** Notable patient questions, verbatim-ish. */
  questions: string[];
  summary?: string;
  appointment_id?: string;
  rating?: number; // 1..5 if collected
}

export interface Brief {
  primary_interest: string | null; // procedure id, e.g. "rhinoplasty"
  interests: string[]; // all selected procedure ids
  concerns: string[]; // face regions: nose, lips, cheeks, jaw, under_eye, forehead, skin
  goal_text: string; // patient's own words
  flags: {
    first_treatment?: boolean;
    budget_sensitive?: boolean;
    timeline?: "event_soon" | "exploring" | "ready_now" | null;
    medical_tourism?: boolean;
  };
}

export interface AnnotationStroke {
  points: { u: number; v: number }[]; // UV space on the face texture
  color: string;
  size: number;
}

export interface CanvasState {
  morphs: Record<string, number>; // canvas morph slider values
  annotations: AnnotationStroke[];
}

export interface Consultation {
  id: string;
  patient_id: string;
  doctor_id: string;
  clinic_id: string;
  date: string;
  brief: Brief;
  canvas_state: CanvasState;
  doctor_note: string;
  status: "open" | "completed";
  /** Botox units planning (T3): zones, units, totals. See botoxUnits.ts */
  toxin_plan?: {
    zones: Record<string, { intensity: number; units: number }>;
    total_units: number;
    total_cost: number;
    price_per_unit: number;
  } | null;
}

export interface Visualization {
  id: string;
  consultation_id: string;
  procedure: string;
  params: Record<string, number>;
  prompt_used: string;
  before_asset_id: string;
  after_asset_id: string;
  model: string; // which image model produced it (or "simulation" for on-device warp)
  created_at: string;
}

/** One slider in a procedure's AI schema - maps UI value to prompt phrases. */
export interface SliderDef {
  key: string;
  label: string;
  hint: string; // anatomical explanation shown under the label
  min: number; // -100 (bidirectional) or 0
  max: number; // 100
  /** phrase used when value is negative (bidirectional sliders) */
  negPhrase?: string;
  /** phrase used when value is positive (or the only phrase for 0..100 sliders) */
  posPhrase: string;
  negLabel?: string; // end labels rendered on the slider
  posLabel?: string;
  /**
   * On/off choices (e.g. hairstyle try-on chips): the phrase enters the
   * prompt verbatim, without the "very slightly / moderately / noticeably"
   * magnitude adverb, which only makes sense for graded sliders.
   */
  bandless?: boolean;
}

export interface PlanTemplateItem {
  kind: "milestone" | "medicine" | "followup";
  label: string;
  detail: string;
  offset_days?: number; // suggested due date offset from plan creation
}

/** A slider surfaced on the 3D canvas rail - the geometric subset of the schema. */
export interface CanvasHandle {
  key: string;
  label: string;
  min: number;
  max: number;
  negLabel?: string;
  posLabel?: string;
}

export interface TreatmentTemplate {
  id: string;
  name: string;
  category: ProcedureCategory;
  region: string; // primary face region
  available: boolean;
  slider_schema: SliderDef[];
  /** Which sliders appear as live morph handles on the 3D canvas. */
  canvas_handles: CanvasHandle[];
  prompt_template: string; // with {assembled_slider_phrases} placeholder
  plan_template: PlanTemplateItem[];
  model: string; // preferred image model
}

export type PlanStatus = "proposed" | "accepted" | "in_progress" | "done";

export interface TreatmentPlan {
  id: string;
  consultation_id: string;
  template_id?: string;
  summary: string;
  status: PlanStatus;
  created_at: string;
}

export interface PlanItem {
  id: string;
  plan_id: string;
  kind: "milestone" | "medicine" | "followup";
  label: string;
  detail: string;
  due?: string;
  done: boolean;
  order: number;
}

export interface Report {
  id: string;
  consultation_id: string;
  generated_at: string;
}

// ---------------------------------------------------------------------
// Point of Sale - invoices
// ---------------------------------------------------------------------

export type PaymentMethod = "cash" | "card";

export interface InvoiceItem {
  id: string;
  /** catalogue reference: treatment id or product id */
  ref: string;
  kind: "treatment" | "product" | "regimen";
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  /** Human invoice number, e.g. "EC-20260716-014" (location prefix). */
  number: string;
  patient_id?: string;
  patient_name: string;
  location_id: string;
  items: InvoiceItem[];
  subtotal: number;
  /** percentage applied, e.g. 16 */
  tax_rate: number;
  tax_amount: number;
  /** TOTAL discount applied (Capture Circle + flat), in PKR */
  discount_amount: number;
  /** redeemed Capture Circle code, if any */
  reward_code?: string;
  /** cashier-entered flat discount (no code), in PKR - part of discount_amount */
  manual_discount?: number;
  total: number;
  payment_method: PaymentMethod;
  amount_received?: number;
  /** staff user id who rang it up */
  cashier_id?: string;
  cashier_name?: string;
  status: "paid" | "void";
  consultation_id?: string;
  created_at: string;
}

// ---------------------------------------------------------------------
// Reviews + Capture Circle rewards
// ---------------------------------------------------------------------

/** A submitted client review (synced down from the reviews table). */
export interface ClinicReview {
  id: string;
  invite_id: string;
  patient_id?: string;
  patient_name: string;
  location_id: string;
  /** treatment ids covered by the visit */
  treatments: string[];
  /** practitioner credited with the visit, if known */
  staff_name?: string;
  rating: number; // 1..5
  comment?: string;
  /** what the client highlighted, e.g. "results", "comfort", "staff" */
  highlights: string[];
  /** set once a team member follows up a low score */
  followed_up?: boolean;
  invoice_id?: string;
  created_at: string;
}

export type ReviewInviteStatus = "PENDING" | "OPENED" | "COMPLETED";

/** A per-visit review link (token capability, portal pattern). */
export interface ReviewInvite {
  id: string;
  token: string;
  patient_id?: string;
  patient_name: string;
  location_id: string;
  treatments: string[];
  staff_name?: string;
  invoice_id?: string;
  status: ReviewInviteStatus;
  created_at: string;
  opened_at?: string;
  completed_at?: string;
  review_id?: string;
}

export type RewardStatus = "issued" | "redeemed" | "expired";

/** A Capture Circle reward issued for a review, redeemable at POS. */
export interface Reward {
  id: string;
  /** short human code, e.g. "CIRCLE-4F7K" */
  code: string;
  patient_id?: string;
  patient_name: string;
  review_id: string;
  kind: "discount";
  /** percent off the next visit */
  value: number;
  status: RewardStatus;
  issued_at: string;
  expires_at: string;
  redeemed_at?: string;
  redeemed_invoice_id?: string;
}

/** The standing disclaimer burned into every AI output and report. */
export const AI_DISCLAIMER =
  "Illustrative preview of an expected outcome, not a guarantee of results.";

export const CONSENT_TEXT_VERSION = "v1.0 (2026-07)";

export const CONSENT_COPY: Record<
  ConsentType,
  { title: string; body: string }
> = {
  treatment: {
    title: "Consultation & treatment",
    body: "I consent to an aesthetic consultation and to the discussion of possible treatments at this clinic.",
  },
  photography: {
    title: "Photography & storage",
    body: "I consent to clinical photographs of my face being taken and stored securely as part of my patient record, and used to generate on-screen treatment visualizations.",
  },
  marketing: {
    title: "Marketing use (optional)",
    body: "I additionally consent to my anonymized before/after images being used in the clinic's marketing. I can withdraw this at any time.",
  },
};

export const FACE_REGIONS = [
  { id: "nose", label: "Nose" },
  { id: "lips", label: "Lips" },
  { id: "cheeks", label: "Cheeks" },
  { id: "jaw", label: "Jawline" },
  { id: "chin", label: "Chin" },
  { id: "under_eye", label: "Under-eye" },
  { id: "forehead", label: "Brow / Forehead" },
  { id: "skin", label: "Skin" },
] as const;

/** Body areas CAPTURE's Exomere contouring + MitoRedLight programmes treat
 *  (owner 2026-07-23: the brief's areas of concern must cover the body). */
export const BODY_REGIONS = [
  { id: "abdomen", label: "Abdomen" },
  { id: "waist_flanks", label: "Waist & flanks" },
  { id: "arms", label: "Arms" },
  { id: "thighs", label: "Thighs" },
  { id: "hips", label: "Hips" },
  { id: "full_body", label: "Full body" },
] as const;
