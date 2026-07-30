/**
 * POST /api/admin/dermiere - provision the Dermiere development clinic and
 * its fictional CRM data.
 *
 * Superuser operation, guarded exactly like /api/admin/provision: the
 * platform key when one is configured, otherwise dev-only. It is additive -
 * it creates what is missing and refreshes the deterministic seed rows in
 * place. By default it never drops, truncates or resets anything.
 *
 * `reconcile: true` additionally removes rows THIS generator created in an
 * earlier run that the current seed no longer contains, matched by the
 * generator's own id prefixes. It is opt-in, and it cannot touch a row that
 * was not generated here.
 *
 * Body: { password, withSeed?, reconcile? }
 */

import { NextRequest, NextResponse } from "next/server";
import { provisionDermiere } from "@/lib/server/dermiereProvision";

export const runtime = "nodejs";

function platformAuthorized(req: NextRequest): boolean {
  const configured = process.env.PLATFORM_ADMIN_KEY;
  if (!configured) {
    return process.env.NODE_ENV !== "production" || !process.env.VERCEL;
  }
  return req.headers.get("x-platform-key") === configured;
}

export async function POST(req: NextRequest) {
  if (!platformAuthorized(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: { password?: string; withSeed?: boolean; reconcile?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!body.password || body.password.length < 8) {
    return NextResponse.json(
      { error: "bad_request", message: "password (8+ chars) is required." },
      { status: 400 }
    );
  }
  try {
    const result = await provisionDermiere(body.password, {
      withSeed: body.withSeed ?? true,
      // Opt-in only. Without it this call never deletes anything.
      reconcile: body.reconcile === true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        error: "provision_failed",
        message: err instanceof Error ? err.message : "Provisioning failed.",
      },
      { status: 500 }
    );
  }
}
