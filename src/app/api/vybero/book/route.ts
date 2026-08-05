/**
 * POST /api/vybero/book - create (or upsert) an appointment for a clinic.
 *
 * Callers:
 *  - the VYBERO voice agent (ElevenLabs webhook tool "book_appointment",
 *    authenticated with x-vybero-key OR Authorization: Bearer) → "vybero"
 *  - a signed-in clinic screen (session cookie) → its own clinic
 *
 * Two accepted body shapes:
 *  A) internal: { patient_name, start: ISO, duration_min, ... }
 *  B) ElevenLabs flat: { customer_name, phone, treatment, date: YYYY-MM-DD,
 *     time: HH:MM (Pakistan time), notes?, email?, location? }
 *     → answered with the voice-friendly contract the agent reads back:
 *       { status: "confirmed", booking_id, message } or
 *       { status: "unavailable", message, alternatives: ["14:00", ...] }
 *
 * The slot must be free unless upserting the same appointment id. Every
 * write is clinic-scoped; no cross-clinic booking is possible. Times in
 * shape B are Pakistan wall-clock and pinned to +05:00 explicitly, so a
 * UTC server can never shift a 4 PM booking to 9 PM.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Appointment, ClinicLocation } from "@/lib/types";
import { getSession } from "@/lib/server/auth";
import {
  agentKeyValid,
  agentKeyPresented,
  resolveAgentClinic,
} from "@/lib/server/agentAuth";
import { getClinicConfig } from "@/lib/server/clinicStore";
import {
  availabilityFor,
  getAppointment,
  saveAppointment,
  slotFree,
  VyberoStoreError,
} from "@/lib/server/vyberoStore";
import { clinicLocalToISO, slotLabel } from "@/lib/server/clinicTime";
import { CAPTURE_TREATMENTS } from "@/lib/capture/kb";
import { DERMIERE_TREATMENTS } from "@/lib/dermiere/clinic";

export const maxDuration = 30;

const TYPES = new Set(["consultation", "treatment", "follow_up"]);
const STATUSES = new Set(["booked", "confirmed", "completed", "cancelled", "no_show"]);
const DERMIERE_VOICE_ONLY_SERVICES = [
  { id: "iv_signature", name: "Dermiére Signature IV", short: "signature iv", durationMin: 30 },
  { id: "iv_quicky", name: "Quicky IV", short: "quicky", durationMin: 30 },
  { id: "iv_hangover", name: "The Hangover IV", short: "hangover", durationMin: 30 },
  { id: "iv_recovery", name: "Recovery IV", short: "recovery iv", durationMin: 30 },
];

interface FlatBooking {
  customer_name?: string;
  phone?: string;
  treatment?: string;
  date?: string;
  time?: string;
  notes?: string;
  email?: string;
  location?: string;
}

/** Map a spoken treatment name to the catalogue (or consultation). */
function matchTreatmentByName(name: string | undefined, clinicSlug?: string): {
  /** Always set - "consultation" when nothing matched, so the calendar
   *  never shows a blank treatment (the bug behind label-less bookings). */
  id: string;
  durationMin: number;
  type: Appointment["type"];
  label: string;
  matched: boolean;
} {
  const t = (name ?? "").toLowerCase().trim();
  if (!t || /consult/.test(t)) {
    return { id: "consultation", durationMin: 30, type: "consultation", label: "Consultation", matched: true };
  }
  const catalogue = clinicSlug === "dermiere"
    ? [
        ...DERMIERE_TREATMENTS.map((x) => ({ ...x, short: x.name, durationMin: 30 })),
        ...DERMIERE_VOICE_ONLY_SERVICES,
      ]
    : CAPTURE_TREATMENTS;
  const hit =
    catalogue.find((x) => x.name.toLowerCase() === t) ??
    catalogue.find(
      (x) =>
        t.includes(x.short.toLowerCase()) ||
        x.name.toLowerCase().includes(t) ||
        t.includes(x.name.toLowerCase())
    );
  if (hit) {
    return { id: hit.id, durationMin: hit.durationMin, type: "treatment", label: hit.name, matched: true };
  }
  // Unknown wording still books a consultation slot rather than failing the call
  return { id: "consultation", durationMin: 30, type: "consultation", label: name ?? "Consultation", matched: false };
}

/** Map a spoken location to a location id (defaults to the Experience Centre). */
function matchLocationByName(
  name: string | undefined,
  locations: ClinicLocation[] | undefined
): string {
  const t = (name ?? "").toLowerCase();
  const available = locations ?? [];
  const hit = available.find((location) =>
    t && [location.name, location.short, location.area, location.city]
      .filter(Boolean)
      .some((value) => {
        const normalized = value!.toLowerCase();
        return t.includes(normalized) || normalized.includes(t);
      })
  );
  return hit?.id ?? available[0]?.id ?? "experience-centre";
}

export async function POST(req: NextRequest) {
  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid JSON body." }, { status: 400 });
  }

  const flat = raw as FlatBooking;
  const isFlat = typeof flat.customer_name === "string" && !("start" in raw);

  // Resolve the clinic + whether this came from the voice agent.
  const fromAgent = agentKeyPresented(req) && agentKeyValid(req);
  let clinicId: string | null = null;
  if (fromAgent || (agentKeyValid(req) && (raw.clinic || req.headers.get("x-clinic")))) {
    clinicId = await resolveAgentClinic(req, (raw.clinic as string) ?? null);
  } else {
    const session = await getSession(req);
    clinicId = session?.cid ?? null;
  }
  if (!clinicId) {
    return NextResponse.json(
      { error: "unauthorized", message: "Missing clinic context or credentials." },
      { status: 401 }
    );
  }

  const config = await getClinicConfig(clinicId);
  if (!config) {
    return NextResponse.json(
      { error: "not_configured", message: "Clinic configuration was not found." },
      { status: 501 }
    );
  }

  // -------------------------------------------------------------------
  // Normalize the two shapes into one internal booking request
  // -------------------------------------------------------------------
  const body = raw as Partial<Appointment> & { start?: string };

  let name: string;
  let startISO: string;
  let durationMin: number | undefined;
  let type: Appointment["type"] | undefined;
  let procedure: string | undefined;
  let notes: string | undefined;
  let phone: string | undefined;
  let locationId: string | undefined;

  if (isFlat) {
    name = (flat.customer_name ?? "").toString().trim();
    const iso = clinicLocalToISO((flat.date ?? "").toString(), (flat.time ?? "").toString());
    if (!name || !iso) {
      return NextResponse.json(
        {
          status: "error",
          error: "bad_request",
          message:
            "customer_name, date (YYYY-MM-DD) and time (HH:MM, Pakistan time) are required.",
        },
        { status: 400 }
      );
    }
    startISO = iso;
    const tr = matchTreatmentByName(flat.treatment?.toString(), config.slug);
    durationMin = tr.durationMin;
    type = tr.type;
    procedure = tr.id;
    phone = flat.phone?.toString();
    locationId = matchLocationByName(flat.location?.toString(), config.locations);
    const extra = [
      flat.notes?.toString().trim(),
      flat.email ? `Email: ${flat.email}` : "",
      // spoken wording the matcher couldn't place - front desk sees the ask
      !tr.matched && flat.treatment ? `Asked for: ${flat.treatment.toString().slice(0, 80)}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    notes = extra || undefined;
  } else {
    name = (body.patient_name ?? "").toString().trim();
    const start = (body.start ?? "").toString();
    if (!name || Number.isNaN(Date.parse(start))) {
      return NextResponse.json(
        { error: "bad_request", message: "patient_name and a valid ISO start are required." },
        { status: 400 }
      );
    }
    startISO = new Date(start).toISOString();
    durationMin = typeof body.duration_min === "number" ? body.duration_min : undefined;
    type = TYPES.has(body.type ?? "") ? body.type : undefined;
    procedure = body.procedure_interest?.toString().slice(0, 60);
    phone = body.phone?.toString();
    notes = body.notes?.toString();
    locationId = body.location_id?.toString();
  }

  const slotMin = config?.hours.slot_min ?? 30;
  const duration =
    typeof durationMin === "number" && durationMin >= 15
      ? Math.min(240, Math.round(durationMin))
      : slotMin;

  try {
    const id = (body.id ?? "").toString() || crypto.randomUUID();
    const existing = await getAppointment(clinicId, id);

    const free = await slotFree(clinicId, startISO, duration, id);
    if (!free && (!existing || existing.start !== startISO)) {
      if (isFlat) {
        // voice contract: 200 + structured "unavailable" with alternatives,
        // so the agent can offer times instead of reporting a tool failure
        const day = startISO.slice(0, 10);
        const open = await availabilityFor(clinicId, day, config?.hours).catch(() => []);
        const requested = Date.parse(startISO);
        const alternatives = open
          .map((s) => ({ label: slotLabel(s.start), dist: Math.abs(Date.parse(s.start) - requested) }))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 3)
          .map((s) => s.label);
        return NextResponse.json({
          status: "unavailable",
          message:
            alternatives.length > 0
              ? `That time was just taken. Nearest open times: ${alternatives.join(", ")}.`
              : "That day is fully booked.",
          alternatives,
        });
      }
      return NextResponse.json(
        { error: "slot_taken", message: "That time is no longer available. Pick another slot." },
        { status: 409 }
      );
    }

    const appt: Appointment = {
      id,
      patient_id: body.patient_id,
      patient_name: name.slice(0, 120),
      phone: phone?.slice(0, 40),
      start: startISO,
      duration_min: duration,
      type: type ?? "consultation",
      procedure_interest: procedure,
      source: fromAgent && !existing ? "vybero" : ((body.source as Appointment["source"]) ?? "front_desk"),
      status: STATUSES.has(body.status ?? "") ? body.status! : "booked",
      notes: notes?.slice(0, 600),
      vybero_call_id: body.vybero_call_id?.toString().slice(0, 80),
      location_id: locationId ?? "experience-centre",
      created_at: existing?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await saveAppointment(clinicId, appt);

    if (isFlat) {
      const spoken = `${slotLabel(startISO)} on ${new Date(startISO).toLocaleDateString("en-GB", {
        timeZone: "Asia/Karachi",
        weekday: "long",
        day: "numeric",
        month: "long",
      })}`;
      return NextResponse.json({
        status: "confirmed",
        booking_id: `${config.slug === "dermiere" ? "DER" : "CAP"}-${appt.id.slice(0, 8).toUpperCase()}`,
        message: `Booked ${matchTreatmentByName(flat.treatment?.toString(), config.slug).label} for ${appt.patient_name}, ${spoken}, at ${config.locations?.find((l) => l.id === appt.location_id)?.name ?? config.name}.`,
        appointment: appt,
      });
    }
    return NextResponse.json({ ok: true, appointment: appt });
  } catch (err) {
    if (err instanceof VyberoStoreError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.code === "not_configured" ? 501 : 502 }
      );
    }
    console.error("[vybero/book]", err);
    return NextResponse.json(
      { error: "store_error", message: "Could not save the booking." },
      { status: 502 }
    );
  }
}
