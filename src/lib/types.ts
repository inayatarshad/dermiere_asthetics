/**
 * Contour — data model.
 * Mirrors knowledge base / 09_data-model.md. Everything is clinic-scoped.
 */

export type Role = "front_desk" | "doctor" | "admin";

export interface Clinic {
  id: string;
  name: string;
  city: string;
  branding: {
    tagline?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
}

export interface User {
  id: string;
  clinic_id: string;
  name: string;
  email: string;
  role: Role;
  /** Demo build: plain credential check against seeded users. Replace with real auth for production. */
  password: string;
  title?: string; // e.g. "Consultant Plastic Surgeon"
  active: boolean;
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
  /** Booth handoff id — set when this record travelled via the booth inbox. */
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
  visit_date: string; // ISO date — powers the timeline
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
export type AppointmentSource = "front_desk" | "vybero" | "booth";

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

/** One slider in a procedure's AI schema — maps UI value to prompt phrases. */
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

/** A slider surfaced on the 3D canvas rail — the geometric subset of the schema. */
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

/** The standing disclaimer burned into every AI output and report. */
export const AI_DISCLAIMER =
  "Illustrative AI visualization, not a guarantee of surgical outcome.";

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
