export function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function relativeDay(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.floor(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86400000
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return formatDate(iso);
}

export function isToday(iso: string | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function firstName(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  const first = parts[0]?.replace(/\.$/, "").toLowerCase();
  if ((first === "dr" || first === "prof" || first === "mr" || first === "ms" || first === "mrs") && parts.length > 1) {
    return `${parts[0]} ${parts[1]}`;
  }
  return parts[0] ?? name;
}

export const SOURCE_LABELS: Record<string, string> = {
  walk_in: "Walk-in",
  vibro: "VYBERO",
  referral: "Referral",
  social: "Social",
  tourism: "Medical tourism",
};

export const ROLE_LABELS: Record<string, string> = {
  front_desk: "Front Desk",
  doctor: "Doctor",
  admin: "Clinic Admin",
};
