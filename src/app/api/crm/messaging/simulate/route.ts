/**
 * POST /api/crm/messaging/simulate - inject a fictional inbound message.
 *
 * This is the demo path for "a customer messages the clinic". It goes
 * through the SAME ingest function a real provider webhook would use, so
 * what the demo shows is the production code path with a local provider
 * behind it: contact matched or created, conversation opened, message
 * stored, unread raised, timeline written, all idempotent.
 *
 * Session-guarded and mock-provider-only. It refuses to run once a real
 * provider is live, so it can never be used to fake messages from a genuine
 * customer.
 */

import { NextResponse } from "next/server";
import {
  badRequest,
  crmError,
  readJson,
  requireCrm,
  crmWriteBranch,
  str,
} from "@/lib/server/crmApi";
import { ingestInbound, resolveProvider } from "@/lib/server/messaging";
import { handleInboundForBooking } from "@/lib/server/crmChatBooking";
import { isPlausiblePhone, normalizePhone } from "@/lib/crm/phone";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const ctx = await requireCrm(req, "view_conversations");

    const provider = resolveProvider();
    if (provider.id !== "mock") {
      return NextResponse.json(
        {
          error: "not_available",
          message:
            "A live messaging provider is connected; simulated inbound messages are disabled.",
        },
        { status: 409 }
      );
    }

    const body = await readJson<Record<string, unknown>>(req);
    if (!body) return badRequest("Invalid JSON body.");

    const from = str(body.from, { max: 40 });
    const text = str(body.body, { max: 2000 });
    if (!from || !isPlausiblePhone(from)) {
      return badRequest("A valid sender phone number is required.");
    }
    if (!text) return badRequest("A message body is required.");

    const result = await ingestInbound(
      ctx.clinicId,
      {
        // Stable id from the caller when given, so re-sending the same
        // simulated message demonstrates the idempotency guarantee.
        providerMessageId:
          str(body.provider_message_id, { max: 120 }) ??
          `sim_${normalizePhone(from)}_${Date.now()}`,
        from: normalizePhone(from),
        body: text,
        attachments: [],
        timestamp: new Date().toISOString(),
        contactName: str(body.name, { max: 120 }),
      },
      { branchId: crmWriteBranch(ctx, str(body.branch_id, { max: 64 })) }
    );

    // A patient asking to be seen gets answered here, not left for a human.
    // Best-effort: the message is already safely stored, so a booking
    // failure must not turn into a failed webhook and a redelivery storm.
    let booking = null;
    if (!result.duplicate) {
      try {
        booking = await handleInboundForBooking(
          ctx.clinicId,
          result.contact,
          result.conversation.id,
          text
        );
      } catch (err) {
        console.error("[crm] chat booking failed", err);
      }
    }

    return NextResponse.json({
      ok: true,
      booking,
      duplicate: result.duplicate,
      conversation_id: result.conversation.id,
      contact_id: result.contact.id,
      message_id: result.message.id,
    });
  } catch (err) {
    return crmError(err);
  }
}
