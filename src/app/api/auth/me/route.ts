/**
 * GET /api/auth/me - re-hydrate the current session's clinic-scoped
 * bootstrap (used on app mount / tab focus). 401 when unauthenticated so
 * the client redirects to login.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { buildBootstrap } from "@/lib/server/bootstrap";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  try {
    const bootstrap = await buildBootstrap(session.cid, session.uid);
    if (!bootstrap) {
      return NextResponse.json({ error: "clinic_missing" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, bootstrap });
  } catch (err) {
    console.error("[auth/me]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
