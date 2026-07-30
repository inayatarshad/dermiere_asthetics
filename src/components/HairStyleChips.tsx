"use client";

/**
 * Hairstyle try-on - the second half of the hair transplant vertical.
 * Styles are exclusive on/off choices stored as flat AI params
 * (style_* = 100, bandless prompt phrases), so persistence, the params
 * hash, prompt assembly and report labels all work unchanged. The chips
 * read their labels and phrases straight from the template's slider
 * schema: adding a style = adding one schema entry in templates.ts.
 */

import { Scissors } from "lucide-react";
import type { TreatmentTemplate } from "@/lib/types";
import { Chip } from "@/components/ui";

export const HAIR_STYLE_PREFIX = "style_";

export function hairStyleDefs(template: TreatmentTemplate) {
  return template.slider_schema.filter((s) =>
    s.key.startsWith(HAIR_STYLE_PREFIX)
  );
}

export function HairStyleChips({
  template,
  params,
  onPick,
}: {
  template: TreatmentTemplate;
  params: Record<string, number>;
  /** null = keep the patient's current style */
  onPick: (styleKey: string | null) => void;
}) {
  const styles = hairStyleDefs(template);
  const activeKey =
    styles.find((s) => (params[s.key] ?? 0) >= 15)?.key ?? null;

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Scissors size={14} className="text-mint-500" />
        <span className="text-sm font-medium text-ink-900">
          Hairstyle try-on
        </span>
      </div>
      <p className="caption mt-0.5 mb-2.5">
        How the grown-in result is styled. Pick one, or keep their current
        style.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Chip active={!activeKey} onClick={() => onPick(null)}>
          Keep current
        </Chip>
        {styles.map((s) => (
          <Chip
            key={s.key}
            active={activeKey === s.key}
            onClick={() => onPick(activeKey === s.key ? null : s.key)}
          >
            {s.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
