/**
 * Seeded demo clinic — keeps the booth demo alive from first open
 * (knowledge base / 10_demo-build-plan.md: 2–3 seeded patients with a
 * rhinoplasty goal, one doctor + one front desk login).
 *
 * Seed photos are optional: /seed/manifest.json lists whichever demo
 * portraits are bundled in /public/seed. If absent, the app still works —
 * photos are captured live at registration.
 */

import type {
  Asset,
  Clinic,
  Consent,
  Consultation,
  Patient,
  PlanItem,
  TreatmentPlan,
  User,
} from "./types";
import { CONSENT_TEXT_VERSION } from "./types";
import { getTemplate } from "./templates";

const uid = () => crypto.randomUUID();

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const dateOnly = (iso: string) => iso.slice(0, 10);

export interface SeedManifest {
  [patientKey: string]: {
    front?: string;
    left?: string;
    right?: string;
    ai_after?: string;
  };
}

export interface SeedData {
  clinic: Clinic;
  users: User[];
  patients: Patient[];
  consents: Consent[];
  assets: Asset[];
  consultations: Consultation[];
  plans: TreatmentPlan[];
  planItems: PlanItem[];
}

export const DEMO_PASSWORD = "contour";

export function buildSeed(manifest: SeedManifest | null): SeedData {
  const clinicId = uid();

  const clinic: Clinic = {
    id: clinicId,
    name: "Meridian Aesthetics",
    city: "Lahore",
    branding: {
      tagline: "Precision aesthetics, beautifully planned.",
      phone: "+92 42 111 634 634",
      email: "care@meridianaesthetics.pk",
      address: "12-C Gulberg III, Lahore",
    },
  };

  const doctor: User = {
    id: uid(),
    clinic_id: clinicId,
    name: "Dr. Ayesha Rahman",
    email: "doctor@meridian.clinic",
    role: "doctor",
    password: DEMO_PASSWORD,
    title: "Consultant Plastic Surgeon",
    active: true,
  };
  const frontDesk: User = {
    id: uid(),
    clinic_id: clinicId,
    name: "Sana Malik",
    email: "frontdesk@meridian.clinic",
    role: "front_desk",
    password: DEMO_PASSWORD,
    title: "Patient Coordinator",
    active: true,
  };
  const admin: User = {
    id: uid(),
    clinic_id: clinicId,
    name: "Omar Farooq",
    email: "admin@meridian.clinic",
    role: "admin",
    password: DEMO_PASSWORD,
    title: "Clinic Director",
    active: true,
  };

  // ---- Patients -----------------------------------------------------
  const mahnoor: Patient = {
    id: uid(),
    clinic_id: clinicId,
    name: "Mahnoor Baig",
    phone: "0300 8471234",
    email: "mahnoor.b@gmail.com",
    age: 27,
    gender: "female",
    city: "Lahore",
    language: "english",
    source: "social",
    clinical_flags: {
      allergies: "None known",
      blood_thinners: false,
      prior_surgery: false,
      keloid_tendency: false,
      pregnancy_breastfeeding: false,
      fitzpatrick: 3,
      prior_treatments: "None. First aesthetic consultation",
    },
    created_at: daysAgo(0),
  };

  const hassan: Patient = {
    id: uid(),
    clinic_id: clinicId,
    name: "Hassan Raza",
    phone: "0321 5540987",
    age: 32,
    gender: "male",
    city: "Karachi",
    language: "urdu",
    source: "vibro",
    clinical_flags: {
      allergies: "Penicillin",
      blood_thinners: false,
      prior_surgery: false,
      keloid_tendency: false,
      fitzpatrick: 4,
      notes: "Booked via Vibro voice agent, asked about rhinoplasty packages.",
    },
    created_at: daysAgo(0),
  };

  const zainab: Patient = {
    id: uid(),
    clinic_id: clinicId,
    name: "Zainab Qureshi",
    phone: "0333 2218765",
    email: "zainabq@outlook.com",
    age: 24,
    gender: "female",
    city: "Islamabad",
    language: "english",
    source: "walk_in",
    clinical_flags: {
      allergies: "None known",
      blood_thinners: false,
      prior_surgery: false,
      keloid_tendency: false,
      pregnancy_breastfeeding: false,
      fitzpatrick: 2,
    },
    created_at: daysAgo(21),
  };

  // ---- Consents -----------------------------------------------------
  const consents: Consent[] = [];
  const grant = (
    patient: Patient,
    type: Consent["type"],
    granted: boolean,
    at: string
  ) =>
    consents.push({
      id: uid(),
      patient_id: patient.id,
      type,
      granted,
      granted_at: at,
      captured_by: frontDesk.id,
      text_version: CONSENT_TEXT_VERSION,
    });

  grant(mahnoor, "treatment", true, mahnoor.created_at);
  grant(mahnoor, "photography", true, mahnoor.created_at);
  grant(mahnoor, "marketing", true, mahnoor.created_at);
  grant(hassan, "treatment", true, hassan.created_at);
  grant(hassan, "photography", true, hassan.created_at);
  grant(hassan, "marketing", false, hassan.created_at);
  grant(zainab, "treatment", true, zainab.created_at);
  grant(zainab, "photography", true, zainab.created_at);
  grant(zainab, "marketing", true, zainab.created_at);

  // ---- Photo assets (only those present in the manifest) -------------
  const assets: Asset[] = [];
  const addPhoto = (
    patient: Patient,
    key: keyof SeedManifest[string],
    kind: Asset["kind"],
    visitISO: string,
    consultationId?: string
  ) => {
    const entry = manifest?.[patientKeyOf(patient.name)];
    const url = entry?.[key];
    if (!url) return undefined;
    const asset: Asset = {
      id: uid(),
      patient_id: patient.id,
      consultation_id: consultationId,
      kind,
      storage_url: url,
      visit_date: dateOnly(visitISO),
      created_at: visitISO,
    };
    assets.push(asset);
    return asset;
  };

  // ---- Consultations --------------------------------------------------
  // Mahnoor: today's hero consultation — brief already filled, open,
  // ready for the doctor to run canvas → AI → plan → report live.
  const mahnoorConsult: Consultation = {
    id: uid(),
    patient_id: mahnoor.id,
    doctor_id: doctor.id,
    clinic_id: clinicId,
    date: daysAgo(0),
    brief: {
      primary_interest: "rhinoplasty",
      interests: ["rhinoplasty"],
      concerns: ["nose"],
      goal_text:
        "I'd love to soften the bump on my bridge and have a slightly more refined tip.",
      flags: {
        first_treatment: true,
        budget_sensitive: false,
        timeline: "ready_now",
        medical_tourism: false,
      },
    },
    canvas_state: { morphs: {}, annotations: [] },
    doctor_note: "",
    status: "open",
  };

  // Zainab: completed consultation 3 weeks ago with a plan in progress —
  // shows the treatment-tracking and timeline story.
  const zainabConsult: Consultation = {
    id: uid(),
    patient_id: zainab.id,
    doctor_id: doctor.id,
    clinic_id: clinicId,
    date: daysAgo(21),
    brief: {
      primary_interest: "rhinoplasty",
      interests: ["rhinoplasty"],
      concerns: ["nose"],
      goal_text: "A straighter profile. My nose has bothered me in photos for years.",
      flags: {
        first_treatment: true,
        budget_sensitive: true,
        timeline: "ready_now",
        medical_tourism: false,
      },
    },
    canvas_state: { morphs: {}, annotations: [] },
    doctor_note:
      "Dorsal hump reduction with mild tip refinement discussed. Patient aligned on a conservative, natural result. Cleared for surgical planning.",
    status: "completed",
  };

  addPhoto(mahnoor, "front", "photo_front", mahnoor.created_at, mahnoorConsult.id);
  addPhoto(mahnoor, "left", "photo_left", mahnoor.created_at, mahnoorConsult.id);
  addPhoto(mahnoor, "right", "photo_right", mahnoor.created_at, mahnoorConsult.id);
  addPhoto(hassan, "front", "photo_front", hassan.created_at);
  addPhoto(zainab, "front", "photo_front", zainab.created_at, zainabConsult.id);

  // ---- Zainab's plan (in progress) ------------------------------------
  const zainabPlan: TreatmentPlan = {
    id: uid(),
    consultation_id: zainabConsult.id,
    template_id: "rhinoplasty",
    summary:
      "Closed rhinoplasty: conservative dorsal hump reduction with mild tip refinement. Target a natural, balanced profile preserving ethnic character.",
    status: "in_progress",
    created_at: daysAgo(21),
  };

  const planItems: PlanItem[] = [];
  const template = getTemplate("rhinoplasty");
  template?.plan_template.forEach((item, i) => {
    const due =
      item.offset_days !== undefined
        ? dateOnly(daysAgo(21 - item.offset_days))
        : undefined;
    planItems.push({
      id: uid(),
      plan_id: zainabPlan.id,
      kind: item.kind,
      label: item.label,
      detail: item.detail,
      due,
      done: i < 2, // pre-op assessment + surgery scheduling done
      order: i,
    });
  });

  return {
    clinic,
    users: [doctor, frontDesk, admin],
    patients: [mahnoor, hassan, zainab],
    consents,
    assets,
    consultations: [mahnoorConsult, zainabConsult],
    plans: [zainabPlan],
    planItems,
  };
}

export function patientKeyOf(name: string): string {
  return name.split(" ")[0].toLowerCase();
}

export async function fetchSeedManifest(): Promise<SeedManifest | null> {
  try {
    const res = await fetch("/seed/manifest.json", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as SeedManifest;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// VYBERO demo story: two weeks of voice-agent calls + a populated
// appointment book, so the Calendar and admin Analytics open alive.
// Deterministic (seeded RNG) so every demo reset tells the same story.
// ---------------------------------------------------------------------

import type { Appointment, VyberoCall, CallOutcome, Patient as PatientT } from "./types";

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CALLER_NAMES = [
  "Fatima Sheikh", "Ali Nawaz", "Hira Butt", "Usman Tariq", "Sana Iqbal",
  "Bilal Chaudhry", "Mehwish Khan", "Danish Raza", "Ayesha Siddiqui",
  "Hamza Malik", "Rabia Aslam", "Faisal Mehmood", "Zara Hussain",
  "Imran Qadir", "Noor Fatima", "Kashif Javed", "Amna Riaz", "Taimur Shah",
  "Saba Anwar", "Adeel Akhtar", "Mahnoor Ali", "Junaid Aziz",
];

const TOPIC_QUESTIONS: Record<string, string[]> = {
  lip_filler: [
    "How much does lip filler cost?",
    "How long does lip filler last?",
    "Will my lips look natural after filler?",
  ],
  botox: [
    "Is botox safe?",
    "How many units of botox will I need?",
    "How long does botox take to work?",
  ],
  rhinoplasty: [
    "What is the price of a nose job?",
    "How long is rhinoplasty recovery?",
    "Can I see nose job results before surgery?",
  ],
  chin_filler: [
    "Can chin filler fix my side profile?",
    "How much does chin filler cost?",
  ],
  hair_transplant: [
    "How much does a hair transplant cost?",
    "When will transplanted hair grow?",
    "Is FUE painful?",
  ],
  skin: ["Do you treat acne scars?", "How many laser sessions do I need?"],
  pricing: ["Do you have installment plans?", "Is the consultation free?"],
  availability: [
    "Do you have evening slots?",
    "Are you open on Saturday?",
    "How soon can I get an appointment?",
  ],
  location: ["Where exactly is the clinic?", "Is there parking available?"],
  aftercare: [
    "How much downtime will I need?",
    "What are the side effects?",
  ],
  doctor: ["Who performs the procedures?", "Is the doctor board certified?"],
};

const PROC_TOPICS = [
  "lip_filler", "lip_filler", "lip_filler", "botox", "botox", "botox",
  "rhinoplasty", "rhinoplasty", "hair_transplant", "hair_transplant",
  "chin_filler", "skin",
];
const SIDE_TOPICS = [
  "pricing", "pricing", "pricing", "availability", "availability",
  "aftercare", "location", "doctor",
];

export interface VyberoSeed {
  appointments: Appointment[];
  vyberoCalls: VyberoCall[];
}

export function buildVyberoSeed(patients: PatientT[]): VyberoSeed {
  const rnd = mulberry32(20260710);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const calls: VyberoCall[] = [];
  const appointments: Appointment[] = [];

  const at = (dayOffset: number, hour: number, minute: number) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  // ---- calls: past 14 days ------------------------------------------
  const HOURS = [9, 10, 11, 11, 12, 12, 13, 14, 15, 16, 17, 17, 18, 18, 19];
  for (let day = -13; day <= 0; day++) {
    const weekday = at(day, 12, 0).getDay();
    if (weekday === 0) continue; // clinic closed Sunday
    const n = 3 + Math.floor(rnd() * (weekday === 6 ? 6 : 5));
    for (let i = 0; i < n; i++) {
      const started = at(day, pick(HOURS), Math.floor(rnd() * 60));
      if (started.getTime() > Date.now()) continue;
      const roll = rnd();
      const outcome: CallOutcome =
        roll < 0.38 ? "booked" : roll < 0.72 ? "info" : roll < 0.84 ? "callback" : roll < 0.9 ? "transferred" : "missed";
      const missed = outcome === "missed";
      const topic = pick(PROC_TOPICS);
      const side = pick(SIDE_TOPICS);
      const topics = missed ? [] : rnd() < 0.75 ? [topic, side] : [topic];
      const questions = missed
        ? []
        : topics.flatMap((t) =>
            rnd() < 0.8 ? [pick(TOPIC_QUESTIONS[t] ?? [])].filter(Boolean) : []
          );
      calls.push({
        id: crypto.randomUUID(),
        started_at: started.toISOString(),
        duration_secs: missed ? 0 : 45 + Math.floor(rnd() * 340),
        direction: "inbound",
        caller_name: missed ? undefined : pick(CALLER_NAMES),
        caller_phone: missed
          ? undefined
          : `+92 3${Math.floor(rnd() * 90 + 10)} ${Math.floor(rnd() * 9000000 + 1000000)}`,
        language: rnd() < 0.55 ? "Urdu" : rnd() < 0.8 ? "English" : "Punjabi",
        outcome,
        topics,
        questions,
        summary: missed
          ? "Missed call, no answer."
          : `Caller asked about ${topics.map((t) => t.replace(/_/g, " ")).join(" and ")}${outcome === "booked" ? "; booked a consultation." : "."}`,
        rating: !missed && rnd() < 0.4 ? 4 + Math.round(rnd()) : undefined,
      });
    }
  }

  // ---- appointments: past week (done) + coming week (booked) ---------
  const SLOT_STARTS = [10, 10.5, 11, 11.5, 12, 12.5, 14, 14.5, 15, 15.5, 16, 16.5, 17, 17.5, 18, 18.5];
  const PROCS = ["lip_filler", "botox", "rhinoplasty", "chin_filler", "hair_transplant"];
  const bookedCalls = calls.filter((c) => c.outcome === "booked");
  let bookedIdx = 0;

  for (let day = -6; day <= 7; day++) {
    const weekday = at(day, 12, 0).getDay();
    if (weekday === 0) continue;
    const n = day < 0 ? 2 + Math.floor(rnd() * 3) : 3 + Math.floor(rnd() * 4);
    const used = new Set<number>();
    for (let i = 0; i < n; i++) {
      let slot = pick(SLOT_STARTS);
      let guard = 0;
      while (used.has(slot) && guard++ < 20) slot = pick(SLOT_STARTS);
      if (used.has(slot)) continue;
      used.add(slot);
      const start = at(day, Math.floor(slot), (slot % 1) * 60);
      const srcRoll = rnd();
      const source = srcRoll < 0.35 ? "vybero" : srcRoll < 0.9 ? "front_desk" : "booth";
      const call = source === "vybero" ? bookedCalls[bookedIdx++ % Math.max(1, bookedCalls.length)] : undefined;
      const patient = rnd() < 0.25 ? pick(patients) : undefined;
      const past = start.getTime() < Date.now();
      const typeRoll = rnd();
      appointments.push({
        id: crypto.randomUUID(),
        patient_id: patient?.id,
        patient_name: patient?.name ?? call?.caller_name ?? pick(CALLER_NAMES),
        phone: call?.caller_phone,
        start: start.toISOString(),
        duration_min: typeRoll < 0.6 ? 30 : typeRoll < 0.9 ? 45 : 60,
        type: typeRoll < 0.6 ? "consultation" : typeRoll < 0.9 ? "treatment" : "follow_up",
        procedure_interest: call?.topics.find((t) => PROCS.includes(t)) ?? pick(PROCS),
        source,
        status: past ? (rnd() < 0.85 ? "completed" : "no_show") : rnd() < 0.4 ? "confirmed" : "booked",
        notes: undefined,
        vybero_call_id: call?.id,
        created_at: new Date(start.getTime() - 86400000 * (1 + rnd() * 4)).toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (call) call.appointment_id = appointments[appointments.length - 1].id;
    }
  }

  appointments.sort((a, b) => a.start.localeCompare(b.start));
  calls.sort((a, b) => b.started_at.localeCompare(a.started_at));
  return { appointments, vyberoCalls: calls };
}
