"use client";

/**
 * Clinic admin console: staff users, treatment templates, clinic branding,
 * and demo utilities. Admin-only (01_registration-and-access.md §1).
 */

import { useEffect, useState } from "react";
import {
  Users,
  FlaskConical,
  Building2,
  RotateCcw,
  Plus,
  ChevronDown,
  ShieldCheck,
  Sparkles,
  Check,
  CloudOff,
} from "lucide-react";
import { useStore, useSessionUser, can, type AiProviderSetting } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/format";
import { TEMPLATES } from "@/lib/templates";
import type { Role } from "@/lib/types";
import { GlassCard, EmptyState, Field, Toggle, SectionTitle, Modal, Spinner } from "@/components/ui";

type ProviderId = "gemini" | "openai" | "flux" | "higgsfield";

interface ProviderStatus {
  configured: Record<ProviderId, boolean>;
  active: string | null;
  envForced: string | null;
  models: Record<ProviderId, string>;
  /** Whitelisted model choices per provider (server-defined). */
  options?: Record<ProviderId, string[]>;
}

/** Friendly names for the model picker chips. */
const MODEL_LABELS: Record<string, string> = {
  "gemini-2.5-flash-image": "Nano Banana",
  "gemini-3-pro-image": "Nano Banana Pro",
  "gpt-image-1": "GPT Image 1",
  "gpt-image-2": "GPT Image 2",
  "flux-kontext-pro": "Kontext Pro",
  "flux-kontext-max": "Kontext Max",
  "reve/edit": "Reve Edit (photo editing)",
  "higgsfield-ai/soul/reference": "Soul Reference",
  "higgsfield-ai/soul/character": "Soul Character",
};

const AI_CHOICES: {
  id: AiProviderSetting;
  label: string;
  desc: string;
}[] = [
  {
    id: "auto",
    label: "Auto",
    desc: "Server picks the best configured provider, with automatic fallback",
  },
  {
    id: "gemini",
    label: "Gemini (Nano Banana)",
    desc: "Best identity preservation. Recommended for facial edits",
  },
  {
    id: "openai",
    label: "OpenAI GPT Image",
    desc: "Strong spatial reasoning; sent with high input fidelity",
  },
  {
    id: "flux",
    label: "FLUX.1 Kontext",
    desc: "Controllable instructed editing",
  },
  {
    id: "higgsfield",
    label: "Higgsfield (Soul)",
    desc: "Reference-guided Soul renders via Higgsfield Cloud API credits",
  },
  {
    id: "none",
    label: "None",
    desc: "Photoreal AI off. On-device simulation preview only",
  },
];

export default function SettingsPage() {
  const user = useSessionUser();
  const clinic = useStore((s) => s.clinic);
  const users = useStore((s) => s.users);
  const patients = useStore((s) => s.patients);
  const consultations = useStore((s) => s.consultations);
  const visualizations = useStore((s) => s.visualizations);
  const addUser = useStore((s) => s.addUser);
  const setUserActive = useStore((s) => s.setUserActive);
  const updateClinic = useStore((s) => s.updateClinic);
  const resetDemo = useStore((s) => s.resetDemo);
  const aiProvider = useStore((s) => s.aiProvider);
  const setAiProvider = useStore((s) => s.setAiProvider);
  const aiModels = useStore((s) => s.aiModels);
  const setAiModel = useStore((s) => s.setAiModel);
  const clinicHours = useStore((s) => s.clinicHours);
  const setClinicHours = useStore((s) => s.setClinicHours);
  const toxinPricePerUnit = useStore((s) => s.toxinPricePerUnit);
  const setToxinPricePerUnit = useStore((s) => s.setToxinPricePerUnit);

  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "front_desk" as Role,
    title: "",
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/generate")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: ProviderStatus) => {
        if (!cancelled) setProviderStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatusError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!can.manageUsers(user?.role)) {
    return (
      <EmptyState
        icon={<ShieldCheck size={28} />}
        title="Admin access required"
        body="Clinic settings, staff management and treatment templates are restricted to the clinic admin role."
      />
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="fade-up">
        <h1 className="h1 text-ink-900">Clinic settings</h1>
        <p className="caption mt-0.5">
          {patients.length} patients · {consultations.length} consultations ·{" "}
          {visualizations.length} AI visualizations
        </p>
      </div>

      {/* Staff */}
      <section className="fade-up-1">
        <SectionTitle
          title="Staff & roles"
          sub="Role-based access: front desk prepares, doctor decides, admin manages"
          action={
            <button className="btn btn-secondary btn-sm" onClick={() => setAddOpen(true)}>
              <Plus size={14} />
              Add staff
            </button>
          }
          className="mb-4"
        />
        <div className="space-y-2">
          {users.map((u) => (
            <GlassCard key={u.id} className="flex items-center gap-4 px-5 py-3.5">
              <span className="w-10 h-10 rounded-xl bg-mint-100 text-ink-700 flex items-center justify-center shrink-0">
                <Users size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink-900">
                  {u.name}
                  {u.title && (
                    <span className="caption font-normal"> · {u.title}</span>
                  )}
                </div>
                <div className="caption">{u.email}</div>
              </div>
              <span className="chip chip-static text-xs">{ROLE_LABELS[u.role]}</span>
              <div className="flex items-center gap-2">
                <span className="caption">{u.active ? "Active" : "Disabled"}</span>
                <Toggle
                  checked={u.active}
                  onChange={(v) => setUserActive(u.id, v)}
                  disabled={u.id === user?.id}
                  label={`${u.name} active`}
                />
              </div>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* Treatment templates */}
      <section className="fade-up-2">
        <SectionTitle
          title="Treatment templates"
          sub="Each procedure bundles its AI slider schema, prompt template and plan checklist"
          className="mb-4"
        />
        <div className="space-y-2">
          {TEMPLATES.map((t) => (
            <GlassCard key={t.id} className="px-5 py-4">
              <button
                className="w-full flex items-center gap-3 text-left"
                onClick={() =>
                  setExpandedTemplate(expandedTemplate === t.id ? null : t.id)
                }
              >
                <span className="w-9 h-9 rounded-xl bg-mint-100 text-mint-500 flex items-center justify-center shrink-0">
                  <FlaskConical size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-ink-900">{t.name}</span>
                  <span className="caption block">
                    {t.category} · {t.slider_schema.length} sliders ·{" "}
                    {t.plan_template.length} plan items
                  </span>
                </div>
                <span
                  className={`chip chip-static text-xs ${
                    t.available ? "" : "opacity-60"
                  }`}
                >
                  {t.available ? "Live" : "Coming soon"}
                </span>
                <ChevronDown
                  size={16}
                  className={`text-ink-400 transition-transform ${
                    expandedTemplate === t.id ? "rotate-180" : ""
                  }`}
                />
              </button>
              {expandedTemplate === t.id && t.available && (
                <div className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="field-label">AI sliders</div>
                    <ul className="space-y-1 text-ink-700">
                      {t.slider_schema.map((s) => (
                        <li key={s.key}>
                          <b className="font-medium">{s.label}</b>
                          <span className="caption"> · {s.hint}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="field-label">Default plan</div>
                    <ul className="space-y-1 text-ink-700">
                      {t.plan_template.map((p, i) => (
                        <li key={i}>
                          <span className="caption">{p.kind}</span>{" "}
                          <span className="font-medium">{p.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="field-label">Preferred model</div>
                    <code className="text-xs bg-white/60 rounded-lg px-2 py-1">
                      {t.model}
                    </code>
                  </div>
                </div>
              )}
              {expandedTemplate === t.id && !t.available && (
                <p className="caption mt-3">
                  This preset ships after the rhinoplasty vertical: it only
                  needs its slider schema, prompt template and plan checklist
                  defined. No new engine code.
                </p>
              )}
            </GlassCard>
          ))}
        </div>
      </section>

      {/* AI generation */}
      <section className="fade-up-2">
        <SectionTitle
          title="AI generation"
          sub="Which model powers the photoreal before/after. Keys live in the server environment, never in the browser"
          className="mb-4"
        />
        <GlassCard className="p-6">
          <div className="space-y-2.5">
            {AI_CHOICES.map((choice) => {
              const selected = aiProvider === choice.id;
              const isProvider =
                choice.id !== "auto" && choice.id !== "none";
              const configured = isProvider
                ? providerStatus?.configured[choice.id as ProviderId]
                : undefined;
              const serverDefault = isProvider
                ? providerStatus?.models[choice.id as ProviderId]
                : undefined;
              const chosen = isProvider
                ? aiModels[choice.id as ProviderId]
                : undefined;
              const model = chosen ?? serverDefault;
              const modelOptions = isProvider
                ? (providerStatus?.options?.[choice.id as ProviderId] ?? [])
                : [];
              return (
                <button
                  key={choice.id}
                  onClick={() => setAiProvider(choice.id)}
                  className={`glass-subtle w-full flex items-center gap-4 px-4 py-3 text-left transition-all ${
                    selected ? "ring-2 ring-mint-400" : "card-hover"
                  }`}
                >
                  <span
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      selected
                        ? "bg-mint-500 text-white"
                        : "bg-mint-100 text-ink-700"
                    }`}
                  >
                    {choice.id === "none" ? (
                      <CloudOff size={16} />
                    ) : (
                      <Sparkles size={16} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-900">
                      {choice.label}
                      {model && (
                        <span className="caption font-normal"> · {model}</span>
                      )}
                    </span>
                    <span className="caption block">{choice.desc}</span>
                    {modelOptions.length > 1 && (
                      <span className="flex flex-wrap gap-1.5 mt-2">
                        {modelOptions.map((opt) => {
                          const optActive = model === opt;
                          return (
                            /* span, not button: cards are buttons and
                               interactive nesting is invalid HTML */
                            <span
                              key={opt}
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                setAiModel(
                                  choice.id as ProviderId,
                                  opt === serverDefault ? null : opt
                                );
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setAiModel(
                                    choice.id as ProviderId,
                                    opt === serverDefault ? null : opt
                                  );
                                }
                              }}
                              className={`chip text-[11px] ${
                                optActive ? "chip-active" : ""
                              }`}
                              title={opt}
                            >
                              {MODEL_LABELS[opt] ?? opt}
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </span>
                  {isProvider &&
                    providerStatus &&
                    (configured ? (
                      <span className="chip chip-static text-xs">
                        <Check size={12} className="text-mint-500" />
                        Key configured
                      </span>
                    ) : (
                      <span className="chip chip-static text-xs opacity-70">
                        No key on server
                      </span>
                    ))}
                  {isProvider && !providerStatus && !statusError && (
                    <Spinner className="w-4 h-4" />
                  )}
                  {selected && (
                    <span className="chip chip-static text-xs bg-mint-100">
                      Selected
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {aiProvider !== "none" &&
            aiProvider !== "auto" &&
            providerStatus &&
            !providerStatus.configured[aiProvider as ProviderId] && (
              <p className="text-sm text-warning mt-4">
                The selected provider has no key on the server, so generation
                will fail until its env var is set (see .env.example). The
                on-device preview keeps working regardless.
              </p>
            )}
          <p className="caption mt-4">
            Doctors see this choice reflected instantly in the consultation
            workspace. "None" disables photoreal generation clinic-wide and
            keeps the visualization fully on-device.
            {providerStatus?.envForced
              ? ` Server env currently forces ${providerStatus.envForced} when Auto is selected.`
              : ""}
          </p>
        </GlassCard>
      </section>

      {/* Clinic hours (drives the Calendar grid + VYBERO availability) */}
      <section className="fade-up-3">
        <SectionTitle
          title="Clinic hours"
          sub="Defines the bookable slot grid on the Calendar and the availability VYBERO offers to callers"
          className="mb-4"
        />
        <GlassCard className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl">
            <Field label="Opens">
              <input
                type="time"
                className="input"
                value={clinicHours.open}
                onChange={(e) =>
                  e.target.value && setClinicHours({ open: e.target.value })
                }
              />
            </Field>
            <Field label="Closes">
              <input
                type="time"
                className="input"
                value={clinicHours.close}
                onChange={(e) =>
                  e.target.value && setClinicHours({ close: e.target.value })
                }
              />
            </Field>
            <Field label="Slot length">
              <select
                className="input"
                value={clinicHours.slot_min}
                onChange={(e) =>
                  setClinicHours({ slot_min: Number(e.target.value) })
                }
              >
                {[15, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Open days">
              <div className="flex gap-1 flex-wrap pt-1.5">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => {
                  const active = clinicHours.days.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() =>
                        setClinicHours({
                          days: active
                            ? clinicHours.days.filter((x) => x !== i)
                            : [...clinicHours.days, i].sort(),
                        })
                      }
                      className={`w-7 h-7 rounded-full text-[11px] font-semibold transition-colors ${
                        active
                          ? "bg-mint-500 text-white"
                          : "bg-white/60 text-ink-400 hover:bg-mint-100"
                      }`}
                      aria-pressed={active}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
          <p className="caption mt-4">
            The VYBERO phone agent reads availability from these hours via
            GET /api/vybero/availability and books through POST
            /api/vybero/book (authenticated with the VYBERO_API_KEY server
            env var).
          </p>
        </GlassCard>
      </section>

      {/* Clinic branding */}
      <section className="fade-up-3">
        <SectionTitle
          title="Clinic branding"
          sub="Shown across the app and co-branded on patient reports"
          className="mb-4"
        />
        <GlassCard className="p-6">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Clinic name">
              <input
                className="input"
                value={clinic?.name ?? ""}
                onChange={(e) => updateClinic({ name: e.target.value })}
              />
            </Field>
            <Field label="City">
              <input
                className="input"
                value={clinic?.city ?? ""}
                onChange={(e) => updateClinic({ city: e.target.value })}
              />
            </Field>
            <Field label="Tagline">
              <input
                className="input"
                value={clinic?.branding.tagline ?? ""}
                onChange={(e) =>
                  updateClinic({ branding: { tagline: e.target.value } })
                }
              />
            </Field>
            <Field label="Phone">
              <input
                className="input"
                value={clinic?.branding.phone ?? ""}
                onChange={(e) =>
                  updateClinic({ branding: { phone: e.target.value } })
                }
              />
            </Field>
            <Field label="Email">
              <input
                className="input"
                value={clinic?.branding.email ?? ""}
                onChange={(e) =>
                  updateClinic({ branding: { email: e.target.value } })
                }
              />
            </Field>
            <Field label="Address">
              <input
                className="input"
                value={clinic?.branding.address ?? ""}
                onChange={(e) =>
                  updateClinic({ branding: { address: e.target.value } })
                }
              />
            </Field>
            <Field
              label="Toxin price per unit (PKR)"
              hint="Drives the cost total on botox unit planning"
            >
              <input
                className="input"
                inputMode="numeric"
                value={String(toxinPricePerUnit)}
                onChange={(e) =>
                  setToxinPricePerUnit(
                    parseInt(e.target.value.replace(/\D/g, "") || "0", 10)
                  )
                }
              />
            </Field>
          </div>
        </GlassCard>
      </section>

      {/* Demo utilities */}
      <section className="fade-up-4 pb-8">
        <SectionTitle
          title="Demo utilities"
          sub="Booth housekeeping"
          className="mb-4"
        />
        <GlassCard className="p-6 flex items-center gap-4 flex-wrap">
          <span className="w-10 h-10 rounded-xl bg-mint-100 text-ink-700 flex items-center justify-center">
            <Building2 size={18} />
          </span>
          <div className="flex-1 min-w-52">
            <div className="font-medium text-ink-900">Reset demo data</div>
            <p className="caption">
              Restores the seeded clinic, staff and patients. Captured photos
              and generated visualizations on this device are cleared.
            </p>
          </div>
          <button className="btn btn-danger" onClick={() => setResetOpen(true)}>
            <RotateCcw size={15} />
            Reset demo
          </button>
        </GlassCard>
      </section>

      {/* Add staff modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add staff member">
        <div className="space-y-4">
          <Field label="Full name">
            <input
              className="input"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              placeholder="e.g. Dr. Imran Bashir"
            />
          </Field>
          <Field label="Email">
            <input
              className="input"
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              placeholder="name@meridian.clinic"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role">
              <select
                className="input"
                value={newUser.role}
                onChange={(e) =>
                  setNewUser({ ...newUser, role: e.target.value as Role })
                }
              >
                <option value="front_desk">Front Desk</option>
                <option value="doctor">Doctor</option>
                <option value="admin">Clinic Admin</option>
              </select>
            </Field>
            <Field label="Title (optional)">
              <input
                className="input"
                value={newUser.title}
                onChange={(e) => setNewUser({ ...newUser, title: e.target.value })}
                placeholder="e.g. Dermatologist"
              />
            </Field>
          </div>
          <p className="caption">
            Demo accounts use the shared password. Real credential management
            arrives with production auth.
          </p>
          <button
            className="btn btn-primary w-full"
            disabled={!newUser.name.trim() || !newUser.email.includes("@")}
            onClick={() => {
              addUser({
                name: newUser.name.trim(),
                email: newUser.email.trim(),
                role: newUser.role,
                title: newUser.title.trim() || undefined,
              });
              setNewUser({ name: "", email: "", role: "front_desk", title: "" });
              setAddOpen(false);
            }}
          >
            Add staff member
          </button>
        </div>
      </Modal>

      {/* Reset confirm modal */}
      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset demo data?">
        <p className="text-sm text-ink-700 leading-relaxed">
          This restores the original seeded clinic, staff and patients, and
          signs everyone out. Photos captured on this device and generated
          visualizations will no longer be referenced.
        </p>
        <div className="flex gap-2 justify-end mt-6">
          <button className="btn btn-ghost" onClick={() => setResetOpen(false)}>
            Cancel
          </button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              await resetDemo();
              setResetOpen(false);
              window.location.href = "/";
            }}
          >
            <RotateCcw size={15} />
            Reset demo
          </button>
        </div>
      </Modal>
    </div>
  );
}
