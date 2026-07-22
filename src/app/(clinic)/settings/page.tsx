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
  KeyRound,
  ReceiptText,
} from "lucide-react";
import { useStore, useSessionUser, can, type AiProviderSetting } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/format";
import { TEMPLATES } from "@/lib/templates";
import type { Role, User } from "@/lib/types";
import { GlassCard, EmptyState, Field, Toggle, SectionTitle, Modal, Spinner } from "@/components/ui";
import { CAPTURE_TREATMENTS, formatPkr } from "@/lib/capture/kb";
import { pushSetStaffPassword } from "@/lib/serverSync";

type ProviderId = "gemini" | "openai" | "flux" | "higgsfield";

interface ProviderStatus {
  configured: Record<ProviderId, boolean>;
  active: string | null;
  envForced: string | null;
  models: Record<ProviderId, string>;
  /** Whitelisted model choices per provider (server-defined). */
  options?: Record<ProviderId, string[]>;
}

/**
 * White-label (owner 2026-07-23): the clinic sees ONE engine — "Stryder AI
 * Image" — never the underlying provider or model names. "auto" is the
 * store value behind the engine card, so selecting it also clears any stale
 * per-provider pin from older builds; the server routes to the best
 * configured provider (Higgsfield popcorn today) behind the curtain.
 */
const AI_CHOICES: {
  id: AiProviderSetting;
  label: string;
  desc: string;
}[] = [
  {
    id: "auto",
    label: "Stryder AI Image",
    desc: "TechGIS photoreal engine — identity-preserving before/after edits on the patient's own photo",
  },
  {
    id: "none",
    label: "Off",
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
  const clinicHours = useStore((s) => s.clinicHours);
  const setClinicHours = useStore((s) => s.setClinicHours);
  const toxinPricePerUnit = useStore((s) => s.toxinPricePerUnit);
  const setToxinPricePerUnit = useStore((s) => s.setToxinPricePerUnit);
  const taxRate = useStore((s) => s.taxRate);
  const setTaxRate = useStore((s) => s.setTaxRate);
  const prices = useStore((s) => s.prices);
  const setTreatmentPrice = useStore((s) => s.setTreatmentPrice);

  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  // password reset modal
  const [pwUser, setPwUser] = useState<User | null>(null);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
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

  const submitPassword = async () => {
    if (!pwUser || pwBusy) return;
    if (pw1.length < 8) {
      setPwMsg({ ok: false, text: "Use at least 8 characters." });
      return;
    }
    if (pw1 !== pw2) {
      setPwMsg({ ok: false, text: "The passwords do not match." });
      return;
    }
    setPwBusy(true);
    const r = await pushSetStaffPassword(pwUser.id, pw1);
    setPwBusy(false);
    if (r.ok) {
      setPwMsg({ ok: true, text: "Password updated." });
      setTimeout(() => setPwUser(null), 900);
    } else {
      setPwMsg({ ok: false, text: r.error ?? "Could not update the password." });
    }
  };

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
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setPwUser(u);
                  setPw1("");
                  setPw2("");
                  setPwMsg(null);
                }}
                title={`Reset ${u.name}'s password`}
              >
                <KeyRound size={14} />
                <span className="hidden sm:inline">Reset password</span>
              </button>
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
          sub="Stryder AI Image powers the photoreal before/after. Keys live in the server environment, never in the browser"
          className="mb-4"
        />
        <GlassCard className="p-6">
          <div className="space-y-2.5">
            {AI_CHOICES.map((choice) => {
              const isEngine = choice.id !== "none";
              // any non-"none" store value counts as the engine (covers
              // stale per-provider pins persisted by older builds)
              const selected = isEngine
                ? aiProvider !== "none"
                : aiProvider === "none";
              const ready = providerStatus
                ? providerStatus.active !== null
                : undefined;
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
                    {isEngine ? (
                      <Sparkles size={16} />
                    ) : (
                      <CloudOff size={16} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-900">
                      {choice.label}
                    </span>
                    <span className="caption block">{choice.desc}</span>
                  </span>
                  {isEngine &&
                    providerStatus &&
                    (ready ? (
                      <span className="chip chip-static text-xs">
                        <Check size={12} className="text-mint-500" />
                        Ready
                      </span>
                    ) : (
                      <span className="chip chip-static text-xs opacity-70">
                        Not configured on server
                      </span>
                    ))}
                  {isEngine && !providerStatus && !statusError && (
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
            providerStatus &&
            providerStatus.active === null && (
              <p className="text-sm text-warning mt-4">
                Stryder AI Image is not configured on this server yet — ask
                TechGIS to enable it. The on-device preview keeps working
                regardless.
              </p>
            )}
          <p className="caption mt-4">
            Doctors see this choice reflected instantly in the consultation
            workspace. &quot;Off&quot; disables photoreal generation
            clinic-wide and keeps the visualization fully on-device.
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

      {/* Billing & treatment prices */}
      <section className="fade-up-4">
        <SectionTitle
          title="Billing & treatment prices"
          sub="POS, printed invoices and VYBERO quotes all read from here"
          className="mb-4"
        />
        <GlassCard className="p-6 space-y-5">
          <div className="max-w-xs">
            <Field
              label="Sales tax (%)"
              hint="Applied at Point of Sale after any Capture Circle discount"
            >
              <input
                className="input"
                inputMode="numeric"
                value={String(taxRate)}
                onChange={(e) => {
                  const v = parseInt(e.target.value.replace(/\D/g, "") || "0", 10);
                  setTaxRate(Math.min(40, Math.max(0, v)));
                }}
              />
            </Field>
          </div>
          <div>
            <div className="field-label flex items-center gap-1.5">
              <ReceiptText size={13} className="text-[color:var(--mint-500)]" />
              Session prices (PKR)
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              {CAPTURE_TREATMENTS.map((t) => {
                const current = prices[t.id] ?? t.pricePkr;
                const changed = current !== t.pricePkr;
                return (
                  <div key={t.id} className="flex items-center gap-3">
                    <span className="text-sm text-ink-900 flex-1 min-w-0 truncate">
                      {t.name}
                    </span>
                    <input
                      className="input !w-32 !py-2 text-right tabular-nums"
                      inputMode="numeric"
                      value={String(current)}
                      onChange={(e) =>
                        setTreatmentPrice(
                          t.id,
                          parseInt(e.target.value.replace(/\D/g, "") || "0", 10)
                        )
                      }
                      aria-label={`${t.name} session price`}
                    />
                    {changed && (
                      <button
                        className="caption underline decoration-dotted hover:text-ink-900"
                        onClick={() => setTreatmentPrice(t.id, t.pricePkr)}
                        title={`Reset to ${formatPkr(t.pricePkr)}`}
                      >
                        reset
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="caption mt-3">
              Changes apply immediately to the POS catalogue and to VYBERO&rsquo;s
              chat quotes. Retail product prices follow capture.cc.
            </p>
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

      {/* Password reset modal */}
      <Modal
        open={!!pwUser}
        onClose={() => setPwUser(null)}
        title={pwUser ? `Reset password · ${pwUser.name}` : "Reset password"}
      >
        <div className="space-y-4">
          <Field label="New password" hint="Minimum 8 characters">
            <input
              className="input"
              type="password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password">
            <input
              className="input"
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              autoComplete="new-password"
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitPassword();
              }}
            />
          </Field>
          {pwMsg && (
            <p className={`text-sm ${pwMsg.ok ? "text-[#5B8A5E]" : "text-danger"}`}>
              {pwMsg.text}
            </p>
          )}
          <button
            className="btn btn-primary w-full"
            disabled={pwBusy || pw1.length === 0}
            onClick={() => void submitPassword()}
          >
            {pwBusy ? <Spinner className="w-4 h-4" /> : <KeyRound size={15} />}
            Update password
          </button>
          <p className="caption">
            Takes effect on their next sign-in. Sessions already open stay
            signed in until they lock or sign out.
          </p>
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
