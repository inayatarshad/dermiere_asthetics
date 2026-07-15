/**
 * GET /api/portal/[token] — public invite lookup for the doctor's form.
 * A valid first open flips PENDING -> OPENED. The token is the capability
 * (crypto-random, unguessable); the write is scoped to the invite's owning
 * clinic. Unknown tokens 404 so links stay opaque.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getInviteByToken,
  saveInvite,
  PortalStoreError,
} from "@/lib/server/portalStore";

export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/portal/[token]">
) {
  const { token } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const found = await getInviteByToken(token);
    if (!found) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const { clinicId, invite } = found;
    if (invite.status === "PENDING") {
      invite.status = "OPENED";
      invite.openedAt = new Date().toISOString();
      await saveInvite(clinicId, invite);
    }
    return NextResponse.json({
      clinicName: invite.clinicName ?? "",
      doctorName: invite.doctorName ?? "",
      city: invite.city ?? "",
      brandTheme: invite.brandTheme ?? null,
      completed: invite.status === "COMPLETED",
    });
  } catch (err) {
    if (err instanceof PortalStoreError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.code === "not_configured" ? 501 : 502 }
      );
    }
    console.error("[portal/token]", err);
    return NextResponse.json({ error: "store_error" }, { status: 502 });
  }
}
