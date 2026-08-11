import type { ClinicLocation } from "@/lib/types";

function normalized(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Resolve a spoken branch name without ever silently choosing another branch. */
export function resolveClinicLocation(
  value: string | undefined,
  locations: ClinicLocation[] | undefined
): ClinicLocation | null {
  const query = normalized(value ?? "");
  if (!query) return null;

  const aliases = new Map<string, string>([
    ["f10", "branch_f10"],
    ["f 10", "branch_f10"],
    ["f ten", "branch_f10"],
    ["gulberg", "branch_gulberg"],
    ["gulberg islamabad", "branch_gulberg"],
    ["gulberg greens", "branch_gulberg"],
    ["gulberg greens islamabad", "branch_gulberg"],
  ]);
  const aliasId = aliases.get(query);
  if (aliasId) {
    return locations?.find((location) => location.id === aliasId) ?? null;
  }

  return (
    locations?.find((location) => {
      // City is intentionally excluded: both Dermiére branches are in
      // Islamabad, so matching on it would always pick the first branch.
      const labels = [location.id, location.name, location.short, location.area]
        .filter(Boolean)
        .map((label) => normalized(label!));
      return labels.some(
        (label) => query === label || query.includes(label) || label.includes(query)
      );
    }) ?? null
  );
}
