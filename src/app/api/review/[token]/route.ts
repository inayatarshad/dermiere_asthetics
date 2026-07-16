/**
 * GET /api/review/[token] — public meta for the branded review page.
 * The token is the capability. First open flips PENDING → OPENED.
 * Returns display data only — never phone numbers or clinical details.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getInviteByToken,
  saveInvite,
  ReviewStoreError,
} from "@/lib/server/reviewStore";
import { getClinicConfig } from "@/lib/server/clinicStore";
import { findTreatment, CAPTURE_LOCATIONS } from "@/lib/capture/kb";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const hit = await getInviteByToken(token);
    if (!hit) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const { clinicId, invite } = hit;

    if (invite.status === "PENDING") {
      invite.status = "OPENED";
      invite.opened_at = new Date().toISOString();
      await saveInvite(clinicId, invite);
    }

    const config = await getClinicConfig(clinicId);
    const location =
      config?.locations?.find((l) => l.id === invite.location_id) ??
      CAPTURE_LOCATIONS.find((l) => l.id === invite.location_id);

    return NextResponse.json({
      ok: true,
      firstName: invite.patient_name.split(" ")[0],
      treatments: invite.treatments.map(
        (t) => findTreatment(t)?.name ?? t.replace(/-/g, " ")
      ),
      locationName: location?.name ?? config?.name ?? "CAPTURE",
      clinicName: config?.name ?? "CAPTURE",
      completed: invite.status === "COMPLETED",
      incentive: config?.reviewIncentive ?? {
        kind: "discount",
        value: 10,
        validityDays: 60,
      },
    });
  } catch (err) {
    if (err instanceof ReviewStoreError) {
      return NextResponse.json({ error: err.code }, { status: 501 });
    }
    console.error("[review GET]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
