"use client";

/**
 * Client-side calendar math shared by the Calendar page: week windows,
 * slot grids and local availability (mirror of the server logic in
 * vyberoStore.ts, computed from the local store so the UI works offline).
 */

import type { Appointment, ClinicHours } from "./types";

export const ACTIVE_STATUSES = new Set(["booked", "confirmed"]);

export function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = (out.getDay() + 6) % 7; // Monday = 0
  out.setDate(out.getDate() - day);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}

/** Minutes since the clinic's opening time for a datetime. */
export function minutesIntoDay(iso: string, hours: ClinicHours): number {
  const d = new Date(iso);
  const { h, m } = parseHM(hours.open);
  return d.getHours() * 60 + d.getMinutes() - (h * 60 + m);
}

export function openMinutes(hours: ClinicHours): number {
  const o = parseHM(hours.open);
  const c = parseHM(hours.close);
  return c.h * 60 + c.m - (o.h * 60 + o.m);
}

/** Slot start times (as minutes offsets) for the grid. */
export function slotOffsets(hours: ClinicHours): number[] {
  const total = openMinutes(hours);
  const out: number[] = [];
  for (let t = 0; t + hours.slot_min <= total; t += hours.slot_min) out.push(t);
  return out;
}

export function slotLabel(offset: number, hours: ClinicHours): string {
  const { h, m } = parseHM(hours.open);
  const total = h * 60 + m + offset;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  const ampm = hh < 12 ? "am" : "pm";
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, "0")}${ampm}`;
}

export function appointmentsOn(
  appointments: Appointment[],
  key: string
): Appointment[] {
  return appointments
    .filter((a) => a.start.slice(0, 10) === key && a.status !== "cancelled")
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Is a slot (day key + minute offset) free of active appointments? */
export function slotIsFree(
  appointments: Appointment[],
  key: string,
  offset: number,
  hours: ClinicHours
): boolean {
  const s = offset;
  const e = offset + hours.slot_min;
  return !appointments.some((a) => {
    if (a.start.slice(0, 10) !== key || !ACTIVE_STATUSES.has(a.status)) {
      return false;
    }
    const as = minutesIntoDay(a.start, hours);
    const ae = as + a.duration_min;
    return s < ae && e > as;
  });
}

/** ISO datetime for a day key + minutes offset from opening. */
export function slotToISO(
  key: string,
  offset: number,
  hours: ClinicHours
): string {
  const { h, m } = parseHM(hours.open);
  const d = new Date(`${key}T00:00:00`);
  d.setHours(h, m + offset, 0, 0);
  return d.toISOString();
}

export function freeSlotCount(
  appointments: Appointment[],
  key: string,
  hours: ClinicHours
): number {
  return slotOffsets(hours).filter((o) =>
    slotIsFree(appointments, key, o, hours)
  ).length;
}
