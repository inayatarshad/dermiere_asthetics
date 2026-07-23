"use client";

/**
 * Consultation brief (03_consultation-brief.md): fast structured triage.
 * One structured selection wires up the whole consultation — the primary
 * interest arms the canvas, pre-selects the AI preset, and suggests the
 * plan template.
 */

import { useState } from "react";
import { ArrowRight, HelpCircle, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { PROCEDURE_CATEGORIES, TEMPLATES, getTemplate } from "@/lib/templates";
import {
  FACE_REGIONS,
  BODY_REGIONS,
  type Brief,
  type Consultation,
} from "@/lib/types";
import { GlassCard, Chip, Toggle } from "@/components/ui";
import { FaceDiagram } from "@/components/FaceDiagram";

export function BriefStep({
  consultation,
  onContinue,
}: {
  consultation: Consultation;
  onContinue: () => void;
}) {
  const updateBrief = useStore((s) => s.updateBrief);
  const [brief, setBrief] = useState<Brief>(consultation.brief);

  const save = (next: Brief) => {
    setBrief(next);
    updateBrief(consultation.id, next);
  };

  const toggleInterest = (templateId: string) => {
    const has = brief.interests.includes(templateId);
    const interests = has
      ? brief.interests.filter((i) => i !== templateId)
      : [...brief.interests, templateId];
    let primary = brief.primary_interest;
    if (has && primary === templateId) primary = interests[0] ?? null;
    if (!has && !primary) primary = templateId;
    // auto-add the procedure's region to concerns
    const t = getTemplate(templateId);
    const concerns =
      !has && t && !brief.concerns.includes(t.region)
        ? [...brief.concerns, t.region]
        : brief.concerns;
    save({ ...brief, interests, primary_interest: primary, concerns });
  };

  const setPrimary = (templateId: string) => {
    const interests = brief.interests.includes(templateId)
      ? brief.interests
      : [...brief.interests, templateId];
    save({ ...brief, interests, primary_interest: templateId });
  };

  const toggleConcern = (regionId: string) => {
    const concerns = brief.concerns.includes(regionId)
      ? brief.concerns.filter((c) => c !== regionId)
      : [...brief.concerns, regionId];
    save({ ...brief, concerns });
  };

  const primaryTemplate = getTemplate(brief.primary_interest);

  return (
    <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4 fade-up">
      <div className="space-y-4">
        {/* Primary interest */}
        <GlassCard className="p-6">
          <h2 className="h2 text-ink-900">What is the patient in for?</h2>
          <p className="caption mt-0.5 mb-5">
            Select all that apply. The primary interest drives the canvas, AI
            preset and plan template.
          </p>
          <div className="space-y-5">
            {PROCEDURE_CATEGORIES.map((cat) => (
              <div key={cat.id}>
                <div className="text-sm font-medium text-ink-700 mb-2">
                  {cat.label}
                  <span className="caption font-normal"> · {cat.blurb}</span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {cat.templateIds.map((tid) => {
                    const t = TEMPLATES.find((x) => x.id === tid);
                    if (!t) return null;
                    const selected = brief.interests.includes(tid);
                    const isPrimary = brief.primary_interest === tid;
                    return (
                      <button
                        key={tid}
                        onClick={() =>
                          selected && !isPrimary
                            ? setPrimary(tid)
                            : toggleInterest(tid)
                        }
                        className={`chip ${selected ? "chip-active" : ""} ${
                          isPrimary ? "ring-2 ring-mint-400" : ""
                        }`}
                        title={
                          selected && !isPrimary
                            ? "Tap to make primary; tap again to remove"
                            : undefined
                        }
                      >
                        {t.name}
                        {isPrimary && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-mint-500">
                            Primary
                          </span>
                        )}
                        {!t.available && (
                          <span className="text-[10px] text-ink-400">soon</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div>
              <div className="text-sm font-medium text-ink-700 mb-2">
                Not sure yet
              </div>
              <button
                onClick={() =>
                  save({
                    ...brief,
                    goal_text: brief.goal_text || "Exploring options, help me decide",
                  })
                }
                className="chip"
              >
                <HelpCircle size={13} />
                Help me decide
              </button>
            </div>
          </div>
        </GlassCard>

        {/* Goal in the patient's words */}
        <GlassCard className="p-6">
          <h2 className="h2 text-ink-900">In the patient&apos;s words</h2>
          <p className="caption mt-0.5 mb-3">
            &ldquo;What would you change if you could?&rdquo; Captured
            verbatim for the doctor and the report.
          </p>
          <textarea
            className="input min-h-[84px] resize-y"
            placeholder={'e.g. "I\'d soften the bump on my bridge..."'}
            value={brief.goal_text}
            onChange={(e) => save({ ...brief, goal_text: e.target.value })}
          />
        </GlassCard>

        {/* Context flags */}
        <GlassCard className="p-6">
          <h2 className="h2 text-ink-900 mb-4">Context</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <FlagRow
              label="First aesthetic treatment"
              checked={!!brief.flags.first_treatment}
              onChange={(v) =>
                save({ ...brief, flags: { ...brief.flags, first_treatment: v } })
              }
            />
            <FlagRow
              label="Budget sensitive / package interest"
              checked={!!brief.flags.budget_sensitive}
              onChange={(v) =>
                save({ ...brief, flags: { ...brief.flags, budget_sensitive: v } })
              }
            />
            <FlagRow
              label="Medical tourism patient"
              checked={!!brief.flags.medical_tourism}
              onChange={(v) =>
                save({ ...brief, flags: { ...brief.flags, medical_tourism: v } })
              }
            />
            <label className="block">
              <span className="field-label">Timeline</span>
              <select
                className="input"
                value={brief.flags.timeline ?? ""}
                onChange={(e) =>
                  save({
                    ...brief,
                    flags: {
                      ...brief.flags,
                      timeline: (e.target.value || null) as Brief["flags"]["timeline"],
                    },
                  })
                }
              >
                <option value="">Not discussed</option>
                <option value="ready_now">Ready now</option>
                <option value="event_soon">Event coming up</option>
                <option value="exploring">Exploring</option>
              </select>
            </label>
          </div>
        </GlassCard>
      </div>

      {/* Right rail: concerns + summary */}
      <div className="space-y-4">
        <GlassCard className="p-6">
          <h2 className="h2 text-ink-900">Areas of concern</h2>
          <p className="caption mt-0.5 mb-3">Tap the diagram or the chips.</p>
          <FaceDiagram selected={brief.concerns} onToggle={toggleConcern} />
          <div className="field-label mt-4">Face</div>
          <div className="flex gap-1.5 flex-wrap">
            {FACE_REGIONS.map((r) => (
              <Chip
                key={r.id}
                active={brief.concerns.includes(r.id)}
                onClick={() => toggleConcern(r.id)}
              >
                {r.label}
              </Chip>
            ))}
          </div>
          {/* body areas — Exomere contouring + full-body MitoRedLight */}
          <div className="field-label mt-4">Body</div>
          <div className="flex gap-1.5 flex-wrap">
            {BODY_REGIONS.map((r) => (
              <Chip
                key={r.id}
                active={brief.concerns.includes(r.id)}
                onClick={() => toggleConcern(r.id)}
              >
                {r.label}
              </Chip>
            ))}
          </div>
        </GlassCard>

        <GlassCard strong className="p-6">
          <div className="flex items-center gap-2 text-ink-900">
            <Sparkles size={17} className="text-mint-500" />
            <h3 className="font-medium">This brief arms the consultation</h3>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-ink-700">
            <li className="flex gap-2">
              <span className="text-mint-500">1.</span> Canvas loads with{" "}
              {primaryTemplate
                ? `the ${primaryTemplate.region} region emphasized`
                : "the selected regions emphasized"}
            </li>
            <li className="flex gap-2">
              <span className="text-mint-500">2.</span> AI visualization
              pre-selects{" "}
              {primaryTemplate ? `the ${primaryTemplate.name} preset` : "a preset"}
            </li>
            <li className="flex gap-2">
              <span className="text-mint-500">3.</span> Plan suggests{" "}
              {primaryTemplate
                ? `the ${primaryTemplate.name} template`
                : "a matching template"}
            </li>
          </ul>
          <button
            className="btn btn-primary w-full mt-5"
            onClick={onContinue}
            disabled={!brief.primary_interest}
          >
            Start consultation
            <ArrowRight size={16} />
          </button>
          {!brief.primary_interest && (
            <p className="caption text-center mt-2">
              Pick a primary interest to continue.
            </p>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function FlagRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="glass-subtle flex items-center justify-between gap-3 px-4 py-3">
      <span className="text-sm text-ink-900">{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
