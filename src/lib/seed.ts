/**
 * Client-fallback seed — CAPTURE demo clinic.
 *
 * Real logins hydrate from the server bootstrap (clinicStore seeds the
 * database). This module only feeds device-local fallback surfaces (the
 * public /report route on a fresh browser) and is a thin adapter over
 * the shared CAPTURE cast so client and server stories never drift.
 */

import type {
  Appointment,
  Asset,
  Clinic,
  Consent,
  Consultation,
  Invoice,
  Patient,
  PlanItem,
  Reward,
  SkinAnalysis,
  TreatmentPlan,
  User,
  VyberoCall,
} from "./types";
import { CAPTURE_BRAND, CAPTURE_LOCATIONS } from "./capture/kb";
import {
  buildCaptureCast,
  buildCaptureUsers,
  CAPTURE_DEMO_PASSWORD,
  type CaptureCast,
} from "./capture/cast";

export const DEMO_PASSWORD = CAPTURE_DEMO_PASSWORD;

const CLINIC_ID = "clinic_capture";

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
  invoices: Invoice[];
  rewards: Reward[];
  skinAnalyses: SkinAnalysis[];
}

function makeCast(): { users: User[]; cast: CaptureCast } {
  const users = buildCaptureUsers(CLINIC_ID);
  const doctor = users.find((u) => u.role === "doctor")!;
  const frontDesk = users.find((u) => u.email === "frontdesk@capture.cc")!;
  const cast = buildCaptureCast(CLINIC_ID, {
    doctorId: doctor.id,
    doctorName: doctor.name,
    frontDeskId: frontDesk.id,
  });
  return { users, cast };
}

export function buildSeed(_manifest: SeedManifest | null): SeedData {
  const { users, cast } = makeCast();
  const hq = CAPTURE_LOCATIONS[0];

  const clinic: Clinic = {
    id: CLINIC_ID,
    name: CAPTURE_BRAND.name,
    city: hq.city,
    branding: {
      tagline: CAPTURE_BRAND.tagline,
      phone: CAPTURE_BRAND.whatsapp,
      email: CAPTURE_BRAND.email,
      address: `${hq.address}, ${hq.city}`,
      brandColor: "#C4A15A",
      logoUrl: "/brand/capture-logo-black.png",
    },
  };

  return {
    clinic,
    users,
    patients: cast.patients,
    consents: cast.consents,
    assets: cast.assets,
    consultations: cast.consultations,
    plans: [],
    planItems: [],
    invoices: cast.invoices,
    rewards: cast.rewards,
    skinAnalyses: cast.skinAnalyses,
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
// VYBERO demo story (appointments + calls) — same deterministic cast, so
// ids line up with buildSeed() output on the same device.
// ---------------------------------------------------------------------

export interface VyberoSeed {
  appointments: Appointment[];
  vyberoCalls: VyberoCall[];
}

export function buildVyberoSeed(_patients: Patient[]): VyberoSeed {
  const { cast } = makeCast();
  return { appointments: cast.appointments, vyberoCalls: cast.vyberoCalls };
}
