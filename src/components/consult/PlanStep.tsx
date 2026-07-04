"use client";

/**
 * Treatments & plan (06_treatments-and-plan.md): template-driven plan
 * creation, a living checklist (milestones · medicines · follow-ups),
 * status flow Proposed → Accepted → In progress → Done.
 */

import { useEffect, useRef, useState } from "react";
import {
  ClipboardList,
  Flag,
  Pill,
  CalendarCheck,
  Plus,
  Trash2,
  ArrowRight,
  Check,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "@/lib/store";
import { activeTemplatesFor } from "@/lib/templates";
import { zoneByKey } from "@/lib/botoxUnits";
import { formatDate } from "@/lib/format";
import type { Consultation, PlanItem, PlanStatus } from "@/lib/types";
import { GlassCard, EmptyState, Field } from "@/components/ui";

const STATUS_FLOW: PlanStatus[] = ["proposed", "accepted", "in_progress", "done"];
const STATUS_LABELS: Record<PlanStatus, string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  in_progress: "In progress",
  done: "Done",
};

const GROUPS: { kind: PlanItem["kind"]; label: string; icon: React.ReactNode }[] = [
  { kind: "milestone", label: "Milestones", icon: <Flag size={15} /> },
  { kind: "medicine", label: "Medicines & aftercare", icon: <Pill size={15} /> },
  { kind: "followup", label: "Follow-ups", icon: <CalendarCheck size={15} /> },
];

export function PlanStep({
  consultation,
  onReport,
}: {
  consultation: Consultation;
  onReport: () => void;
}) {
  const plan = useStore((s) =>
    s.plans.find((p) => p.consultation_id === consultation.id)
  );
  const items = useStore(
    useShallow((s) =>
      s.planItems
        .filter((i) => plan && i.plan_id === plan.id)
        .sort((a, b) => a.order - b.order)
    )
  );
  const createPlanFromTemplate = useStore((s) => s.createPlanFromTemplate);
  const appendTemplateToPlan = useStore((s) => s.appendTemplateToPlan);
  const updatePlan = useStore((s) => s.updatePlan);
  const setPlanStatus = useStore((s) => s.setPlanStatus);
  const togglePlanItem = useStore((s) => s.togglePlanItem);
  const removePlanItem = useStore((s) => s.removePlanItem);
  const addPlanItem = useStore((s) => s.addPlanItem);
  const setDoctorNote = useStore((s) => s.setDoctorNote);

  // Multi-procedure (T2): each active procedure offers its plan template,
  // addable individually.
  const activeTemplates = activeTemplatesFor(
    consultation.brief.interests,
    consultation.brief.primary_interest
  );
  const template = activeTemplates[0];

  const [summary, setSummary] = useState(plan?.summary ?? "");
  const [note, setNote] = useState(consultation.doctor_note);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({
    kind: "milestone" as PlanItem["kind"],
    label: "",
    detail: "",
    due: "",
  });

  // keep local text in sync if plan appears
  useEffect(() => {
    if (plan) setSummary(plan.summary);
  }, [plan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // debounce persistence of summary + note
  const t1 = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!plan) return;
    if (t1.current) clearTimeout(t1.current);
    t1.current = setTimeout(() => updatePlan(plan.id, { summary }), 500);
    return () => {
      if (t1.current) clearTimeout(t1.current);
    };
  }, [summary, plan, updatePlan]);

  const t2 = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (t2.current) clearTimeout(t2.current);
    t2.current = setTimeout(() => setDoctorNote(consultation.id, note), 500);
    return () => {
      if (t2.current) clearTimeout(t2.current);
    };
  }, [note, consultation.id, setDoctorNote]);

  if (!plan) {
    return (
      <div className="max-w-xl mx-auto fade-up">
        <GlassCard className="p-8 text-center">
          <span className="mx-auto w-12 h-12 rounded-2xl bg-mint-100 text-mint-500 flex items-center justify-center">
            <ClipboardList size={22} />
          </span>
          <h2 className="h1 text-ink-900 mt-4">Create the treatment plan</h2>
          <p className="text-ink-700 mt-2 leading-relaxed">
            {template
              ? `Each procedure template pre-fills milestones, typical medicines and the follow-up schedule. Start with one; add the others onto the same plan.`
              : "Start from a template or build a custom checklist."}
          </p>
          <div className="flex justify-center gap-2 mt-6 flex-wrap">
            {activeTemplates.map((t, i) => (
              <button
                key={t.id}
                className={i === 0 ? "btn btn-primary" : "btn btn-secondary"}
                onClick={() => {
                  const p = createPlanFromTemplate(consultation.id, t.id);
                  // a combined consult starts from one template; the rest
                  // are one click away via "Add template items"
                  void p;
                }}
              >
                Use {t.name} template
              </button>
            ))}
            <button
              className="btn btn-secondary"
              onClick={() => createPlanFromTemplate(consultation.id, null, "")}
            >
              Start blank plan
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }

  // Templates not yet represented in this plan (matched on their signature
  // first milestone, so appending is one-shot per procedure)
  const pendingTemplates = activeTemplates.filter(
    (t) =>
      t.id !== plan.template_id &&
      t.plan_template.length > 0 &&
      !items.some((i) => i.label === t.plan_template[0].label)
  );

  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4 fade-up">
      <div className="space-y-4">
        {/* Checklist groups */}
        {GROUPS.map((group) => {
          const groupItems = items.filter((i) => i.kind === group.kind);
          if (groupItems.length === 0) return null;
          return (
            <GlassCard key={group.kind} className="p-5">
              <div className="flex items-center gap-2 text-ink-900 font-medium mb-3">
                <span className="text-mint-500">{group.icon}</span>
                {group.label}
                <span className="caption font-normal">
                  {groupItems.filter((i) => i.done).length}/{groupItems.length}
                </span>
              </div>
              <div className="space-y-1.5">
                {groupItems.map((item) => (
                  <div
                    key={item.id}
                    className="group flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-white/50 transition-colors"
                  >
                    <button
                      onClick={() => togglePlanItem(item.id)}
                      className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                        item.done
                          ? "bg-mint-500 border-mint-500 text-white"
                          : "border-ink-400/40 bg-white/60 hover:border-mint-400"
                      }`}
                      aria-label={`Mark ${item.label} ${item.done ? "not done" : "done"}`}
                    >
                      {item.done && <Check size={13} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm font-medium ${
                          item.done ? "text-ink-400 line-through" : "text-ink-900"
                        }`}
                      >
                        {item.label}
                      </div>
                      {item.detail && (
                        <div className="caption mt-0.5">{item.detail}</div>
                      )}
                    </div>
                    {item.due && (
                      <span className="chip chip-static text-[11px] shrink-0">
                        {formatDate(item.due)}
                      </span>
                    )}
                    <button
                      onClick={() => removePlanItem(item.id)}
                      className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-danger transition-all p-1"
                      aria-label={`Remove ${item.label}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </GlassCard>
          );
        })}

        {items.length === 0 && (
          <EmptyState
            icon={<ClipboardList size={26} />}
            title="Empty plan"
            body="Add milestones, medicines and follow-ups below."
          />
        )}

        {/* Add another procedure's template items (T2 combined plans) */}
        {pendingTemplates.length > 0 && (
          <GlassCard className="p-5">
            <div className="text-sm font-medium text-ink-900 mb-1">
              Add procedure items
            </div>
            <p className="caption mb-3">
              Append another active procedure's milestones, medicines and
              follow-ups to this plan.
            </p>
            <div className="flex gap-2 flex-wrap">
              {pendingTemplates.map((t) => (
                <button
                  key={t.id}
                  className="btn btn-secondary btn-sm"
                  onClick={() => appendTemplateToPlan(plan.id, t.id)}
                >
                  <Plus size={14} />
                  Add {t.name} items
                </button>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Add item */}
        <GlassCard className="p-5">
          {adding ? (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Type">
                <select
                  className="input"
                  value={newItem.kind}
                  onChange={(e) =>
                    setNewItem({ ...newItem, kind: e.target.value as PlanItem["kind"] })
                  }
                >
                  <option value="milestone">Milestone</option>
                  <option value="medicine">Medicine</option>
                  <option value="followup">Follow-up</option>
                </select>
              </Field>
              <Field label="Due date (optional)">
                <input
                  type="date"
                  className="input"
                  value={newItem.due}
                  onChange={(e) => setNewItem({ ...newItem, due: e.target.value })}
                />
              </Field>
              <Field label="Label" className="sm:col-span-2">
                <input
                  className="input"
                  placeholder="e.g. Cast check appointment"
                  value={newItem.label}
                  onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
                />
              </Field>
              <Field label="Detail (dose / timing / notes)" className="sm:col-span-2">
                <input
                  className="input"
                  placeholder="Optional detail"
                  value={newItem.detail}
                  onChange={(e) => setNewItem({ ...newItem, detail: e.target.value })}
                />
              </Field>
              <div className="flex gap-2 sm:col-span-2">
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!newItem.label.trim()}
                  onClick={() => {
                    addPlanItem(plan.id, {
                      kind: newItem.kind,
                      label: newItem.label.trim(),
                      detail: newItem.detail.trim(),
                      due: newItem.due || undefined,
                      done: false,
                    });
                    setNewItem({ kind: newItem.kind, label: "", detail: "", due: "" });
                    setAdding(false);
                  }}
                >
                  Add item
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
              <Plus size={15} />
              Add item
            </button>
          )}
        </GlassCard>
      </div>

      {/* Right rail */}
      <div className="space-y-4">
        {/* Toxin plan (T3): zones + units + cost from the Visualize step */}
        {consultation.toxin_plan && (
          <GlassCard className="p-5">
            <h3 className="h2 text-ink-900 mb-1">Toxin plan</h3>
            <p className="caption mb-3">
              Botox units mapped during visualization.
            </p>
            <div className="space-y-1.5">
              {Object.entries(consultation.toxin_plan.zones).map(([key, z]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-ink-700">
                    {zoneByKey(key)?.label ?? key}
                  </span>
                  <span className="font-medium text-ink-900 tabular-nums">
                    {z.units}u
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-white/60 flex justify-between text-sm">
              <span className="font-medium text-ink-900">Total</span>
              <span className="font-semibold text-ink-900 tabular-nums">
                {consultation.toxin_plan.total_units}u · PKR{" "}
                {consultation.toxin_plan.total_cost.toLocaleString("en-PK")}
              </span>
            </div>
          </GlassCard>
        )}

        <GlassCard className="p-5">
          <h3 className="h2 text-ink-900 mb-3">Plan status</h3>
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_FLOW.map((s) => (
              <button
                key={s}
                onClick={() => setPlanStatus(plan.id, s)}
                className={`chip ${plan.status === s ? "chip-active" : ""}`}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="mt-4 h-2 rounded-full bg-mint-100 overflow-hidden">
            <div
              className="h-full bg-mint-500 rounded-full transition-all"
              style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }}
            />
          </div>
          <p className="caption mt-2">
            {doneCount} of {items.length} items complete
          </p>
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="h2 text-ink-900 mb-2">Plan summary</h3>
          <p className="caption mb-2">Appears on the patient report.</p>
          <textarea
            className="input min-h-[100px] resize-y"
            placeholder="e.g. Closed rhinoplasty with conservative dorsal reduction..."
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="h2 text-ink-900 mb-2">Doctor's note</h3>
          <p className="caption mb-2">
            Short consultation summary, quoted on the report.
          </p>
          <textarea
            className="input min-h-[80px] resize-y"
            placeholder="e.g. Patient aligned on a conservative, natural result..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </GlassCard>

        <GlassCard strong className="p-5">
          <p className="text-sm text-ink-700 leading-relaxed">
            The plan, milestones and medicines flow straight into the
            glassmorphic patient report.
          </p>
          <button className="btn btn-primary w-full mt-4" onClick={onReport}>
            Continue to report
            <ArrowRight size={16} />
          </button>
        </GlassCard>
      </div>
    </div>
  );
}
