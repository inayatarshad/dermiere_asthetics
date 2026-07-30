/**
 * POST /api/crm/automation/run - send every automated follow-up that is due.
 *
 * Called two ways:
 *   - by the CRM itself whenever the follow-ups screen loads, so the board
 *     is already settled by the time anyone looks at it;
 *   - by a scheduler (Vercel cron) in deployment, so it happens whether or
 *     not a browser is open.
 *
 * Idempotent, so both callers racing is harmless.
 */

import { NextResponse } from "next/server";
import { crmError, requireCrm } from "@/lib/server/crmApi";
import { runDueAutomations } from "@/lib/server/crmAutomation";
import { getClinicConfig } from "@/lib/server/clinicStore";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // Anyone who can work the follow-up board can trigger the run; it only
    // ever does what the board would have done on its own.
    const ctx = await requireCrm(req, "manage_followups");
    const config = await getClinicConfig(ctx.clinicId);
    const result = await runDueAutomations(ctx.clinicId, {
      clinicName: config?.name ?? "Dermiere",
      actorId: ctx.userId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return crmError(err);
  }
}
