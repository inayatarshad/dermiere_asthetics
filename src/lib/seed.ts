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
