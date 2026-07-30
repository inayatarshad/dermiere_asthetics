/**
 * GET /api/vybero/time - current date/day/time in Pakistan (Asia/Karachi).
 *
 * The ElevenLabs agent's "get_current_time" webhook tool: agents don't
 * know today's date, so "tomorrow" / "Saturday" can't be resolved without
 * this. Public by design - it returns the wall clock and nothing else.
 */

import { NextResponse } from "next/server";
import { clinicNow } from "@/lib/server/clinicTime";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(clinicNow());
}
