/**
 * The server-side perimeter. Protected clinic pages require a valid session
 * cookie; without one the request is redirected to the login screen before
 * any patient data is ever sent to the browser. API routes guard themselves
 * (they answer 401 JSON rather than redirect), and the public patient-facing
 * surfaces (report links, portal, assessment, faq) stay open by design.
 *
 * Edge runtime: this imports only session.ts (jose + Web Crypto), never
 * node:crypto or the database.
 */

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/server/session";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/patients",
  "/calendar",
  "/analytics",
  "/settings",
  "/consultations",
  "/discovery",
  "/visualize",
  "/pos",
  "/reviews",
  "/vybero",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (session) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/patients/:path*",
    "/calendar/:path*",
    "/analytics/:path*",
    "/settings/:path*",
    "/consultations/:path*",
    "/discovery/:path*",
    "/visualize/:path*",
    "/pos/:path*",
    "/reviews/:path*",
    "/vybero/:path*",
  ],
};
