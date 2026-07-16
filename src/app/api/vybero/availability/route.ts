/**
 * GET /api/vybero/availability?date=YYYY-MM-DD
 *
 * Free bookable slots for a date (the clinic's hours minus its active
 * appointments). Read by the VYBERO voice agent (ElevenLabs webhook tool
 * "check_availability") before offering times. Agent-authenticated
 * (x-vybero-key or Authorization: Bearer) + clinic-scoped. Exposes only
 * free/busy windows — never patient data.
 *
 * Voice-friendly response: `open_slots` as HH:MM labels in Pakistan time
 * (Asia/Karachi), regardless of server timezone, so the agent can read
 * them straight to the caller. `slots` (ISO windows) kept for screens.
 */

import { NextRequest, NextResponse } from "next/server";
import { availabilityFor, VyberoStoreError } from "@/lib/server/vyberoStore";
import { agentKeyValid, resolveAgentClinic } from "@/lib/server/agentAuth";
import { getClinicConfig } from "@/lib/server/clinicStore";
import { getSession } from "@/lib/server/auth";
import { slotLabel } from "@/lib/server/clinicTime";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  // Either the voice agent (key + clinic) or a signed-in clinic screen.
  let clinicId: string | null = null;
  if (agentKeyValid(req)) {
    clinicId = await resolveAgentClinic(req, req.nextUrl.searchParams.get("clinic"));
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

  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "bad_request", message: "Pass ?date=YYYY-MM-DD." },
      { status: 400 }
    );
  }
  try {
    const config = await getClinicConfig(clinicId);
    const hours = config?.hours;
    const slots = await availabilityFor(clinicId, date, hours);
    const open_slots = slots.map((s) => slotLabel(s.start));
    return NextResponse.json({
      date,
      closed: slots.length === 0,
      open_slots,
      hours,
      slots,
    });
  } catch (err) {
    if (err instanceof VyberoStoreError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.code === "not_configured" ? 501 : 502 }
      );
    }
    console.error("[vybero/availability]", err);
    return NextResponse.json(
      { error: "store_error", message: "Could not compute availability." },
      { status: 502 }
    );
  }
}
