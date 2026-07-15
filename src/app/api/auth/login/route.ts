/**
 * POST /api/auth/login — verify credentials server-side, set the signed
 * session cookie, and return the clinic-scoped bootstrap payload so the
 * client can render immediately. On an empty database this first seeds the
 * demo clinic, so the deployment is usable with no manual setup.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticate, ensureSeedClinic } from "@/lib/server/clinicStore";
import { attachSessionCookie } from "@/lib/server/auth";
import { buildBootstrap } from "@/lib/server/bootstrap";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const email = (body.email ?? "").trim();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json(
      { error: "bad_request", message: "Email and password are required." },
      { status: 400 }
    );
  }

  try {
    await ensureSeedClinic();
    const result = await authenticate(email, password);
    if (!result) {
      return NextResponse.json(
        { error: "invalid_credentials", message: "Those credentials did not match." },
        { status: 401 }
      );
    }
    const bootstrap = await buildBootstrap(result.user.clinic_id, result.user.id);
    const res = NextResponse.json({ ok: true, bootstrap });
    await attachSessionCookie(res, {
      cid: result.user.clinic_id,
      uid: result.user.id,
      role: result.user.role,
      email: result.user.email,
    });
    return res;
  } catch (err) {
    console.error("[auth/login]", err);
    return NextResponse.json(
      { error: "server_error", message: "Login failed. Please try again." },
      { status: 500 }
    );
  }
}
