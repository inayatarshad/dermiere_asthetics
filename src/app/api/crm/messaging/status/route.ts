/**
 * GET /api/crm/messaging/status - which messaging channel is behind the CRM.
 *
 * The top bar needs to say whether WhatsApp is connected, and it needs to
 * say so on every CRM screen, not only the Inbox. Pulling the whole
 * conversation list to read one boolean would be wasteful, so this returns
 * just the provider summary the UI is allowed to see.
 *
 * Session-guarded like every other CRM route: the channel a clinic uses is
 * not public information.
 */

import { NextResponse } from "next/server";
import { crmError, requireCrm } from "@/lib/server/crmApi";
import { providerStatus } from "@/lib/server/messaging";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requireCrm(req, "view_crm");
    return NextResponse.json({ ok: true, provider: providerStatus() });
  } catch (e) {
    return crmError(e);
  }
}
