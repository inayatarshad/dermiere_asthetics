/**
 * Clinic identity, config and provisioning — server side.
 *
 * A "clinic" is a Postgres row (clinics) plus its staff (users). This module
 * creates them, authenticates logins, serves per-clinic config, and seeds a
 * demo clinic on an empty database so the deployment is usable out of the
 * box. Real clinics are provisioned clean (one admin, no sample data).
 */

import type { ClinicConfig, Role } from "@/lib/types";
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
  pgUpsertReviewInvite,
  pgUpsertReview,
  type UserRow,
} from "./db";
import {
  CAPTURE_BRAND,
  CAPTURE_LOCATIONS,
  CAPTURE_TREATMENTS,
} from "@/lib/capture/kb";
import {
  CAPTURE_STAFF,
  CAPTURE_DEMO_PASSWORD,
  buildCaptureCast,
} from "@/lib/capture/cast";

const uid = () => crypto.randomUUID();

export const DEMO_CLINIC_SLUG = "capture";
const DEMO_PASSWORD = CAPTURE_DEMO_PASSWORD;

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
    locations: [],
    taxRate: 16,
    reviewIncentive: { kind: "discount", value: 10, validityDays: 60 },
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
    locations: payload?.locations ?? d.locations,
    taxRate: payload?.taxRate ?? d.taxRate,
    reviewIncentive: payload?.reviewIncentive ?? d.reviewIncentive,
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

/** Admin resets a staff member's password (no old password needed). */
export async function setStaffPassword(
  clinicId: string,
  id: string,
  password: string
): Promise<void> {
  const rows = await pgListUsers<{ name?: string; title?: string }>(clinicId);
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("User not found in this clinic.");
  await pgUpsertUser(
    row.id,
    clinicId,
    row.email,
    row.role,
    hashPassword(password),
    row.active,
    row.payload
  );
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
 * Production gate: with SEED_DEMO=false (or 0/off) an empty database is
 * left empty — real deployments provision clean clinics via
 * /api/admin/provision and demo data can never mix with client data.
 */
function demoSeedDisabled(): boolean {
  const v = (process.env.SEED_DEMO ?? "").trim().toLowerCase();
  return v === "false" || v === "0" || v === "off" || v === "no";
}

/**
 * Seeds the demo clinic (CAPTURE) with the full team and the complete
 * demo story — patients, MARK-VU scans, appointments across all four
 * locations, VYBERO calls, invoices, reviews and Capture Circle rewards —
 * but only when the database has no clinics yet. Idempotent and safe to
 * call on every login attempt / bootstrap. Disabled by SEED_DEMO=false.
 */
let seedOnce: Promise<void> | null = null;
export function ensureSeedClinic(): Promise<void> {
  if (demoSeedDisabled()) return Promise.resolve();
  if (!seedOnce) {
    seedOnce = (async () => {
      const count = await pgCountClinics();
      if (count > 0) return;

      const id = `clinic_${DEMO_CLINIC_SLUG}`;
      const config: ClinicConfig = {
        ...defaultConfig({
          id,
          name: CAPTURE_BRAND.name,
          slug: DEMO_CLINIC_SLUG,
          city: "Lahore",
          demo: true,
        }),
        branding: {
          tagline: CAPTURE_BRAND.tagline,
          phone: CAPTURE_BRAND.whatsapp,
          email: CAPTURE_BRAND.email,
          address: CAPTURE_LOCATIONS[0].address + ", " + CAPTURE_LOCATIONS[0].city,
          brandColor: "#C4A15A",
          logoUrl: "/brand/capture-logo-black.png",
        },
        hours: {
          open: CAPTURE_BRAND.hours.open,
          close: CAPTURE_BRAND.hours.close,
          slot_min: 30,
          days: [...CAPTURE_BRAND.hours.openDays],
        },
        menu: CAPTURE_TREATMENTS.map((t) => t.id),
        prices: Object.fromEntries(
          CAPTURE_TREATMENTS.map((t) => [t.id, t.pricePkr])
        ),
        // Noor — the ElevenLabs voice agent behind the VYBERO page widget
        vyberoAgentId: "agent_5601kxp631h7fgmthsaq3w3729qv",
        locations: CAPTURE_LOCATIONS.map((l) => ({
          id: l.id,
          name: l.name,
          short: l.short,
          kind: l.kind,
          doctor: l.doctor,
          address: l.address,
          area: l.area,
          city: l.city,
          phone: l.phone,
          invoicePrefix: l.invoicePrefix,
        })),
        taxRate: 16,
        reviewIncentive: { kind: "discount", value: 10, validityDays: 60 },
      };
      await saveClinicConfig(config);

      const ids: Record<string, string> = {};
      for (const s of CAPTURE_STAFF) {
        const userId = uid();
        ids[s.key] = userId;
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

      await seedDemoData(id, {
        doctorId: ids.doctor,
        doctorName: CAPTURE_STAFF[0].name,
        frontDeskId: ids.frontdesk,
      });
    })();
    seedOnce = seedOnce.catch((err) => {
      seedOnce = null;
      throw err;
    });
  }
  return seedOnce;
}

/** Writes the full CAPTURE demo story (built by capture/cast.ts). */
async function seedDemoData(
  clinicId: string,
  staff: { doctorId: string; doctorName: string; frontDeskId: string }
): Promise<void> {
  const cast = buildCaptureCast(clinicId, staff, 16);

  const replace = (table: string, rows: Array<{ id: string }>) =>
    pgReplaceRecords(
      clinicId,
      table,
      rows.map((r) => ({ id: r.id, payload: r }))
    );

  await replace("patients", cast.patients);
  await replace("consents", cast.consents);
  await replace("assets", cast.assets);
  await replace("consultations", cast.consultations);
  await replace("invoices", cast.invoices);
  await replace("rewards", cast.rewards);
  await replace("skin_analyses", cast.skinAnalyses);

  for (const a of cast.appointments) {
    await pgUpsertAppointment(clinicId, a.id, a.start, a.status, a);
  }
  for (const c of cast.vyberoCalls) {
    await pgUpsertCall(clinicId, c.id, c.started_at, c);
  }
  for (const inv of cast.reviewInvites) {
    await pgUpsertReviewInvite(clinicId, inv.id, inv.token, inv.created_at, inv);
  }
  for (const r of cast.reviews) {
    await pgUpsertReview(clinicId, r.id, r.created_at, r);
  }
}
