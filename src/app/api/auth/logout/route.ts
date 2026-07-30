/** POST /api/auth/logout - clear the session cookie. */

import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  await clearSessionCookie(res);
  return res;
}
