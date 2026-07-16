"use client";

/**
 * Central store. Structured records persist to localStorage; images live in
 * IndexedDB (see db.ts). Deliberately simple per the demo build plan â€”
 * swap for Postgres + object storage post-IPAAC without touching the UI.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import type {
  Appointment,
  Asset,
  Brief,
  CanvasState,
  Clinic,
  ClinicHours,
  ClinicLocation,
  Consent,
  ConsentType,
  Consultation,
  Invoice,
  Patient,
  PlanItem,
  PlanStatus,
  Report,
  Reward,
  Role,
  SkinAnalysis,
  TreatmentPlan,
  User,
  Visualization,
  VyberoCall,
} from "./types";
import { CONSENT_TEXT_VERSION, DEFAULT_CLINIC_HOURS } from "./types";
import { buildSeed, buildVyberoSeed, fetchSeedManifest } from "./seed";
import { getTemplate } from "./templates";
import { deleteImage } from "./db";
import type { BootstrapPayload } from "@/lib/server/bootstrap";
import {
  pushClinicConfig,
  pushAddStaff,
  pushSetStaffActive,
  logoutRequest,
  fetchBootstrap,
  pauseSync,
  resumeSync,
  resetSyncBaseline,
} from "./serverSync";

const uid = () => crypto.randomUUID();
const nowISO = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Clinic-side AI provider selection (admin GUI). "auto" defers to the
 * server's env priority; "none" disables photoreal generation entirely
 * (on-device simulation only). Keys always stay server-side.
 */
export type AiProviderSetting =
  | "auto"
  | "none"
  | "gemini"
  | "openai"
  | "flux"
  | "higgsfield";

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
  // per-clinic config (server-authoritative, hydrated on login)
  menu: string[];
  prices: Record<string, number>;
  aiCaps: { generations: number; assessments: number };
  demo: boolean;
  vyberoAgentId?: string;
  bookingUrl?: string;
  aiProvider: AiProviderSetting;
  /** Admin-selected model per provider (empty = server default). */
  aiModels: Partial<Record<"gemini" | "openai" | "flux" | "higgsfield", string>>;

  // calendar + VYBERO voice agent
  appointments: Appointment[];
  vyberoCalls: VyberoCall[];
  clinicHours: ClinicHours;

  // CAPTURE modules: POS, Capture Circle, MARK-VU
  invoices: Invoice[];
  rewards: Reward[];
  skinAnalyses: SkinAnalysis[];
  locations: ClinicLocation[];
  taxRate: number;
  reviewIncentive: { kind: "discount"; value: number; validityDays: number };

  /** Rough AI usage counters (drives the cost card in Analytics). */
  aiUsage: { generations: number; assessments: number };

  // booth handoff (T1)
  boothLink: boolean; // desktop: poll the booth inbox
  boothSync: Record<string, BoothSyncState>; // patientId -> push state
  mergedBoothIds: string[]; // inbox ids already merged (or pushed) here
  newArrivals: string[]; // patient ids to badge as NEW
  boothToast: { name: string; at: number } | null;
  /** null = unknown, false = server has no Blob store (feature dormant) */
  boothAvailable: boolean | null;

  // lifecycle
  hydrate: (payload: BootstrapPayload) => void;
  seedIfNeeded: () => Promise<void>;
  resetDemo: () => Promise<void>;
  setAiProvider: (p: AiProviderSetting) => void;
  setAiModel: (
    provider: "gemini" | "openai" | "flux" | "higgsfield",
    model: string | null
  ) => void;

  // calendar + VYBERO
  addAppointment: (
    a: Omit<Appointment, "id" | "created_at" | "updated_at" | "status"> & {
      id?: string;
      status?: Appointment["status"];
    }
  ) => Appointment;
  updateAppointment: (id: string, patch: Partial<Appointment>) => void;
  /** Merge server copies (VYBERO bookings / other devices); newest wins. */
  mergeAppointments: (items: Appointment[]) => void;
  mergeVyberoCalls: (items: VyberoCall[]) => void;
  setClinicHours: (patch: Partial<ClinicHours>) => void;
  bumpAiUsage: (kind: "generations" | "assessments") => void;

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

  // auth (login is server-side; the store is hydrated from the bootstrap)
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

  // POS
  addInvoice: (inv: Omit<Invoice, "id" | "created_at">) => Invoice;
  /** Next human invoice number for a location today, e.g. EC-20260718-003. */
  nextInvoiceNumber: (locationId: string) => string;

  // Capture Circle
  mergeRewards: (items: Reward[]) => void;
  markRewardRedeemed: (code: string, invoiceId: string) => void;

  // MARK-VU
  addSkinAnalysis: (
    a: Omit<SkinAnalysis, "id" | "created_at">
  ) => SkinAnalysis;
  removeSkinAnalysis: (id: string) => void;
  setTaxRate: (v: number) => void;
  /** Admin sets a treatment's session price (POS + VYBERO quote from it). */
  setTreatmentPrice: (treatmentId: string, price: number) => void;

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
      menu: [],
      prices: {},
      aiCaps: { generations: 0, assessments: 0 },
      demo: false,
      vyberoAgentId: undefined,
      bookingUrl: undefined,
      aiProvider: "auto",
      aiModels: {},
      appointments: [],
      vyberoCalls: [],
      clinicHours: DEFAULT_CLINIC_HOURS,
      invoices: [],
      rewards: [],
      skinAnalyses: [],
      locations: [],
      taxRate: 16,
      reviewIncentive: { kind: "discount", value: 10, validityDays: 60 },
      aiUsage: { generations: 0, assessments: 0 },
      boothLink: false,
      boothSync: {},
      mergedBoothIds: [],
      newArrivals: [],
      boothToast: null,
      boothAvailable: null,

      setAiProvider: (p) => set({ aiProvider: p }),

      setAiModel: (provider, model) =>
        set((s) => {
          const next = { ...s.aiModels };
          if (model === null) delete next[provider];
          else next[provider] = model;
          return { aiModels: next };
        }),

      addAppointment: (a) => {
        const appt: Appointment = {
          status: "booked",
          ...a,
          id: a.id ?? uid(),
          created_at: nowISO(),
          updated_at: nowISO(),
        };
        set((s) => ({ appointments: [...s.appointments, appt] }));
        return appt;
      },

      updateAppointment: (id, patch) =>
        set((s) => ({
          appointments: s.appointments.map((a) =>
            a.id === id ? { ...a, ...patch, updated_at: nowISO() } : a
          ),
        })),

      mergeAppointments: (items) =>
        set((s) => {
          const byId = new Map(s.appointments.map((a) => [a.id, a]));
          for (const item of items) {
            const local = byId.get(item.id);
            if (!local || item.updated_at > local.updated_at) {
              byId.set(item.id, item);
            }
          }
          return {
            appointments: [...byId.values()].sort((a, b) =>
              a.start.localeCompare(b.start)
            ),
          };
        }),

      mergeVyberoCalls: (items) =>
        set((s) => {
          const byId = new Map(s.vyberoCalls.map((c) => [c.id, c]));
          for (const item of items) byId.set(item.id, item);
          return {
            vyberoCalls: [...byId.values()].sort((a, b) =>
              b.started_at.localeCompare(a.started_at)
            ),
          };
        }),

      setClinicHours: (patch) => {
        set((s) => ({ clinicHours: { ...s.clinicHours, ...patch } }));
        void pushClinicConfig({ hours: get().clinicHours });
      },

      bumpAiUsage: (kind) =>
        set((s) => ({
          aiUsage: { ...s.aiUsage, [kind]: s.aiUsage[kind] + 1 },
        })),

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

      hydrate: (b) => {
        const prev = get().clinic;
        // Switching clinics on a shared device: drop the cached collections
        // first so one clinic's data can never bleed into another's view.
        const wipe =
          prev && prev.id !== b.clinic.id
            ? {
                patients: [] as Patient[],
                consents: [] as Consent[],
                assets: [] as Asset[],
                consultations: [] as Consultation[],
                visualizations: [] as Visualization[],
                plans: [] as TreatmentPlan[],
                planItems: [] as PlanItem[],
                reports: [] as Report[],
                appointments: [] as Appointment[],
                vyberoCalls: [] as VyberoCall[],
                invoices: [] as Invoice[],
                rewards: [] as Reward[],
                skinAnalyses: [] as SkinAnalysis[],
                boothSync: {},
                mergedBoothIds: [],
                newArrivals: [],
              }
            : {};
        // Pause write-through while we replace state from the server, then
        // rebase the diff baseline so hydrated data isn't pushed straight back.
        pauseSync();
        set({
          ...wipe,
          seeded: true,
          clinic: b.clinic as Clinic,
          users: b.users,
          patients: b.records.patients,
          consents: b.records.consents,
          assets: b.records.assets,
          consultations: b.records.consultations,
          visualizations: b.records.visualizations,
          plans: b.records.plans,
          planItems: b.records.planItems,
          reports: b.records.reports,
          invoices: b.records.invoices ?? [],
          rewards: b.records.rewards ?? [],
          skinAnalyses: b.records.skinAnalyses ?? [],
          locations: b.locations ?? [],
          taxRate: b.taxRate ?? 16,
          reviewIncentive:
            b.reviewIncentive ?? { kind: "discount", value: 10, validityDays: 60 },
          appointments: b.appointments,
          vyberoCalls: b.vyberoCalls,
          clinicHours: b.clinicHours,
          toxinPricePerUnit: b.toxinPricePerUnit,
          menu: b.menu,
          prices: b.prices,
          aiCaps: b.aiCaps,
          demo: b.demo,
          vyberoAgentId: b.vyberoAgentId,
          bookingUrl: b.bookingUrl,
          aiUsage: b.aiUsage,
          sessionUserId: b.user.id,
        });
        resetSyncBaseline(get() as unknown as Record<string, unknown>);
        resumeSync();
      },

      seedIfNeeded: async () => {
        const current = get();
        if (current.seeded) {
          // Backfill modules added after this device first seeded: the
          // calendar + VYBERO analytics demo story (2026-07-06).
          if (
            current.appointments.length === 0 &&
            current.vyberoCalls.length === 0
          ) {
            const demo = buildVyberoSeed(current.patients);
            set({
              appointments: demo.appointments,
              vyberoCalls: demo.vyberoCalls,
            });
          }
          return;
        }
        const manifest = await fetchSeedManifest();
        // Re-check post-await in case another tab seeded meanwhile.
        if (get().seeded) return;
        const seed = buildSeed(manifest);
        const demo = buildVyberoSeed(seed.patients);
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
          invoices: seed.invoices,
          rewards: seed.rewards,
          skinAnalyses: seed.skinAnalyses,
          visualizations: [],
          reports: [],
          appointments: demo.appointments,
          vyberoCalls: demo.vyberoCalls,
        });
      },

      resetDemo: async () => {
        // Server is the source of truth now: reload this clinic's data.
        const b = await fetchBootstrap();
        if (b) get().hydrate(b);
      },

      // ---- POS -------------------------------------------------------
      nextInvoiceNumber: (locationId) => {
        const s = get();
        const loc = s.locations.find((l) => l.id === locationId);
        const prefix = loc?.invoicePrefix ?? "IN";
        const dayKey = `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
        const todayCount = s.invoices.filter((i) =>
          i.number.startsWith(dayKey)
        ).length;
        return `${dayKey}-${String(todayCount + 1).padStart(3, "0")}`;
      },

      addInvoice: (inv) => {
        const invoice: Invoice = {
          ...inv,
          id: uid(),
          created_at: nowISO(),
        };
        set((s) => ({ invoices: [...s.invoices, invoice] }));
        return invoice;
      },

      // ---- Capture Circle ---------------------------------------------
      mergeRewards: (items) =>
        set((s) => {
          const byId = new Map(s.rewards.map((r) => [r.id, r]));
          for (const item of items) {
            const local = byId.get(item.id);
            // redeemed/expired beats issued; otherwise newest wins
            if (!local || local.status === "issued") byId.set(item.id, item);
          }
          return { rewards: [...byId.values()] };
        }),

      markRewardRedeemed: (code, invoiceId) =>
        set((s) => ({
          rewards: s.rewards.map((r) =>
            r.code === code
              ? {
                  ...r,
                  status: "redeemed" as const,
                  redeemed_at: nowISO(),
                  redeemed_invoice_id: invoiceId,
                }
              : r
          ),
        })),

      // ---- MARK-VU ------------------------------------------------------
      addSkinAnalysis: (a) => {
        const analysis: SkinAnalysis = {
          ...a,
          id: uid(),
          created_at: nowISO(),
        };
        set((s) => ({ skinAnalyses: [...s.skinAnalyses, analysis] }));
        return analysis;
      },

      removeSkinAnalysis: (id) =>
        set((s) => ({
          skinAnalyses: s.skinAnalyses.filter((a) => a.id !== id),
        })),

      setTaxRate: (v) => {
        set({ taxRate: v });
        void pushClinicConfig({ taxRate: v });
      },

      setTreatmentPrice: (treatmentId, price) => {
        const prices = { ...get().prices, [treatmentId]: price };
        set({ prices });
        void pushClinicConfig({ prices });
      },

      logout: () => {
        void logoutRequest();
        set({ sessionUserId: null });
      },

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
          // one active row per (patient, type) â€” newest wins
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
      setToxinPricePerUnit: (v) => {
        const val = Math.max(0, Math.round(v));
        set({ toxinPricePerUnit: val });
        void pushClinicConfig({ toxinPricePerUnit: val });
      },

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
          password: "",
          active: true,
        };
        // Optimistic local add; the server creates the authoritative row and
        // reconciles the id on next bootstrap. New staff default password is
        // set server-side (see /api/clinic/staff).
        set((s) => ({ users: [...s.users, user] }));
        void pushAddStaff({
          name: data.name,
          email: data.email,
          role: data.role,
          title: data.title,
        });
        return user;
      },

      setUserActive: (id, active) => {
        set((s) => ({
          users: s.users.map((u) => (u.id === id ? { ...u, active } : u)),
        }));
        void pushSetStaffActive(id, active);
      },

      updateClinic: (patch) => {
        set((s) => ({
          clinic: s.clinic
            ? {
                ...s.clinic,
                ...patch,
                branding: { ...s.clinic.branding, ...patch.branding },
              }
            : s.clinic,
        }));
        const c = get().clinic;
        if (c) {
          void pushClinicConfig({
            name: c.name,
            city: c.city,
            branding: c.branding,
          });
        }
      },
    }),
    {
      name: "capture-store",
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
