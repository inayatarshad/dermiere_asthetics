/**
 * POST /api/portal/[token]/submit — the doctor's answers.
 * Server-side validation is the source of truth (spec §10): consent must
 * be true, honeypot must be empty, enums are whitelisted, rate-limited
 * per IP. Saving flips the invite to COMPLETED and optionally pings H
 * (SLACK_WEBHOOK_URL env).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getInviteByToken,
  rateLimited,
  saveInvite,
  saveResponse,
  PortalStoreError,
  type PortalResponse,
} from "@/lib/server/portalStore";

export const maxDuration = 30;

const PATIENTS = new Set(["1-5", "6-10", "11-20", "20+"]);
const BUDGETS = new Set(["none", "under_50k", "50_150k", "over_150k"]);
const BOOKING = new Set(["phone_calls", "instagram_dms", "walk_ins", "front_desk"]);
const PAINS = new Set(["missed_calls", "no_shows", "front_desk_load", "new_patients"]);
const INTERESTS = new Set(["vybero", "contour_3d", "ai_report", "website_branding", "chorus_ugc"]);

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const cleanArr = (v: unknown, allowed: Set<string>) =>
  Array.isArray(v)
    ? [...new Set(v.filter((x) => typeof x === "string" && allowed.has(x)))]
    : [];

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/portal/[token]/submit">
) {
  const { token } = await ctx.params;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many attempts. Try again in a minute." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  // honeypot: real doctors never fill this hidden field
  if (clean(body.website_hp, 10) !== "") {
    return NextResponse.json({ ok: true }); // silently drop bots
  }

  const clinicName = clean(body.clinicName, 120);
  const doctorName = clean(body.doctorName, 120);
  if (!clinicName || !doctorName) {
    return NextResponse.json(
      { error: "bad_request", message: "Clinic name and doctor name are required." },
      { status: 400 }
    );
  }
  if (body.consent !== true) {
    return NextResponse.json(
      { error: "bad_request", message: "Consent is required to submit." },
      { status: 400 }
    );
  }

  try {
    const found = await getInviteByToken(token);
    if (!found) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const { clinicId, invite } = found;
    if (invite.status === "COMPLETED") {
      return NextResponse.json(
        { error: "already_completed", message: "Thanks, already received." },
        { status: 409 }
      );
    }

    const patientsPerDay = clean(body.patientsPerDay, 10);
    const monthlyBudget = clean(body.monthlyBudget, 12);
    const response: PortalResponse = {
      id: crypto.randomUUID(),
      inviteId: invite.id,
      token: invite.token,
      clinicName,
      doctorName,
      cityArea: clean(body.cityArea, 120) || undefined,
      whatsapp: clean(body.whatsapp, 40) || undefined,
      instagram: clean(body.instagram, 80) || undefined,
      website: clean(body.website, 200) || undefined,
      patientsPerDay: PATIENTS.has(patientsPerDay) ? patientsPerDay : undefined,
      monthlyBudget: BUDGETS.has(monthlyBudget) ? monthlyBudget : undefined,
      bookingMethods: cleanArr(body.bookingMethods, BOOKING),
      painPoints: cleanArr(body.painPoints, PAINS),
      interests: cleanArr(body.interests, INTERESTS),
      servicesInDemand: clean(body.servicesInDemand, 1000) || undefined,
      helpNotes: clean(body.helpNotes, 1000) || undefined,
      consent: true,
      createdAt: new Date().toISOString(),
    };
    await saveResponse(clinicId, response);
    invite.status = "COMPLETED";
    invite.completedAt = new Date().toISOString();
    // keep the invite's prefill in sync with what the doctor confirmed
    invite.clinicName = clinicName;
    invite.doctorName = doctorName;
    await saveInvite(clinicId, invite);

    // optional ping to H — fire and forget
    const hook = process.env.SLACK_WEBHOOK_URL;
    if (hook) {
      void fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `Brand discovery form completed: ${doctorName} (${clinicName})${
            response.cityArea ? `, ${response.cityArea}` : ""
          }. Interests: ${response.interests.join(", ") || "none picked"}.`,
        }),
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PortalStoreError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.code === "not_configured" ? 501 : 502 }
      );
    }
    console.error("[portal/submit]", err);
    return NextResponse.json(
      { error: "store_error", message: "Could not save your answers." },
      { status: 502 }
    );
  }
}
