/**
 * Admin invite management for the Brand Discovery Portal, scoped to the
 * signed-in clinic.
 *   POST - create an invite (returns token + shareable link)
 *   GET  - this clinic's invites joined with their responses (dashboard)
 *
 * Real auth: a valid session cookie is required, and every read/write is
 * scoped to that session's clinic_id - one clinic never sees another's BD
 * pipeline.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import {
  listInvites,
  listResponses,
  newToken,
  saveInvite,
  PortalStoreError,
  type PortalInvite,
} from "@/lib/server/portalStore";

export const maxDuration = 30;

function storeError(err: unknown) {
  if (err instanceof PortalStoreError) {
    return NextResponse.json(
      { error: err.code, message: err.message },
      { status: err.code === "not_configured" ? 501 : 502 }
    );
  }
  console.error("[portal/invites]", err);
  return NextResponse.json({ error: "store_error", message: "Portal storage failed." }, { status: 502 });
}

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const [invites, responses] = await Promise.all([
      listInvites(session.cid),
      listResponses(session.cid),
    ]);
    return NextResponse.json({ invites, responses });
  } catch (err) {
    return storeError(err);
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let body: Partial<PortalInvite>;
  try {
    body = (await req.json()) as Partial<PortalInvite>;
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const invite: PortalInvite = {
      id: crypto.randomUUID(),
      token: newToken(),
      clinicName: body.clinicName?.toString().slice(0, 120) || undefined,
      doctorName: body.doctorName?.toString().slice(0, 120) || undefined,
      city: body.city?.toString().slice(0, 120) || undefined,
      brandTheme:
        body.brandTheme && typeof body.brandTheme === "object"
          ? {
              primary: body.brandTheme.primary?.toString().slice(0, 24),
              brandName: body.brandTheme.brandName?.toString().slice(0, 60),
            }
          : undefined,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };
    await saveInvite(session.cid, invite);
    return NextResponse.json({ ok: true, invite });
  } catch (err) {
    return storeError(err);
  }
}
