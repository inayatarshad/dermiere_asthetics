/**
 * POST /api/admin/provision — platform-level clinic provisioning.
 *
 * Creates a fresh, clean clinic (no demo data) with one admin login.
 * Guarded by the platform key (x-platform-key header === PLATFORM_ADMIN_KEY),
 * NOT by a clinic session — this is a superuser operation. In dev, when no
 * key is configured, it is allowed so the flow is testable offline.
 *
 * Body: { name, slug, city?, adminName, adminEmail, adminPassword, demo? }
 * The scripts/provision-clinic.mjs helper wraps this for one-command setup.
 */

import { NextRequest, NextResponse } from "next/server";
import { provisionClinic } from "@/lib/server/clinicStore";

export const runtime = "nodejs";

function platformAuthorized(req: NextRequest): boolean {
  const configured = process.env.PLATFORM_ADMIN_KEY;
  if (!configured) {
    // no key set → allow only outside production
    return process.env.NODE_ENV !== "production" || !process.env.VERCEL;
  }
  return req.headers.get("x-platform-key") === configured;
}

export async function POST(req: NextRequest) {
  if (!platformAuthorized(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: {
    name?: string;
    slug?: string;
    city?: string;
    adminName?: string;
    adminEmail?: string;
    adminPassword?: string;
    demo?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const { name, slug, adminName, adminEmail, adminPassword } = body;
  if (!name || !slug || !adminName || !adminEmail || !adminPassword) {
    return NextResponse.json(
      { error: "bad_request", message: "name, slug, adminName, adminEmail, adminPassword are required." },
      { status: 400 }
    );
  }
  if (adminPassword.length < 8) {
    return NextResponse.json(
      { error: "bad_request", message: "adminPassword must be at least 8 characters." },
      { status: 400 }
    );
  }
  try {
    const config = await provisionClinic({
      name,
      slug,
      city: body.city,
      adminName,
      adminEmail,
      adminPassword,
      demo: body.demo ?? false,
    });
    return NextResponse.json({
      ok: true,
      clinic: { id: config.id, slug: config.slug, name: config.name },
      login: { email: adminEmail.toLowerCase() },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "conflict", message: err instanceof Error ? err.message : "Provisioning failed." },
      { status: 409 }
    );
  }
}
