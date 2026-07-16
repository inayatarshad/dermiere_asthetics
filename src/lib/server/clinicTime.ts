/**
 * Clinic timezone helpers — CAPTURE operates in Pakistan (Asia/Karachi,
 * UTC+05:00, no DST). The voice agent speaks local wall-clock times, so
 * every conversion here is pinned explicitly: a booking for "16:00" must
 * be 16:00 in Lahore even when the server runs in UTC (Vercel default).
 */

export const CLINIC_TZ = "Asia/Karachi";
export const CLINIC_UTC_OFFSET = "+05:00";

/** HH:MM label (24h) of an ISO instant, in clinic wall-clock time. */
export function slotLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: CLINIC_TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Build the ISO instant for a clinic-local date + time, e.g.
 * ("2026-07-25", "16:00") → "2026-07-25T11:00:00.000Z".
 */
export function clinicLocalToISO(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const m = time.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  const hh = m[1].padStart(2, "0");
  const parsed = Date.parse(`${date}T${hh}:${m[2]}:00${CLINIC_UTC_OFFSET}`);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

/** Current date/day/time in clinic wall-clock terms (for get_current_time). */
export function clinicNow(): {
  iso: string;
  date: string;
  time: string;
  day: string;
  timezone: string;
} {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA", { timeZone: CLINIC_TZ }); // YYYY-MM-DD
  const time = now.toLocaleTimeString("en-GB", {
    timeZone: CLINIC_TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  const day = now.toLocaleDateString("en-GB", {
    timeZone: CLINIC_TZ,
    weekday: "long",
  });
  return { iso: now.toISOString(), date, time, day, timezone: CLINIC_TZ };
}
