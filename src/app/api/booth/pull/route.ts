/**
 * GET /api/booth/pull (T1) — the desktop side of the booth handoff.
 * Returns all live inbox items (expired ones are lazily purged by the
 * store). The client keeps its own merged-ids list, so this is a simple
 * idempotent snapshot, safe to poll.
 */

import { NextResponse } from "next/server";
import { listBoothItems, BoothStoreError } from "@/lib/server/boothStore";

export const maxDuration = 30;

export async function GET() {
  try {
    const items = await listBoothItems();
    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof BoothStoreError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.code === "not_configured" ? 501 : 502 }
      );
    }
    console.error("[booth/pull]", err);
    return NextResponse.json(
      { error: "store_error", message: "Could not read the booth inbox." },
      { status: 502 }
    );
  }
}
