/**
 * Admin invite management for the Brand Discovery Portal.
 *   POST — create an invite, returns the token + shareable link
 *   GET  — invites joined with their responses (the Discovery dashboard)
 *
 * Demo-grade auth: same-origin browser calls only (the admin pages are
 * role-gated client-side; real accounts arrive with the Postgres step).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listInvites,
  listResponses,
  newToken,
  saveInvite,
  PortalStoreError,
  type PortalInvite,
} from "@/lib/server/portalStore";

export const maxDuration = 30;

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin") ?? req.headers.get("referer");
  if (!origin) return false;
  try {
    return new URL(origin).host === req.nextUrl.host;
  } catch {
    return false;
  }
}

function storeError(err: unknown) {
  if (err instanceof PortalStoreError) {
    return NextResponse.json(
      { error: err.code, message: err.message },
      { status: err.code === "not_configured" ? 501 : 502 }
    );
  }
  console.error("[portal/invites]", err);
  return NextResponse.json(
    { error: "store_error", message: "Portal storage failed." },
    { status: 502 }
  );
}

export async function GET(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const [invites, responses] = await Promise.all([
      listInvites(),
      listResponses(),
    ]);
    return NextResponse.json({ invites, responses });
  } catch (err) {
    return storeError(err);
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: Partial<PortalInvite>;
  try {
    body = (await req.json()) as Partial<PortalInvite>;
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Invalid JSON body." },
      { status: 400 }
    );
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
    await saveInvite(invite);
    return NextResponse.json({ ok: true, invite });
  } catch (err) {
    return storeError(err);
  }
}
