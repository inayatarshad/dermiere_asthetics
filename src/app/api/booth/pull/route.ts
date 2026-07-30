/**
 * GET /api/booth/pull (T1) - the desktop side of the booth handoff. Returns
 * the signed-in clinic's live inbox items only (expired ones are purged by
 * the store). Session-scoped: never another clinic's patients.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { listBoothItems, BoothStoreError } from "@/lib/server/boothStore";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  try {
    const items = await listBoothItems(session.cid);
    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof BoothStoreError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.code === "not_configured" ? 501 : 502 }
      );
    }
    console.error("[booth/pull]", err);
    return NextResponse.json({ error: "store_error", message: "Could not read the booth inbox." }, { status: 502 });
  }
}
