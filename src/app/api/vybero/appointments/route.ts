/**
 * GET /api/vybero/appointments[?from=YYYY-MM-DD&to=YYYY-MM-DD]
 *
 * The shared appointment book (VYBERO bookings + clinic bookings that
 * were pushed up). Clinic screens poll this to merge into their local
 * store; the agent may read it to answer "when is my appointment?".
 */

import { NextRequest, NextResponse } from "next/server";
import { listAppointments, VyberoStoreError } from "@/lib/server/vyberoStore";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  try {
    let items = await listAppointments();
    if (from) items = items.filter((a) => a.start.slice(0, 10) >= from);
    if (to) items = items.filter((a) => a.start.slice(0, 10) <= to);
    return NextResponse.json({ appointments: items });
  } catch (err) {
    if (err instanceof VyberoStoreError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.code === "not_configured" ? 501 : 502 }
      );
    }
    console.error("[vybero/appointments]", err);
    return NextResponse.json(
      { error: "store_error", message: "Could not list appointments." },
      { status: 502 }
    );
  }
}
