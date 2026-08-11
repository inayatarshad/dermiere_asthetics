/**
 * The bootstrap payload - everything the client store hydrates from on
 * login, all scoped to the caller's clinic. This is the single source of
 * truth handoff: the browser renders from here, never from a client-only
 * seed. Shared by /api/auth/login and /api/auth/me.
 */

import type {
  Appointment,
  Asset,
  ClinicHours,
  ClinicLocation,
  Consent,
  Consultation,
  Invoice,
  Patient,
  PlanItem,
  Report,
  Reward,
  TreatmentPlan,
  User,
  Visualization,
  VyberoCall,
  Workspace,
} from "@/lib/types";
import {
  pgListRecords,
  pgListAppointments,
  pgListCalls,
  pgListUsers,
  pgGetUsage,
} from "./db";
import { getClinicConfig } from "./clinicStore";
import { derivePatientBranches } from "@/lib/patientBranch";

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

export interface BootstrapPayload {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    title?: string;
    clinic_id: string;
    /** The site this person works at, when they work at one. Presentation
        only: it never limits what they may open. */
    branch_id?: string;
    /** Which product surface this login sees. */
    workspace: Workspace;
  };
  clinic: { id: string; name: string; city: string; branding: Record<string, string | undefined> };
  users: User[];
  clinicHours: ClinicHours;
  toxinPricePerUnit: number;
  menu: string[];
  prices: Record<string, number>;
  vyberoAgentId?: string;
  bookingUrl?: string;
  aiCaps: { generations: number; assessments: number };
  demo: boolean;
  aiUsage: { generations: number; assessments: number };
  locations?: ClinicLocation[];
  taxRate?: number;
  reviewIncentive?: { kind: "discount"; value: number; validityDays: number };
  records: {
    patients: Patient[];
    consents: Consent[];
    assets: Asset[];
    consultations: Consultation[];
    visualizations: Visualization[];
    plans: TreatmentPlan[];
    planItems: PlanItem[];
    reports: Report[];
    invoices?: Invoice[];
    rewards?: Reward[];
  };
  appointments: Appointment[];
  vyberoCalls: VyberoCall[];
}

export async function buildBootstrap(
  clinicId: string,
  userId: string
): Promise<BootstrapPayload | null> {
  const config = await getClinicConfig(clinicId);
  if (!config) return null;

  const [
    staffRows,
    patients,
    consents,
    assets,
    consultations,
    visualizations,
    plans,
    planItems,
    reports,
    invoices,
    rewards,
    appointments,
    vyberoCalls,
    usage,
  ] = await Promise.all([
    pgListUsers<{
      name?: string;
      title?: string;
      workspace?: Workspace;
      branch_id?: string;
    }>(clinicId),
    pgListRecords<Patient>(clinicId, "patients"),
    pgListRecords<Consent>(clinicId, "consents"),
    pgListRecords<Asset>(clinicId, "assets"),
    pgListRecords<Consultation>(clinicId, "consultations"),
    pgListRecords<Visualization>(clinicId, "visualizations"),
    pgListRecords<TreatmentPlan>(clinicId, "plans"),
    pgListRecords<PlanItem>(clinicId, "plan_items"),
    pgListRecords<Report>(clinicId, "reports"),
    pgListRecords<Invoice>(clinicId, "invoices"),
    pgListRecords<Reward>(clinicId, "rewards"),
    pgListAppointments<Appointment>(clinicId),
    pgListCalls<VyberoCall>(clinicId),
    pgGetUsage(clinicId, currentMonth()),
  ]);

  const users: User[] = staffRows.map((r) => ({
    id: r.id,
    clinic_id: r.clinic_id,
    name: r.payload?.name ?? r.email,
    email: r.email,
    role: r.role as User["role"],
    password: "",
    title: r.payload?.title,
    branch_id: r.payload?.branch_id,
    active: r.active,
    workspace: r.payload?.workspace === "crm" ? "crm" : "clinic",
  }));

  const me = users.find((u) => u.id === userId);
  // A session whose user no longer exists (demo reset, deleted staff) or
  // was deactivated must not hydrate a ghost workspace - the caller
  // answers 401/404 and the client returns to login.
  if (!me || !me.active) return null;

  // Assigned branch staff receive only their own operational data. The
  // founder/admin has no branch_id and retains the complete clinic view.
  const branchId = me.branch_id;
  const configuredLocationIds = new Set((config.locations ?? []).map((item) => item.id));
  const canonicalAppointments = appointments.filter(
    (appointment) =>
      !!appointment.location_id && configuredLocationIds.has(appointment.location_id)
  );
  const canonicalInvoices = invoices.filter((invoice) =>
    configuredLocationIds.has(invoice.location_id)
  );
  const patientBranches = derivePatientBranches(
    patients,
    canonicalAppointments,
    canonicalInvoices
  );
  const scopedPatients = branchId
    ? patients.filter((patient) => patientBranches.get(patient.id) === branchId)
    : patients;
  const patientIds = new Set(scopedPatients.map((patient) => patient.id));
  const scopedConsultations = branchId
    ? consultations.filter((consultation) => patientIds.has(consultation.patient_id))
    : consultations;
  const consultationIds = new Set(scopedConsultations.map((item) => item.id));
  const scopedPlans = branchId
    ? plans.filter((plan) => consultationIds.has(plan.consultation_id))
    : plans;
  const planIds = new Set(scopedPlans.map((plan) => plan.id));
  const scopedInvoices = branchId
    ? canonicalInvoices.filter((invoice) => invoice.location_id === branchId)
    : canonicalInvoices;
  const scopedAppointments = branchId
    ? canonicalAppointments.filter((appointment) => appointment.location_id === branchId)
    : canonicalAppointments;

  return {
    user: {
      id: userId,
      name: me.name,
      email: me.email,
      role: me.role,
      title: me.title,
      branch_id: me.branch_id,
      clinic_id: clinicId,
      workspace: me.workspace ?? "clinic",
    },
    clinic: {
      id: config.id,
      name: config.name,
      city: config.city,
      branding: config.branding,
    },
    users,
    clinicHours: config.hours,
    toxinPricePerUnit: config.toxinPricePerUnit,
    menu: config.menu,
    prices: config.prices,
    vyberoAgentId: config.vyberoAgentId,
    bookingUrl: config.bookingUrl,
    aiCaps: config.aiCaps,
    demo: config.demo,
    aiUsage: usage,
    locations: config.locations ?? [],
    taxRate: config.taxRate ?? 16,
    reviewIncentive: config.reviewIncentive,
    records: {
      patients: scopedPatients,
      consents: branchId
        ? consents.filter((consent) => patientIds.has(consent.patient_id))
        : consents,
      assets: branchId
        ? assets.filter((asset) => patientIds.has(asset.patient_id))
        : assets,
      consultations: scopedConsultations,
      visualizations: branchId
        ? visualizations.filter((item) => consultationIds.has(item.consultation_id))
        : visualizations,
      plans: scopedPlans,
      planItems: branchId
        ? planItems.filter((item) => planIds.has(item.plan_id))
        : planItems,
      reports: branchId
        ? reports.filter((report) => consultationIds.has(report.consultation_id))
        : reports,
      invoices: scopedInvoices,
      rewards: branchId
        ? rewards.filter((reward) => !reward.patient_id || patientIds.has(reward.patient_id))
        : rewards,
    },
    appointments: scopedAppointments,
    // Calls do not carry a reliable branch until a booking is linked. Keep
    // the all-clinic transcript log with the unassigned founder/admin.
    vyberoCalls: branchId ? [] : vyberoCalls,
  };
}
