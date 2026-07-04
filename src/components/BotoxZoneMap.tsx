"use client";

/**
 * Botox treatment-zone map (T3): a tappable face schematic replacing the
 * flat slider list. Tap a zone to activate it (mint fill + glow); every
 * active zone reveals its intensity slider, unit stepper and running
 * total. Zones write the SAME flat slider keys as the template schema, so
 * prompts, caching and the multi-procedure flow are untouched.
 */

import { useMemo } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  BOTOX_ZONES,
  unitsForIntensity,
  type BotoxZoneDef,
} from "@/lib/botoxUnits";
import { MintSlider } from "./MintSlider";
import { getTemplate } from "@/lib/templates";

/** Zone hit-shapes on the schematic (ellipses; bilateral zones get two). */
const ZONE_SHAPES: Record<
  string,
  { cx: number; cy: number; rx: number; ry: number }[]
> = {
  forehead_lines: [{ cx: 60, cy: 24, rx: 26, ry: 9 }],
  glabella_lines: [{ cx: 60, cy: 41, rx: 6.5, ry: 5.5 }],
  crows_feet: [
    { cx: 27, cy: 52, rx: 6, ry: 6.5 },
    { cx: 93, cy: 52, rx: 6, ry: 6.5 },
  ],
  brow_lift: [
    { cx: 36, cy: 41, rx: 9, ry: 3.6 },
    { cx: 84, cy: 41, rx: 9, ry: 3.6 },
  ],
  masseter_slim: [
    { cx: 31, cy: 85, rx: 9, ry: 10 },
    { cx: 89, cy: 85, rx: 9, ry: 10 },
  ],
  lip_flip: [{ cx: 60, cy: 80, rx: 12, ry: 4.2 }],
};

export function BotoxZoneMap({
  values,
  onChange,
  compact = false,
  unitOverrides = {},
  onUnitsChange,
  pricePerUnit,
}: {
  values: Record<string, number>;
  onChange: (key: string, v: number) => void;
  /** compact: canvas-rail variant (map + sliders, no units planning) */
  compact?: boolean;
  unitOverrides?: Record<string, number>;
  onUnitsChange?: (key: string, units: number | null) => void;
  pricePerUnit?: number;
}) {
  const schema = getTemplate("botox")?.slider_schema ?? [];
  const isActive = (key: string) => (values[key] ?? 0) >= 15;
  const activeZones = BOTOX_ZONES.filter((z) => isActive(z.key));

  const totals = useMemo(() => {
    let units = 0;
    for (const z of activeZones) {
      units += unitOverrides[z.key] ?? unitsForIntensity(z, values[z.key] ?? 0);
    }
    return { units, cost: pricePerUnit ? units * pricePerUnit : null };
  }, [activeZones, unitOverrides, values, pricePerUnit]);

  const toggle = (zone: BotoxZoneDef) => {
    if (isActive(zone.key)) {
      onChange(zone.key, 0);
      onUnitsChange?.(zone.key, null);
    } else {
      onChange(zone.key, 50);
    }
  };

  return (
    <div>
      {/* --- the schematic --- */}
      <svg
        viewBox="0 0 120 132"
        className={`w-full ${compact ? "max-w-[190px]" : "max-w-[250px]"} mx-auto select-none`}
        role="group"
        aria-label="Botox treatment zones"
      >
        <defs>
          <filter id="zoneGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* head outline (FaceDiagram pattern) */}
        <ellipse
          cx="60"
          cy="60"
          rx="34"
          ry="44"
          fill="rgba(255,255,255,0.55)"
          stroke="var(--mint-300)"
          strokeWidth="1.2"
        />
        <path
          d="M48 100 L48 112 Q60 118 72 112 L72 100"
          fill="none"
          stroke="var(--mint-200)"
          strokeWidth="1.2"
        />
        <g stroke="var(--ink-400)" strokeWidth="0.9" opacity="0.5" fill="none">
          <path d="M32 46 Q41 42 50 46" />
          <path d="M70 46 Q79 42 88 46" />
          <ellipse cx="41" cy="50" rx="5.5" ry="2.6" />
          <ellipse cx="79" cy="50" rx="5.5" ry="2.6" />
          <path d="M56 66 Q60 69 64 66" />
          <path d="M52 82 Q60 86 68 82" />
        </g>

        {BOTOX_ZONES.map((zone) =>
          (ZONE_SHAPES[zone.key] ?? []).map((s, i) => {
            const active = isActive(zone.key);
            return (
              <ellipse
                key={`${zone.key}_${i}`}
                cx={s.cx}
                cy={s.cy}
                rx={s.rx}
                ry={s.ry}
                fill={
                  active ? "rgba(52, 211, 176, 0.5)" : "rgba(52, 211, 176, 0.07)"
                }
                stroke={active ? "var(--mint-500)" : "var(--mint-200)"}
                strokeWidth={active ? 1.5 : 0.8}
                strokeDasharray={active ? undefined : "2 2"}
                filter={active ? "url(#zoneGlow)" : undefined}
                className="cursor-pointer transition-all hover:fill-[rgba(52,211,176,0.3)]"
                onClick={() => toggle(zone)}
                role="button"
                aria-pressed={active}
                aria-label={`${zone.label} zone`}
              >
                <title>
                  {zone.label} ({zone.minUnits}-{zone.maxUnits}u
                  {zone.perSide ? "/side" : ""})
                </title>
              </ellipse>
            );
          })
        )}
      </svg>

      <p className="caption text-center mt-1.5 mb-3">
        Tap a zone to treat it. {activeZones.length} of {BOTOX_ZONES.length}{" "}
        zones active.
      </p>

      {/* --- active zones: intensity + units --- */}
      <div className="space-y-4">
        {activeZones.map((zone) => {
          const def = schema.find((s) => s.key === zone.key);
          const intensity = values[zone.key] ?? 0;
          const autoUnits = unitsForIntensity(zone, intensity);
          const units = unitOverrides[zone.key] ?? autoUnits;
          const overridden = unitOverrides[zone.key] !== undefined;
          return (
            <div key={zone.key} className="glass-subtle p-3.5">
              <MintSlider
                label={def?.label ?? zone.label}
                hint={
                  zone.kind === "texture"
                    ? "Skin-level: renders in the AI pass"
                    : def?.hint
                }
                min={def?.min ?? 0}
                max={def?.max ?? 100}
                value={intensity}
                negLabel={def?.negLabel}
                posLabel={def?.posLabel}
                onChange={(v) => onChange(zone.key, v)}
              />
              {!compact && onUnitsChange && (
                <div className="flex items-center gap-2 mt-2.5">
                  <span className="caption flex-1">
                    Units ({zone.minUnits}-{zone.maxUnits}u
                    {zone.perSide ? " per side" : ""})
                  </span>
                  <button
                    className="w-8 h-8 rounded-lg bg-white/60 border border-white/70 flex items-center justify-center text-ink-700 hover:border-mint-400"
                    onClick={() => onUnitsChange(zone.key, Math.max(1, units - 1))}
                    aria-label={`Decrease ${zone.label} units`}
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-sm font-semibold text-ink-900 tabular-nums w-11 text-center">
                    {units}u
                  </span>
                  <button
                    className="w-8 h-8 rounded-lg bg-white/60 border border-white/70 flex items-center justify-center text-ink-700 hover:border-mint-400"
                    onClick={() => onUnitsChange(zone.key, Math.min(150, units + 1))}
                    aria-label={`Increase ${zone.label} units`}
                  >
                    <Plus size={14} />
                  </button>
                  {overridden && (
                    <button
                      className="text-ink-400 hover:text-ink-700 p-1"
                      onClick={() => onUnitsChange(zone.key, null)}
                      title={`Back to suggested (${autoUnits}u)`}
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* --- running total --- */}
      {!compact && activeZones.length > 0 && (
        <div className="mt-4 rounded-xl bg-mint-100/80 border border-mint-200 px-4 py-3 flex items-baseline justify-between">
          <span className="text-sm font-medium text-ink-900">Toxin total</span>
          <span className="text-sm font-semibold text-ink-900 tabular-nums">
            {totals.units}u
            {totals.cost !== null && (
              <span className="text-ink-700 font-normal">
                {" "}
                · PKR {totals.cost.toLocaleString("en-PK")}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
