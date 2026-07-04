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
import { deleteImage } from "./db";

const uid = () => crypto.randomUUID();
const nowISO = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Clinic-side AI provider selection (admin GUI). "auto" defers to the
 * server's env priority; "none" disables photoreal generation entirely
 * (on-device simulation only). Keys always stay server-side.
 */
export type AiProviderSetting = "auto" | "none" | "gemini" | "openai" | "flux";

/** Per-patient state of the phone -> booth push (T1). */
export interface BoothSyncState {
  status: "pending" | "sending" | "sent" | "error";
  boothId?: string;
  error?: string;
  /** machine-readable failure kind, e.g. "not_configured" (never retried) */
  code?: string;
  updated_at: string;
}

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
  aiProvider: AiProviderSetting;

  // booth handoff (T1)
  boothLink: boolean; // desktop: poll the booth inbox
  boothSync: Record<string, BoothSyncState>; // patientId -> push state
  mergedBoothIds: string[]; // inbox ids already merged (or pushed) here
  newArrivals: string[]; // patient ids to badge as NEW
  boothToast: { name: string; at: number } | null;
  /** null = unknown, false = server has no Blob store (feature dormant) */
  boothAvailable: boolean | null;

  // lifecycle
  seedIfNeeded: () => Promise<void>;
  resetDemo: () => Promise<void>;
  setAiProvider: (p: AiProviderSetting) => void;

  // booth actions
  setBoothLink: (on: boolean) => void;
  setBoothSync: (patientId: string, patch: Partial<BoothSyncState>) => void;
  clearBoothSync: (patientId: string) => void;
  setBoothAvailable: (v: boolean | null) => void;
  addMergedBoothId: (id: string) => void;
  clearNewArrival: (patientId: string) => void;
  addNewArrival: (patientId: string) => void;
  setBoothToast: (t: { name: string; at: number } | null) => void;
  deletePatient: (patientId: string) => void;

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
  setToxinPlan: (
    consultationId: string,
    plan: Consultation["toxin_plan"]
  ) => void;
  /** Per-unit toxin price (admin Settings), used for botox cost totals. */
  toxinPricePerUnit: number;
  setToxinPricePerUnit: (v: number) => void;

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
  appendTemplateToPlan: (planId: string, templateId: string) => void;
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
      aiProvider: "auto",
      boothLink: false,
      boothSync: {},
      mergedBoothIds: [],
      newArrivals: [],
      boothToast: null,
      boothAvailable: null,

      setAiProvider: (p) => set({ aiProvider: p }),

      setBoothLink: (on) => set({ boothLink: on }),

      setBoothSync: (patientId, patch) =>
        set((s) => {
          const prev = s.boothSync[patientId];
          const next: BoothSyncState = {
            status: patch.status ?? prev?.status ?? "pending",
            boothId: patch.boothId ?? prev?.boothId,
            error: "error" in patch ? patch.error : prev?.error,
            code: "code" in patch ? patch.code : prev?.code,
            updated_at: new Date().toISOString(),
          };
          return { boothSync: { ...s.boothSync, [patientId]: next } };
        }),

      clearBoothSync: (patientId) =>
        set((s) => {
          const sync = { ...s.boothSync };
          delete sync[patientId];
          return { boothSync: sync };
        }),

      setBoothAvailable: (v) => set({ boothAvailable: v }),

      addMergedBoothId: (id) =>
        set((s) => ({
          mergedBoothIds: s.mergedBoothIds.includes(id)
            ? s.mergedBoothIds
            : [...s.mergedBoothIds, id].slice(-300),
        })),

      addNewArrival: (patientId) =>
        set((s) => ({
          newArrivals: s.newArrivals.includes(patientId)
            ? s.newArrivals
            : [...s.newArrivals, patientId],
        })),

      clearNewArrival: (patientId) =>
        set((s) => ({
          newArrivals: s.newArrivals.filter((id) => id !== patientId),
        })),

      setBoothToast: (t) => set({ boothToast: t }),

      deletePatient: (patientId) => {
        const s = get();
        const consultIds = s.consultations
          .filter((c) => c.patient_id === patientId)
          .map((c) => c.id);
        const planIds = s.plans
          .filter((p) => consultIds.includes(p.consultation_id))
          .map((p) => p.id);
        // device-local image cleanup, fire-and-forget
        s.assets
          .filter(
            (a) => a.patient_id === patientId && a.storage_url.startsWith("idb:")
          )
          .forEach((a) => {
            deleteImage(a.storage_url.slice(4)).catch(() => {});
          });
        set((st) => {
          const sync = { ...st.boothSync };
          delete sync[patientId];
          return {
            patients: st.patients.filter((p) => p.id !== patientId),
            consents: st.consents.filter((c) => c.patient_id !== patientId),
            assets: st.assets.filter((a) => a.patient_id !== patientId),
            consultations: st.consultations.filter(
              (c) => c.patient_id !== patientId
            ),
            visualizations: st.visualizations.filter(
              (v) => !consultIds.includes(v.consultation_id)
            ),
            plans: st.plans.filter(
              (p) => !consultIds.includes(p.consultation_id)
            ),
            planItems: st.planItems.filter((i) => !planIds.includes(i.plan_id)),
            reports: st.reports.filter(
              (r) => !consultIds.includes(r.consultation_id)
            ),
            newArrivals: st.newArrivals.filter((id) => id !== patientId),
            boothSync: sync,
          };
        });
      },

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

      setToxinPlan: (consultationId, plan) =>
        set((s) => ({
          consultations: s.consultations.map((c) =>
            c.id === consultationId ? { ...c, toxin_plan: plan } : c
          ),
        })),

      toxinPricePerUnit: 1500,
      setToxinPricePerUnit: (v) =>
        set({ toxinPricePerUnit: Math.max(0, Math.round(v)) }),

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

      appendTemplateToPlan: (planId, templateId) => {
        const template = getTemplate(templateId);
        if (!template) return;
        set((s) => {
          let order =
            Math.max(
              -1,
              ...s.planItems
                .filter((i) => i.plan_id === planId)
                .map((i) => i.order)
            ) + 1;
          const items: PlanItem[] = template.plan_template.map((item) => ({
            id: uid(),
            plan_id: planId,
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
            order: order++,
          }));
          return { planItems: [...s.planItems, ...items] };
        });
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
          password: "contour",
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
      name: "contour-store",
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
