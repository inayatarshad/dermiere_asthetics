/**
 * GET  /api/clinic - the caller's clinic config (any signed-in staff).
 * PUT  /api/clinic - update it (admin only). Branding, hours, treatment
 * menu, prices, voice-agent id, booking url, AI caps all live here and
 * persist to Postgres, so 5 clinics keep 5 different configs.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getClinicConfig, saveClinicConfig } from "@/lib/server/clinicStore";
import type { ClinicConfig } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const config = await getClinicConfig(session.cid);
  if (!config) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ config });
}

export async function PUT(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let patch: Partial<ClinicConfig>;
  try {
    patch = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const current = await getClinicConfig(session.cid);
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Only mutable fields; identity (id/slug/demo) is never client-editable.
  const next: ClinicConfig = {
    ...current,
    name: patch.name ?? current.name,
    city: patch.city ?? current.city,
    branding: { ...current.branding, ...(patch.branding ?? {}) },
    hours: { ...current.hours, ...(patch.hours ?? {}) },
    menu: patch.menu ?? current.menu,
    prices: patch.prices ?? current.prices,
    toxinPricePerUnit: patch.toxinPricePerUnit ?? current.toxinPricePerUnit,
    vyberoAgentId: patch.vyberoAgentId ?? current.vyberoAgentId,
    bookingUrl: patch.bookingUrl ?? current.bookingUrl,
    aiCaps: { ...current.aiCaps, ...(patch.aiCaps ?? {}) },
    locations: patch.locations ?? current.locations,
    taxRate:
      typeof patch.taxRate === "number" && patch.taxRate >= 0 && patch.taxRate <= 40
        ? patch.taxRate
        : current.taxRate,
    reviewIncentive: patch.reviewIncentive ?? current.reviewIncentive,
  };
  await saveClinicConfig(next);
  return NextResponse.json({ ok: true, config: next });
}
