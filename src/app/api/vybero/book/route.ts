/**
 * POST /api/vybero/book — create (or upsert) an appointment for a clinic.
 *
 * Callers:
 *  - the VYBERO voice agent (x-vybero-key + x-clinic) → source "vybero"
 *  - a signed-in clinic screen (session cookie) → its own clinic
 *
 * The slot must be free unless upserting the same appointment id. Every
 * write is clinic-scoped; no cross-clinic booking is possible.
 */

import { NextRequest, NextResponse } from "next/server";
import type { Appointment } from "@/lib/types";
import { getSession } from "@/lib/server/auth";
import { agentKeyValid, resolveAgentClinic } from "@/lib/server/agentAuth";
import { getClinicConfig } from "@/lib/server/clinicStore";
import {
  getAppointment,
  saveAppointment,
  slotFree,
  VyberoStoreError,
} from "@/lib/server/vyberoStore";

export const maxDuration = 30;

const TYPES = new Set(["consultation", "treatment", "follow_up"]);
const STATUSES = new Set(["booked", "confirmed", "completed", "cancelled", "no_show"]);

export async function POST(req: NextRequest) {
  let body: Partial<Appointment> & { start?: string; clinic?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid JSON body." }, { status: 400 });
  }

  // Resolve the clinic + whether this came from the voice agent.
  const fromAgent = agentKeyValid(req) && !!(req.headers.get("x-vybero-key") || req.headers.get("x-clinic") || body.clinic);
  let clinicId: string | null = null;
  if (fromAgent) {
    clinicId = await resolveAgentClinic(req, body.clinic);
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

  const name = (body.patient_name ?? "").toString().trim();
  const start = (body.start ?? "").toString();
  if (!name || Number.isNaN(Date.parse(start))) {
    return NextResponse.json(
      { error: "bad_request", message: "patient_name and a valid ISO start are required." },
      { status: 400 }
    );
  }

  const config = await getClinicConfig(clinicId);
  const slotMin = config?.hours.slot_min ?? 30;
  const duration =
    typeof body.duration_min === "number" && body.duration_min >= 15
      ? Math.min(240, Math.round(body.duration_min))
      : slotMin;

  try {
    const id = (body.id ?? "").toString() || crypto.randomUUID();
    const existing = await getAppointment(clinicId, id);

    const free = await slotFree(clinicId, start, duration, id);
    if (!free && (!existing || existing.start !== start)) {
      return NextResponse.json(
        { error: "slot_taken", message: "That time is no longer available. Pick another slot." },
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
    await saveAppointment(clinicId, appt);
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
