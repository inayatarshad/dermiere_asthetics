/**
 * GET /api/vybero/appointments[?from=YYYY-MM-DD&to=YYYY-MM-DD]
 *
 * The signed-in clinic's appointment book (VYBERO + front-desk bookings).
 * Clinic screens poll this to merge into their local store. Session-scoped:
 * returns ONLY the caller's clinic's appointments.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { listAppointments, VyberoStoreError } from "@/lib/server/vyberoStore";
import { sessionBranchId } from "@/lib/server/branchAccess";
import { getClinicConfig } from "@/lib/server/clinicStore";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  try {
    const [branchId, config] = await Promise.all([
      sessionBranchId(session),
      getClinicConfig(session.cid),
    ]);
    const configuredLocationIds = new Set(
      (config?.locations ?? []).map((location) => location.id)
    );
    let items = await listAppointments(session.cid);
    items = items.filter(
      (item) => !!item.location_id && configuredLocationIds.has(item.location_id)
    );
    if (branchId) items = items.filter((item) => item.location_id === branchId);
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
