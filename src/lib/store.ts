"use client";

/**
 * Central store. Structured records persist to localStorage; images live in
 * IndexedDB (see db.ts). Deliberately simple per the demo build plan —
 * swap for Postgres + object storage post-IPAAC without touching the UI.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import type {
  Asset,
  Brief,
  CanvasState,
  Clinic,
  Consent,
  ConsentType,
  Consultation,
  Patient,
  PlanItem,
  PlanStatus,
  Report,
  Role,
  TreatmentPlan,
  User,
  Visualization,
} from "./types";
import { CONSENT_TEXT_VERSION } from "./types";
import { buildSeed, fetchSeedManifest } from "./seed";
import { getTemplate } from "./templates";

const uid = () => crypto.randomUUID();
const nowISO = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

interface StoreState {
  seeded: boolean;
  clinic: Clinic | null;
  users: User[];
  patients: Patient[];
  consents: Consent[];
  assets: Asset[];
  consultations: Consultation[];
  visualizations: Visualization[];
  plans: TreatmentPlan[];
  planItems: PlanItem[];
  reports: Report[];
  sessionUserId: string | null;

  // lifecycle
  seedIfNeeded: () => Promise<void>;
  resetDemo: () => Promise<void>;

  // auth
  login: (email: string, password: string) => User | null;
  logout: () => void;

  // patients & consent
  registerPatient: (
    data: Omit<Patient, "id" | "clinic_id" | "created_at">
  ) => Patient;
  updatePatient: (id: string, patch: Partial<Patient>) => void;
  setConsent: (
    patientId: string,
    type: ConsentType,
    granted: boolean,
    capturedBy: string
  ) => void;

  // assets
  addAsset: (
    asset: Omit<Asset, "id" | "created_at" | "visit_date"> & {
      visit_date?: string;
    }
  ) => Asset;
  removeAsset: (id: string) => void;

  // consultations
  createConsultation: (patientId: string, doctorId: string) => Consultation;
  updateBrief: (consultationId: string, brief: Brief) => void;
  saveCanvasState: (consultationId: string, state: CanvasState) => void;
  setDoctorNote: (consultationId: string, note: string) => void;
  setConsultationStatus: (
    consultationId: string,
    status: Consultation["status"]
  ) => void;

  // visualizations
  addVisualization: (
    v: Omit<Visualization, "id" | "created_at">
  ) => Visualization;

  // plans
  createPlanFromTemplate: (
    consultationId: string,
    templateId: string | null,
    summary?: string
  ) => TreatmentPlan;
  updatePlan: (planId: string, patch: Partial<TreatmentPlan>) => void;
  setPlanStatus: (planId: string, status: PlanStatus) => void;
  addPlanItem: (
    planId: string,
    item: Omit<PlanItem, "id" | "plan_id" | "order">
  ) => void;
  updatePlanItem: (id: string, patch: Partial<PlanItem>) => void;
  togglePlanItem: (id: string) => void;
  removePlanItem: (id: string) => void;
  deletePlan: (planId: string) => void;

  // reports
  ensureReport: (consultationId: string) => Report;

  // admin
  addUser: (data: {
    name: string;
    email: string;
    role: Role;
    title?: string;
  }) => User;
  setUserActive: (id: string, active: boolean) => void;
  updateClinic: (patch: Partial<Clinic>) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      seeded: false,
      clinic: null,
      users: [],
      patients: [],
      consents: [],
      assets: [],
      consultations: [],
      visualizations: [],
      plans: [],
      planItems: [],
      reports: [],
      sessionUserId: null,

      seedIfNeeded: async () => {
        if (get().seeded) return;
        const manifest = await fetchSeedManifest();
        // Re-check post-await in case another tab seeded meanwhile.
        if (get().seeded) return;
        const seed = buildSeed(manifest);
        set({
          seeded: true,
          clinic: seed.clinic,
          users: seed.users,
          patients: seed.patients,
          consents: seed.consents,
          assets: seed.assets,
          consultations: seed.consultations,
          plans: seed.plans,
          planItems: seed.planItems,
          visualizations: [],
          reports: [],
        });
      },

      resetDemo: async () => {
        const manifest = await fetchSeedManifest();
        const seed = buildSeed(manifest);
        set({
          seeded: true,
          clinic: seed.clinic,
          users: seed.users,
          patients: seed.patients,
          consents: seed.consents,
          assets: seed.assets,
          consultations: seed.consultations,
          plans: seed.plans,
          planItems: seed.planItems,
          visualizations: [],
          reports: [],
          sessionUserId: null,
        });
      },

      login: (email, password) => {
        const user = get().users.find(
          (u) =>
            u.email.toLowerCase() === email.trim().toLowerCase() &&
            u.password === password &&
            u.active
        );
        if (user) set({ sessionUserId: user.id });
        return user ?? null;
      },

      logout: () => set({ sessionUserId: null }),

      registerPatient: (data) => {
        const clinic = get().clinic;
        const patient: Patient = {
          ...data,
          id: uid(),
          clinic_id: clinic?.id ?? "clinic",
          created_at: nowISO(),
        };
        set((s) => ({ patients: [patient, ...s.patients] }));
        return patient;
      },

      updatePatient: (id, patch) =>
        set((s) => ({
          patients: s.patients.map((p) =>
            p.id === id ? { ...p, ...patch } : p
          ),
        })),

      setConsent: (patientId, type, granted, capturedBy) => {
        const consent: Consent = {
          id: uid(),
          patient_id: patientId,
          type,
          granted,
          granted_at: nowISO(),
          captured_by: capturedBy,
          text_version: CONSENT_TEXT_VERSION,
        };
        set((s) => ({
          // one active row per (patient, type) — newest wins
          consents: [
            ...s.consents.filter(
              (c) => !(c.patient_id === patientId && c.type === type)
            ),
            consent,
          ],
        }));
      },

      addAsset: (asset) => {
        const full: Asset = {
          ...asset,
          id: uid(),
          visit_date: asset.visit_date ?? today(),
          created_at: nowISO(),
        };
        set((s) => ({ assets: [...s.assets, full] }));
        return full;
      },

      removeAsset: (id) =>
        set((s) => ({ assets: s.assets.filter((a) => a.id !== id) })),

      createConsultation: (patientId, doctorId) => {
        const clinic = get().clinic;
        const consultation: Consultation = {
          id: uid(),
          patient_id: patientId,
          doctor_id: doctorId,
          clinic_id: clinic?.id ?? "clinic",
          date: nowISO(),
          brief: {
            primary_interest: null,
            interests: [],
            concerns: [],
            goal_text: "",
            flags: {},
          },
          canvas_state: { morphs: {}, annotations: [] },
          doctor_note: "",
          status: "open",
        };
        set((s) => ({ consultations: [consultation, ...s.consultations] }));
        return consultation;
      },

      updateBrief: (consultationId, brief) =>
        set((s) => ({
          consultations: s.consultations.map((c) =>
            c.id === consultationId ? { ...c, brief } : c
          ),
        })),

      saveCanvasState: (consultationId, state) =>
        set((s) => ({
          consultations: s.consultations.map((c) =>
            c.id === consultationId ? { ...c, canvas_state: state } : c
          ),
        })),

      setDoctorNote: (consultationId, note) =>
        set((s) => ({
          consultations: s.consultations.map((c) =>
            c.id === consultationId ? { ...c, doctor_note: note } : c
          ),
        })),

      setConsultationStatus: (consultationId, status) =>
        set((s) => ({
          consultations: s.consultations.map((c) =>
            c.id === consultationId ? { ...c, status } : c
          ),
        })),

      addVisualization: (v) => {
        const full: Visualization = { ...v, id: uid(), created_at: nowISO() };
        set((s) => ({ visualizations: [...s.visualizations, full] }));
        return full;
      },

      createPlanFromTemplate: (consultationId, templateId, summary) => {
        const template = getTemplate(templateId);
        const plan: TreatmentPlan = {
          id: uid(),
          consultation_id: consultationId,
          template_id: templateId ?? undefined,
          summary:
            summary ??
            (template
              ? `${template.name} as visualized and agreed during consultation.`
              : ""),
          status: "proposed",
          created_at: nowISO(),
        };
        const items: PlanItem[] = (template?.plan_template ?? []).map(
          (item, i) => ({
            id: uid(),
            plan_id: plan.id,
            kind: item.kind,
            label: item.label,
            detail: item.detail,
            due:
              item.offset_days !== undefined
                ? new Date(Date.now() + item.offset_days * 86400000)
                    .toISOString()
                    .slice(0, 10)
                : undefined,
            done: false,
            order: i,
          })
        );
        set((s) => ({
          plans: [...s.plans, plan],
          planItems: [...s.planItems, ...items],
        }));
        return plan;
      },

      updatePlan: (planId, patch) =>
        set((s) => ({
          plans: s.plans.map((p) => (p.id === planId ? { ...p, ...patch } : p)),
        })),

      setPlanStatus: (planId, status) =>
        set((s) => ({
          plans: s.plans.map((p) => (p.id === planId ? { ...p, status } : p)),
        })),

      addPlanItem: (planId, item) =>
        set((s) => {
          const order =
            Math.max(
              -1,
              ...s.planItems
                .filter((i) => i.plan_id === planId)
                .map((i) => i.order)
            ) + 1;
          return {
            planItems: [
              ...s.planItems,
              { ...item, id: uid(), plan_id: planId, order },
            ],
          };
        }),

      updatePlanItem: (id, patch) =>
        set((s) => ({
          planItems: s.planItems.map((i) =>
            i.id === id ? { ...i, ...patch } : i
          ),
        })),

      togglePlanItem: (id) =>
        set((s) => ({
          planItems: s.planItems.map((i) =>
            i.id === id ? { ...i, done: !i.done } : i
          ),
        })),

      removePlanItem: (id) =>
        set((s) => ({
          planItems: s.planItems.filter((i) => i.id !== id),
        })),

      deletePlan: (planId) =>
        set((s) => ({
          plans: s.plans.filter((p) => p.id !== planId),
          planItems: s.planItems.filter((i) => i.plan_id !== planId),
        })),

      ensureReport: (consultationId) => {
        const existing = get().reports.find(
          (r) => r.consultation_id === consultationId
        );
        if (existing) {
          const updated = { ...existing, generated_at: nowISO() };
          set((s) => ({
            reports: s.reports.map((r) => (r.id === existing.id ? updated : r)),
          }));
          return updated;
        }
        const report: Report = {
          id: uid(),
          consultation_id: consultationId,
          generated_at: nowISO(),
        };
        set((s) => ({ reports: [...s.reports, report] }));
        return report;
      },

      addUser: (data) => {
        const clinic = get().clinic;
        const user: User = {
          id: uid(),
          clinic_id: clinic?.id ?? "clinic",
          name: data.name,
          email: data.email,
          role: data.role,
          title: data.title,
          password: "starfighter",
          active: true,
        };
        set((s) => ({ users: [...s.users, user] }));
        return user;
      },

      setUserActive: (id, active) =>
        set((s) => ({
          users: s.users.map((u) => (u.id === id ? { ...u, active } : u)),
        })),

      updateClinic: (patch) =>
        set((s) => ({
          clinic: s.clinic
            ? {
                ...s.clinic,
                ...patch,
                branding: { ...s.clinic.branding, ...patch.branding },
              }
            : s.clinic,
        })),
    }),
    {
      name: "starfighter-store",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);

// ---------------------------------------------------------------------
// Selector helpers
// ---------------------------------------------------------------------

export const useSessionUser = () =>
  useStore((s) => s.users.find((u) => u.id === s.sessionUserId) ?? null);

export function usePatientConsents(patientId: string | undefined) {
  return useStore(
    useShallow((s) =>
      patientId ? s.consents.filter((c) => c.patient_id === patientId) : []
    )
  );
}

export function consentGranted(
  consents: Consent[],
  type: ConsentType
): Consent | undefined {
  return consents.find((c) => c.type === type && c.granted);
}

/** Doctor-facing permission check per 01_registration-and-access.md. */
export const can = {
  runConsultation: (role: Role | undefined) =>
    role === "doctor" || role === "admin",
  manageUsers: (role: Role | undefined) => role === "admin",
  registerPatient: (role: Role | undefined) => !!role,
  exportReport: (role: Role | undefined) => !!role,
};
