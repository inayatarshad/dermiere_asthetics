/**
 * /api/crm/messaging/webhook - the provider webhook endpoint.
 *
 * This is the shape Meta's WhatsApp Cloud API expects: a GET handshake that
 * echoes hub.challenge, and a POST carrying inbound messages and status
 * receipts, signed in a header.
 *
 * It is WIRED but INERT: the active provider is the local mock, which has no
 * signing secret and no subscription, so nothing real can reach here. The
 * endpoint exists so that connecting Meta later is a configuration change
 * plus one provider implementation - not new routing, new parsing and new
 * ingestion logic written under time pressure.
 *
 * When a real provider is connected, `verifySignature` becomes an HMAC check
 * against the raw body and unsigned requests are rejected. Until then this
 * route only accepts traffic in development.
 */

import { NextResponse } from "next/server";
import { applyStatus, ingestInbound, resolveProvider } from "@/lib/server/messaging";
import { handleInboundForBooking } from "@/lib/server/crmChatBooking";
import { pgGetClinicBySlug } from "@/lib/server/db";

export const runtime = "nodejs";

/** The mock provider has no real subscription; keep it out of production. */
function webhookEnabled(): boolean {
  const provider = resolveProvider();
  if (provider.id !== "mock") return true;
  return process.env.NODE_ENV !== "production";
}

export async function GET(req: Request) {
  if (!webhookEnabled()) {
    return NextResponse.json({ error: "not_configured" }, { status: 404 });
  }
  const url = new URL(req.url);
  const result = resolveProvider().verifyWebhook({
    mode: url.searchParams.get("hub.mode") ?? undefined,
    token: url.searchParams.get("hub.verify_token") ?? undefined,
    challenge: url.searchParams.get("hub.challenge") ?? undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "verification_failed" }, { status: 403 });
  }
  return new NextResponse(result.challenge ?? "", { status: 200 });
}

export async function POST(req: Request) {
  if (!webhookEnabled()) {
    return NextResponse.json({ error: "not_configured" }, { status: 404 });
  }
  const provider = resolveProvider();
  const raw = await req.text();

  if (!provider.verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // A webhook carries no session, so the clinic must be identified by the
  // payload. Today that is the slug; a real provider maps its phone-number
  // id to a clinic instead.
  const slug =
    (parsed as { clinic_slug?: string })?.clinic_slug ?? "dermiere";
  const clinic = await pgGetClinicBySlug(slug);
  if (!clinic) {
    // 200 on an unknown tenant: providers retry non-2xx forever, and a
    // retry will not make the clinic exist.
    return NextResponse.json({ ok: true, ignored: "unknown_clinic" });
  }

  const { messages, statuses } = provider.parseWebhook(parsed);
  let ingested = 0;
  let duplicates = 0;

  for (const m of messages) {
    const result = await ingestInbound(clinic.id, m);
    if (result.duplicate) duplicates++;
    else {
      ingested++;
      // Answer a booking request as it arrives. Wrapped because a webhook
      // that throws gets redelivered, and the message is already stored.
      try {
        await handleInboundForBooking(
          clinic.id,
          result.contact,
          result.conversation.id,
          m.body
        );
      } catch (err) {
        console.error("[crm] chat booking failed", err);
      }
    }
  }
  for (const s of statuses) {
    await applyStatus(clinic.id, s);
  }

  // Always 2xx once the payload is understood - anything else makes the
  // provider redeliver, and redelivery is exactly what idempotency is for.
  return NextResponse.json({
    ok: true,
    ingested,
    duplicates,
    statuses: statuses.length,
  });
}
