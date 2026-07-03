"use client";

/**
 * Clinic admin console: staff users, treatment templates, clinic branding,
 * and demo utilities. Admin-only (01_registration-and-access.md §1).
 */

import { useState } from "react";
import {
  Users,
  FlaskConical,
  Building2,
  RotateCcw,
  Plus,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import { useStore, useSessionUser, can } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/format";
import { TEMPLATES } from "@/lib/templates";
import type { Role } from "@/lib/types";
import { GlassCard, EmptyState, Field, Toggle, SectionTitle, Modal } from "@/components/ui";

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

  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "front_desk" as Role,
    title: "",
  });

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
