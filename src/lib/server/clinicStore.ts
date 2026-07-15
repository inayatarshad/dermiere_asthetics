/**
 * Clinic identity, config and provisioning — server side.
 *
 * A "clinic" is a Postgres row (clinics) plus its staff (users). This module
 * creates them, authenticates logins, serves per-clinic config, and seeds a
 * demo clinic on an empty database so the deployment is usable out of the
 * box. Real clinics are provisioned clean (one admin, no sample data).
 */

import type {
  ClinicConfig,
  ClinicHours,
  Patient,
  Appointment,
  VyberoCall,
  Role,
} from "@/lib/types";
import { DEFAULT_CLINIC_HOURS } from "@/lib/types";
import { hashPassword, verifyPassword } from "./auth";
import {
  pgCountClinics,
  pgGetClinic,
  pgGetClinicBySlug,
  pgGetUserByEmail,
  pgListClinics,
  pgListUsers,
  pgUpsertClinic,
  pgUpsertUser,
  pgSetUserActive,
  pgReplaceRecords,
  pgUpsertAppointment,
  pgUpsertCall,
  type UserRow,
} from "./db";

const uid = () => crypto.randomUUID();

export const DEMO_CLINIC_SLUG = "meridian";
const DEMO_PASSWORD = "contour";

// ---------------------------------------------------------------------
// Config defaults + shape
// ---------------------------------------------------------------------

export function defaultConfig(base: {
  id: string;
  name: string;
  slug: string;
  city?: string;
  demo?: boolean;
}): ClinicConfig {
  return {
    id: base.id,
    name: base.name,
    slug: base.slug,
    city: base.city ?? "",
    branding: {},
    hours: DEFAULT_CLINIC_HOURS,
    menu: [],
    prices: {},
    toxinPricePerUnit: 1500,
    aiCaps: { generations: 0, assessments: 0 },
    demo: base.demo ?? false,
  };
}

export async function getClinicConfig(
  clinicId: string
): Promise<ClinicConfig | null> {
  const row = await pgGetClinic<ClinicConfig>(clinicId);
  if (!row) return null;
  return normalizeConfig(row.id, row.name, row.slug, row.payload);
}

export async function listClinicConfigs(): Promise<ClinicConfig[]> {
  const rows = await pgListClinics<ClinicConfig>();
  return rows.map((r) => normalizeConfig(r.id, r.name, r.slug, r.payload));
}

/** Backfill any fields missing from an older stored payload. */
function normalizeConfig(
  id: string,
  name: string,
  slug: string | null,
  payload: Partial<ClinicConfig> | null
): ClinicConfig {
  const d = defaultConfig({ id, name, slug: slug ?? id });
  return {
    ...d,
    ...(payload ?? {}),
    id,
    name,
    slug: slug ?? payload?.slug ?? id,
    branding: { ...d.branding, ...(payload?.branding ?? {}) },
    hours: { ...d.hours, ...(payload?.hours ?? {}) },
    menu: payload?.menu ?? d.menu,
    prices: payload?.prices ?? d.prices,
    aiCaps: { ...d.aiCaps, ...(payload?.aiCaps ?? {}) },
  };
}

export async function saveClinicConfig(config: ClinicConfig): Promise<void> {
  await pgUpsertClinic(config.id, config.name, config.slug, config);
}

// ---------------------------------------------------------------------
// Staff / users
// ---------------------------------------------------------------------

export interface StaffUser {
  id: string;
  clinic_id: string;
  name: string;
  email: string;
  role: Role;
  title?: string;
  active: boolean;
}

function toStaff(row: UserRow<{ name?: string; title?: string }>): StaffUser {
  return {
    id: row.id,
    clinic_id: row.clinic_id,
    name: row.payload?.name ?? row.email,
    email: row.email,
    role: row.role as Role,
    title: row.payload?.title,
    active: row.active,
  };
}

export async function listStaff(clinicId: string): Promise<StaffUser[]> {
  const rows = await pgListUsers<{ name?: string; title?: string }>(clinicId);
  return rows.map(toStaff);
}

export async function addStaff(
  clinicId: string,
  data: { name: string; email: string; role: Role; title?: string; password?: string }
): Promise<StaffUser> {
  const existing = await pgGetUserByEmail(data.email);
  if (existing) throw new Error("A user with that email already exists.");
  const id = uid();
  await pgUpsertUser(
    id,
    clinicId,
    data.email,
    data.role,
    hashPassword(data.password || DEMO_PASSWORD),
    true,
    { name: data.name, title: data.title }
  );
  return {
    id,
    clinic_id: clinicId,
    name: data.name,
    email: data.email.toLowerCase(),
    role: data.role,
    title: data.title,
    active: true,
  };
}

export async function setStaffActive(
  clinicId: string,
  id: string,
  active: boolean
): Promise<void> {
  await pgSetUserActive(clinicId, id, active);
}

// ---------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------

export interface AuthResult {
  user: StaffUser;
  config: ClinicConfig;
}

export async function authenticate(
  email: string,
  password: string
): Promise<AuthResult | null> {
  const row = await pgGetUserByEmail<{ name?: string; title?: string }>(email);
  if (!row || !row.active) return null;
  if (!verifyPassword(password, row.password_hash)) return null;
  const config = await getClinicConfig(row.clinic_id);
  if (!config) return null;
  return { user: toStaff(row), config };
}

// ---------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------

export interface ProvisionInput {
  name: string;
  slug: string;
  city?: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  demo?: boolean;
}

export async function provisionClinic(
  input: ProvisionInput
): Promise<ClinicConfig> {
  const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const existing = await pgGetClinicBySlug(slug);
  if (existing) throw new Error(`A clinic with slug "${slug}" already exists.`);
  const emailTaken = await pgGetUserByEmail(input.adminEmail);
  if (emailTaken) throw new Error("That admin email is already in use.");

  const id = `clinic_${slug}_${uid().slice(0, 8)}`;
  const config = defaultConfig({
    id,
    name: input.name,
    slug,
    city: input.city,
    demo: input.demo,
  });
  await saveClinicConfig(config);
  await pgUpsertUser(
    uid(),
    id,
    input.adminEmail,
    "admin",
    hashPassword(input.adminPassword),
    true,
    { name: input.adminName, title: "Clinic Administrator" }
  );
  return config;
}

/**
 * Seeds the demo clinic (Meridian) with three staff roles and a little
 * sample data, but only when the database has no clinics yet. Idempotent
 * and safe to call on every login attempt / bootstrap.
 */
let seedOnce: Promise<void> | null = null;
export function ensureSeedClinic(): Promise<void> {
  if (!seedOnce) {
    seedOnce = (async () => {
      const count = await pgCountClinics();
      if (count > 0) return;

      const id = `clinic_${DEMO_CLINIC_SLUG}`;
      const config: ClinicConfig = {
        ...defaultConfig({
          id,
          name: "Meridian Aesthetics",
          slug: DEMO_CLINIC_SLUG,
          city: "Lahore",
          demo: true,
        }),
        branding: {
          tagline: "Refined, natural-looking aesthetic medicine.",
          phone: "+92 42 111 000 111",
          email: "care@meridianaesthetics.pk",
          address: "Gulberg III, Lahore",
          brandColor: "#12b8a6",
        },
      };
      await saveClinicConfig(config);

      const staff: Array<{ email: string; role: Role; name: string; title?: string }> = [
        { email: "doctor@meridian.clinic", role: "doctor", name: "Dr. Ayesha Rahman", title: "Consultant Aesthetic Physician" },
        { email: "frontdesk@meridian.clinic", role: "front_desk", name: "Sana Malik" },
        { email: "admin@meridian.clinic", role: "admin", name: "Omar Farooq", title: "Clinic Administrator" },
      ];
      const ids: Record<string, string> = {};
      for (const s of staff) {
        const userId = uid();
        ids[s.role] = userId;
        await pgUpsertUser(
          userId,
          id,
          s.email,
          s.role,
          hashPassword(DEMO_PASSWORD),
          true,
          { name: s.name, title: s.title }
        );
      }

      await seedDemoData(id, ids.doctor);
    })();
    seedOnce = seedOnce.catch((err) => {
      seedOnce = null;
      throw err;
    });
  }
  return seedOnce;
}

/** A compact, image-free demo story so the demo clinic looks alive. */
async function seedDemoData(clinicId: string, doctorId: string): Promise<void> {
  const now = Date.now();
  const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  const day = 86_400_000;

  const patients: Patient[] = [
    {
      id: uid(), clinic_id: clinicId, name: "Mahnoor Baig", phone: "0300 8471234",
      email: "mahnoor.b@gmail.com", age: 27, gender: "female", city: "Lahore",
      language: "english", source: "social",
      clinical_flags: { fitzpatrick: 3, prior_treatments: "None. First aesthetic consultation", allergies: "None known" },
      created_at: iso(-2 * day),
    },
    {
      id: uid(), clinic_id: clinicId, name: "Hassan Raza", phone: "0321 5567890",
      age: 32, gender: "male", city: "Karachi", language: "english", source: "vibro",
      clinical_flags: { fitzpatrick: 4 }, created_at: iso(-1 * day),
    },
    {
      id: uid(), clinic_id: clinicId, name: "Zainab Qureshi", phone: "0333 2211004",
      age: 24, gender: "female", city: "Islamabad", language: "english", source: "referral",
      clinical_flags: { fitzpatrick: 3 }, created_at: iso(-5 * day),
    },
  ];
  await pgReplaceRecords(
    clinicId,
    "patients",
    patients.map((p) => ({ id: p.id, payload: p }))
  );

  const appts: Appointment[] = [
    {
      id: uid(), patient_id: patients[0].id, patient_name: "Mahnoor Baig", phone: "0300 8471234",
      start: iso(2 * 3600_000), duration_min: 30, type: "consultation",
      procedure_interest: "rhinoplasty", source: "front_desk", status: "confirmed",
      created_at: iso(-day), updated_at: iso(-day),
    },
    {
      id: uid(), patient_name: "Ali Hamza", phone: "0300 1122334",
      start: iso(day + 3 * 3600_000), duration_min: 30, type: "consultation",
      procedure_interest: "lip_filler", source: "vybero", status: "booked",
      created_at: iso(-3600_000), updated_at: iso(-3600_000),
    },
  ];
  for (const a of appts) {
    await pgUpsertAppointment(clinicId, a.id, a.start, a.status, a);
  }

  const topics = ["rhinoplasty", "lip_filler", "botox", "pricing", "aftercare"];
  const outcomes: VyberoCall["outcome"][] = ["booked", "info", "callback", "booked", "info"];
  for (let i = 0; i < 12; i++) {
    const call: VyberoCall = {
      id: uid(), started_at: iso(-i * 6 * 3600_000 - 3600_000),
      duration_secs: 90 + ((i * 37) % 180), direction: "inbound",
      caller_name: ["Ayesha", "Bilal", "Fatima", "Usman", "Hira"][i % 5],
      caller_phone: `0300 12${(1000 + i).toString()}`,
      language: i % 3 === 0 ? "urdu" : "english",
      outcome: outcomes[i % outcomes.length],
      topics: [topics[i % topics.length]],
      questions: ["How much does it cost?", "What is the recovery time?"].slice(0, (i % 2) + 1),
      summary: "Caller asked about the procedure and pricing; guided to booking.",
      rating: 4 + (i % 2),
    };
    await pgUpsertCall(clinicId, call.id, call.started_at, call);
  }
  void doctorId;
}
