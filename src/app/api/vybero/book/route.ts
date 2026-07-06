/**
 * POST /api/vybero/book — create (or upsert) an appointment.
 *
 * Callers:
 *  - the VYBERO voice agent (x-vybero-key header = VYBERO_API_KEY env)
 *  - clinic screens pushing locally created bookings (same-origin)
 *
 * Body: { id?, patient_name, phone?, start (ISO), duration_min?, type?,
 *         procedure_interest?, notes?, vybero_call_id?, source?, status? }
 * The slot must be free unless upserting the same appointment id.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Appointment } from "@/lib/types";
import {
  agentAuthorized,
  clinicHours,
  getAppointment,
  saveAppointment,
  slotFree,
  VyberoStoreError,
} from "@/lib/server/vyberoStore";

export const maxDuration = 30;

/** Same-origin browser writes (clinic screens) are trusted demo-grade. */
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === req.nextUrl.host;
  } catch {
    return false;
  }
}

const TYPES = new Set(["consultation", "treatment", "follow_up"]);
const STATUSES = new Set([
  "booked",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
]);

export async function POST(req: NextRequest) {
  const fromAgent = agentAuthorized(req);
  if (!fromAgent && !sameOrigin(req)) {
    return NextResponse.json(
      { error: "unauthorized", message: "Missing or invalid x-vybero-key." },
      { status: 401 }
    );
  }

  let body: Partial<Appointment> & { start?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const name = (body.patient_name ?? "").toString().trim();
  const start = (body.start ?? "").toString();
  if (!name || Number.isNaN(Date.parse(start))) {
    return NextResponse.json(
      {
        error: "bad_request",
        message: "patient_name and a valid ISO start are required.",
      },
      { status: 400 }
    );
  }

  const duration =
    typeof body.duration_min === "number" && body.duration_min >= 15
      ? Math.min(240, Math.round(body.duration_min))
      : clinicHours().slot_min;

  try {
    const id = (body.id ?? "").toString() || crypto.randomUUID();
    const existing = await getAppointment(id);

    // reschedule/new: the window must be free (ignoring this appointment)
    const free = await slotFree(start, duration, id);
    if (!free && (!existing || existing.start !== start)) {
      return NextResponse.json(
        {
          error: "slot_taken",
          message: "That time is no longer available. Pick another slot.",
        },
        { status: 409 }
      );
    }

    const appt: Appointment = {
      id,
      patient_id: body.patient_id,
      patient_name: name.slice(0, 120),
      phone: body.phone?.toString().slice(0, 40),
      start: new Date(start).toISOString(),
      duration_min: duration,
      type: TYPES.has(body.type ?? "") ? body.type! : "consultation",
      procedure_interest: body.procedure_interest?.toString().slice(0, 60),
      source: fromAgent && !existing ? "vybero" : (body.source ?? "front_desk"),
      status: STATUSES.has(body.status ?? "") ? body.status! : "booked",
      notes: body.notes?.toString().slice(0, 600),
      vybero_call_id: body.vybero_call_id?.toString().slice(0, 80),
      created_at: existing?.created_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await saveAppointment(appt);
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
