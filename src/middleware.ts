/**
 * The server-side perimeter. Protected pages require a valid session cookie;
 * without one the request is redirected to the login screen before any
 * patient data is ever sent to the browser. API routes guard themselves
 * (they answer 401 JSON rather than redirect), and the public patient-facing
 * surfaces (report links, portal, assessment, faq) stay open by design.
 *
 * It also enforces the workspace boundary. A CRM account is scoped to the
 * CRM workspace: asking for /dashboard or /pos redirects it to /crm rather
 * than rendering a Clinic OS screen its navigation does not offer. That
 * decision is made HERE, from the signed token - omitting the links from the
 * navigation is presentation, not a control.
 *
 * Edge runtime: this imports only session.ts (jose + Web Crypto), never
 * node:crypto or the database.
 */

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/server/session";

/** Clinic OS surfaces - a CRM-workspace login has no business here. */
const CLINIC_PREFIXES = [
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

/** The CRM workspace. Any role may reach it; each route checks capability. */
const CRM_PREFIX = "/crm";

const matches = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isClinic = CLINIC_PREFIXES.some((p) => matches(pathname, p));
  const isCrm = matches(pathname, CRM_PREFIX);
  if (!isClinic && !isCrm) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // A CRM account never renders a Clinic OS page.
  if (session.ws === "crm" && isClinic) {
    const url = req.nextUrl.clone();
    url.pathname = CRM_PREFIX;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
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
    "/crm",
    "/crm/:path*",
  ],
};
