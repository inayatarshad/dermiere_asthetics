/**
 * Dermiere Aesthetics - clinic identity and its branches.
 *
 * This module is used ONCE, at provisioning time, to write the clinic row.
 * After that the database is the source of truth: branches live in
 * clinics.payload.locations and are edited in Settings, so opening a third
 * branch never requires a code change. Nothing in the CRM imports the branch
 * constants below - CRM rows carry a `branch_id` and resolve it against
 * whatever the clinic config currently holds.
 *
 * All data here is fictional.
 */

import type { ClinicLocation } from "@/lib/types";

export const DERMIERE_SLUG = "dermiere";

/**
 * The shared sign-in password for every seeded Dermiere account.
 *
 * This is a demonstration clinic: the staff, patients and clinical history
 * behind these logins are all fictional, and the password exists so the
 * workspace can be shown without anyone typing credentials. The sign-in
 * screen prefills it alongside the email so picking a person and pressing
 * Enter is enough.
 *
 * It is NOT a secret and must never be reused for a real clinic - a live
 * deployment provisions its own accounts with their own passwords.
 */
export const DERMIERE_DEMO_PASSWORD = "dermiere-dev-2026";

export const DERMIERE_BRAND = {
  name: "Dermiére Aesthetics",
  tagline: "Skin, considered.",
  phone: "+92 51 2298 4410",
  email: "hello@dermiere.pk",
  brandColor: "#8E7A66",
  city: "Islamabad",
  hours: { open: "11:00", close: "20:00", slot_min: 30, days: [1, 2, 3, 4, 5, 6] },
};

/**
 * The two branches, main first. Seeded into the clinic config, never
 * referenced by CRM logic - see the module note above.
 *
 * Order is meaningful: the first entry is the clinic's main site and leads
 * the sign-in screen, the branch filters and anything that falls back to
 * "the default branch". F-10 in Islamabad is the main clinic; Gulberg is
 * the Lahore branch, a different city rather than a second Islamabad site.
 */
export const DERMIERE_BRANCHES: ClinicLocation[] = [
  {
    id: "branch_f10",
    name: "Dermiére F-10",
    short: "F-10",
    kind: "experience_centre",
    doctor: "Dr. Omar Sheikh",
    address: "Ahmed Faraz Road, Sector F-10/1",
    area: "F-10",
    city: "Islamabad",
    phone: "+92 51 2298 4410",
    invoicePrefix: "F10",
  },
  {
    id: "branch_gulberg",
    name: "Dermiére Gulberg",
    short: "Gulberg",
    kind: "experience_centre",
    doctor: "Dr. Sana Bukhari",
    address: "First Floor, 71-A Main Boulevard, Gulberg II",
    area: "Gulberg II",
    city: "Lahore",
    phone: "+92 42 3577 8800",
    invoicePrefix: "GLB",
  },
];

/** Treatment menu - ids are the catalogue keys used by CRM interest + POS. */
export const DERMIERE_TREATMENTS = [
  { id: "hydrafacial", name: "HydraFacial", price: 18000 },
  { id: "chemical_peel", name: "Medical-grade Chemical Peel", price: 15000 },
  { id: "laser_hair", name: "Laser Hair Reduction", price: 22000 },
  { id: "microneedling", name: "Microneedling with PRP", price: 35000 },
  { id: "botox", name: "Anti-wrinkle Injections", price: 45000 },
  { id: "filler", name: "Dermal Filler", price: 65000 },
  { id: "skin_boosters", name: "Skin Boosters", price: 40000 },
  { id: "acne_program", name: "Acne Clearance Programme", price: 55000 },
  { id: "pigmentation", name: "Pigmentation Correction", price: 38000 },
  { id: "consult", name: "Consultation", price: 3000 },
];

export const DERMIERE_TREATMENT_LABELS: Record<string, string> =
  Object.fromEntries(DERMIERE_TREATMENTS.map((t) => [t.id, t.name]));

/**
 * Fictional staff. Passwords are set at provisioning time, never stored here.
 *
 * `workspace` decides which product surface the account lands in. It is
 * independent of `role`, which still governs every permission: the CRM
 * account below is a full admin whose navigation is the CRM workspace.
 */
export const DERMIERE_STAFF = [
  {
    key: "owner",
    name: "Dr. Anusha Liaqat",
    email: "anusha@dermiere.pk",
    role: "admin" as const,
    title: "Founder & Director",
    workspace: "clinic" as const,
  },
  {
    key: "marketing",
    name: "Saad Kamal",
    email: "saad@dermiere.pk",
    role: "admin" as const,
    title: "Marketing Lead",
    workspace: "clinic" as const,
  },
  {
    key: "operations",
    name: "Shah Rukh Ahmed",
    email: "shahrukh@dermiere.pk",
    role: "admin" as const,
    title: "Head of Operations",
    workspace: "clinic" as const,
  },
  // The CRM is its own workspace with its own people. A manager owns the
  // pipeline; an agent works the inbox. Both are admins because the CRM's
  // own permission table, not the clinic role, decides what they can do.
  {
    key: "crm",
    name: "Mehreen Alvi",
    email: "mehreen@dermiere.pk",
    role: "admin" as const,
    title: "CRM Manager",
    workspace: "crm" as const,
  },
  {
    key: "crm_agent",
    name: "Taimoor Abbas",
    email: "taimoor@dermiere.pk",
    role: "admin" as const,
    title: "CRM Agent",
    workspace: "crm" as const,
  },
  {
    key: "doctor_gulberg",
    name: "Dr. Sana Bukhari",
    email: "sana@dermiere.pk",
    role: "doctor" as const,
    title: "Consultant Dermatologist · Gulberg",
    workspace: "clinic" as const,
  },
  {
    key: "doctor_f10",
    name: "Dr. Omar Sheikh",
    email: "omar@dermiere.pk",
    role: "doctor" as const,
    title: "Consultant Dermatologist · F-10",
    workspace: "clinic" as const,
  },
  {
    key: "frontdesk_gulberg",
    name: "Nimra Sajid",
    email: "nimra@dermiere.pk",
    role: "front_desk" as const,
    title: "Front Desk · Gulberg",
    workspace: "clinic" as const,
  },
  {
    key: "frontdesk_f10",
    name: "Faraz Siddiqui",
    email: "faraz@dermiere.pk",
    role: "front_desk" as const,
    title: "Front Desk · F-10",
    workspace: "clinic" as const,
  },
];
