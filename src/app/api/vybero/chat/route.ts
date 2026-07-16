/**
 * POST /api/vybero/chat — the public VYBERO web concierge.
 *
 * Stateless: the client echoes the conversation state each turn. Answers
 * come from the CAPTURE knowledge base; bookings are written into the
 * clinic's real appointment book (source "vybero") and logged as a call,
 * so the calendar and the analytics dashboard light up live.
 *
 * Public by design (patients use it) — rate-limited per IP, no PHI ever
 * returned, and the clinic is resolved server-side (never trusted from
 * the client beyond a slug).
 */

import { NextRequest, NextResponse } from "next/server";
import type { Appointment, VyberoCall } from "@/lib/types";
import { DEFAULT_CLINIC_HOURS } from "@/lib/types";
import {
  conciergeRespond,
  bookingConfirmedReply,
  type ConciergeState,
} from "@/lib/server/concierge";
import {
  ensureSeedClinic,
  getClinicConfig,
  listClinicConfigs,
  DEMO_CLINIC_SLUG,
} from "@/lib/server/clinicStore";
import {
  availabilityFor,
  saveAppointment,
  saveCall,
  slotFree,
} from "@/lib/server/vyberoStore";
import { pgGetClinicBySlug, dbAvailable } from "@/lib/server/db";

export const runtime = "nodejs";

// ---- per-IP rate limiting (blunt abuse guard) -------------------------
const hits = new Map<string, number[]>();
function rateLimited(key: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((x) => now - x < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}

async function resolveClinicId(slug?: string): Promise<string | null> {
  try {
    await ensureSeedClinic();
  } catch {
    // storage down — resolved below (may still work if clinics cached)
  }
  try {
    if (slug) {
      const row = await pgGetClinicBySlug(slug);
      if (row) return row.id;
    }
    const demo = await pgGetClinicBySlug(DEMO_CLINIC_SLUG);
    if (demo) return demo.id;
    const all = await listClinicConfigs();
    return all[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!dbAvailable()) {
    return NextResponse.json(
      {
        reply:
          "I am momentarily offline for maintenance. Please message us on WhatsApp at +92-309-4442031 and the team will take care of you right away.",
        state: {},
      },
      { status: 200 }
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "ip";
  if (rateLimited(`chat:${ip}`)) {
    return NextResponse.json(
      { error: "rate_limited", reply: "One moment please — you are sending messages very quickly.", state: {} },
      { status: 429 }
    );
  }

  let body: { message?: string; state?: ConciergeState; clinic?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const message = (body.message ?? "").toString().slice(0, 500);
  if (!message.trim()) {
    return NextResponse.json({ error: "empty_message" }, { status: 400 });
  }
  const state: ConciergeState =
    body.state && typeof body.state === "object" ? body.state : {};
  if ((state.turns ?? 0) > 200) {
    return NextResponse.json({ error: "conversation_too_long" }, { status: 400 });
  }

  const clinicId = await resolveClinicId(
    typeof body.clinic === "string" ? body.clinic.slice(0, 40) : undefined
  );
  if (!clinicId) {
    return NextResponse.json(
      {
        reply:
          "I could not reach the booking system just now. Our team is on WhatsApp at +92-309-4442031 and will help you immediately.",
        state,
      },
      { status: 200 }
    );
  }

  const config = await getClinicConfig(clinicId);
  const hours = config?.hours ?? DEFAULT_CLINIC_HOURS;

  try {
    const turn = await conciergeRespond(message, state, {
      hours,
      availability: (date) => availabilityFor(clinicId, date, hours),
      prices: config?.prices,
    });

    // The engine asked us to finalise a booking
    if (turn.createBooking) {
      const cb = turn.createBooking;
      const free = await slotFree(clinicId, cb.startISO, cb.durationMin);
      if (!free) {
        // someone took it mid-conversation: bounce back to time choice
        const st = { ...turn.state };
        if (st.booking) st.booking.step = "time";
        return NextResponse.json({
          reply:
            "That slot was taken just this moment — my apologies. Let me offer you the nearest free times instead. Which time works?",
          chips: [],
          state: st,
        });
      }

      const now = new Date().toISOString();
      const appt: Appointment = {
        id: crypto.randomUUID(),
        patient_name: cb.name,
        phone: cb.phone,
        start: cb.startISO,
        duration_min: cb.durationMin,
        type: "treatment",
        procedure_interest: cb.treatment,
        source: "vybero",
        status: "booked",
        location_id: cb.location,
        created_at: now,
        updated_at: now,
      };
      await saveAppointment(clinicId, appt);

      const call: VyberoCall = {
        id: crypto.randomUUID(),
        started_at: now,
        duration_secs: Math.min(600, (turn.state.turns ?? 4) * 25),
        direction: "inbound",
        caller_name: cb.name,
        caller_phone: cb.phone,
        language: "English",
        outcome: "booked",
        topics: turn.state.topics ?? [cb.treatment],
        questions: turn.state.questions ?? [],
        summary: `Web concierge chat: booked ${cb.treatment.replace(/-/g, " ")} at ${cb.location.replace(/-/g, " ")}.`,
        appointment_id: appt.id,
      };
      await saveCall(clinicId, call);

      const date = cb.startISO.slice(0, 10);
      const time = new Date(cb.startISO).toTimeString().slice(0, 5);
      const done = { ...turn.state };
      delete done.booking;

      return NextResponse.json({
        reply: bookingConfirmedReply({
          treatment: cb.treatment,
          location: cb.location,
          date,
          time,
          name: cb.name,
          reference: appt.id,
        }),
        chips: ["Treatments", "Aftercare", "That is all, thank you"],
        state: done,
        booked: {
          reference: appt.id,
          treatment: cb.treatment,
          location: cb.location,
          date,
          time,
          name: cb.name,
        },
      });
    }

    return NextResponse.json({
      reply: turn.reply,
      chips: turn.chips ?? [],
      state: turn.state,
      booked: turn.booked,
    });
  } catch (err) {
    console.error("[vybero-chat]", err);
    return NextResponse.json(
      {
        reply:
          "Something went wrong on my side. Our team is always available on WhatsApp at +92-309-4442031.",
        state,
      },
      { status: 200 }
    );
  }
}
