/**
 * DELETE /api/booth/:id (T1 privacy) - removes a booth inbox item and its
 * photos. Scoped to the caller's clinic, so a clinic can only delete its own
 * booth items. Items also auto-expire after 24h regardless.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { deleteBoothItem, BoothStoreError } from "@/lib/server/boothStore";

export const maxDuration = 30;

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/booth/[id]">
) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!/^[a-z0-9-]{8,64}$/i.test(id)) {
    return NextResponse.json({ error: "bad_request", message: "Invalid booth id." }, { status: 400 });
  }
  try {
    await deleteBoothItem(session.cid, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof BoothStoreError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.code === "not_configured" ? 501 : 502 }
      );
    }
    console.error("[booth/delete]", err);
    return NextResponse.json({ error: "store_error", message: "Could not delete the booth item." }, { status: 502 });
  }
}
