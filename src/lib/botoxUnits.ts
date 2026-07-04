/**
 * Botox treatment zones + units planning (T3).
 *
 * THE editable table: clinics tune unit ranges here (and the per-unit price
 * in Settings). Zones write the same flat slider keys as the schema in
 * templates.ts, so prompts, caching, records and the multi-procedure flow
 * are untouched.
 */

export interface BotoxZoneDef {
  key: string; // the SliderDef key in the botox template
  label: string;
  minUnits: number;
  maxUnits: number;
  perSide?: boolean; // dose quoted per side; total doubles it
  /** geometric zones move the live mesh; texture zones render in the AI pass */
  kind: "texture" | "geometric";
}

export const BOTOX_ZONES: BotoxZoneDef[] = [
  { key: "forehead_lines", label: "Forehead", minUnits: 10, maxUnits: 20, kind: "texture" },
  { key: "glabella_lines", label: "Glabella (11s)", minUnits: 15, maxUnits: 25, kind: "texture" },
  { key: "crows_feet", label: "Crow's feet", minUnits: 6, maxUnits: 12, perSide: true, kind: "texture" },
  { key: "brow_lift", label: "Brow lift", minUnits: 4, maxUnits: 8, kind: "geometric" },
  { key: "masseter_slim", label: "Masseter", minUnits: 20, maxUnits: 30, perSide: true, kind: "geometric" },
  { key: "lip_flip", label: "Lip flip", minUnits: 4, maxUnits: 6, kind: "geometric" },
];

export function zoneByKey(key: string): BotoxZoneDef | undefined {
  return BOTOX_ZONES.find((z) => z.key === key);
}

/** Default total units for a zone at a given intensity (0..100). */
export function unitsForIntensity(zone: BotoxZoneDef, intensity: number): number {
  const t = Math.min(100, Math.max(0, intensity)) / 100;
  const perSide = Math.round(zone.minUnits + (zone.maxUnits - zone.minUnits) * t);
  return zone.perSide ? perSide * 2 : perSide;
}

export interface ToxinPlanZone {
  intensity: number;
  units: number;
}

export interface ToxinPlan {
  zones: Record<string, ToxinPlanZone>;
  total_units: number;
  total_cost: number;
  price_per_unit: number;
}

export function buildToxinPlan(
  params: Record<string, number>,
  unitOverrides: Record<string, number>,
  pricePerUnit: number
): ToxinPlan | null {
  const zones: Record<string, ToxinPlanZone> = {};
  let total = 0;
  for (const zone of BOTOX_ZONES) {
    const intensity = params[zone.key] ?? 0;
    if (intensity < 15) continue;
    const units = unitOverrides[zone.key] ?? unitsForIntensity(zone, intensity);
    zones[zone.key] = { intensity: Math.round(intensity), units };
    total += units;
  }
  if (total === 0) return null;
  return {
    zones,
    total_units: total,
    total_cost: total * pricePerUnit,
    price_per_unit: pricePerUnit,
  };
}
