/**
 * GET /api/vybero/availability?date=YYYY-MM-DD
 *
 * Free bookable slots for a date (clinic hours minus active appointments).
 * This is what the VYBERO voice agent reads before offering times to a
 * caller. Exposes only free/busy — no patient data.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  availabilityFor,
  clinicHours,
  VyberoStoreError,
} from "@/lib/server/vyberoStore";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "bad_request", message: "Pass ?date=YYYY-MM-DD." },
      { status: 400 }
    );
  }
  try {
    const slots = await availabilityFor(date);
    return NextResponse.json({ date, hours: clinicHours(), slots });
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
