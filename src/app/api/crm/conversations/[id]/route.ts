/**
 * /api/crm/conversations/[id]
 *
 *   GET    the thread (messages + contact), and mark it read
 *   POST   send a reply or add an internal note
 *   PATCH  assign it, change its status
 *
 * The route never talks to a messaging provider directly - it calls the
 * messaging service, which owns the provider boundary.
 */

import { NextResponse } from "next/server";
import {
  badRequest,
  crmError,
  oneOf,
  readJson,
  requireCrm,
  crmWriteBranch,
  requireCrmRowAccess,
  str,
} from "@/lib/server/crmApi";
import {
  addActivity,
  getContact,
  getConversation,
  saveConversation,
} from "@/lib/server/crmStore";
import {
  OptedOutError,
  conversationMessages,
  markConversationRead,
  sendReply,
} from "@/lib/server/messaging";
import { crmCan } from "@/lib/crm/permissions";
import { AuthError } from "@/lib/server/auth";
import { CONVERSATION_STATUSES } from "@/lib/crm/types";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireCrm(req, "view_conversations");
    const { id } = await params;
    const conversation = await getConversation(ctx.clinicId, id);
    if (!conversation) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    requireCrmRowAccess(ctx, conversation);
    const [messages, contact] = await Promise.all([
      conversationMessages(ctx.clinicId, id),
      getContact(ctx.clinicId, conversation.contact_id),
    ]);
    // Opening the thread is what "read" means.
    await markConversationRead(ctx.clinicId, id);

    return NextResponse.json({
      ok: true,
      conversation: { ...conversation, unread_count: 0 },
      messages,
      contact,
    });
  } catch (err) {
    return crmError(err);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireCrm(req, "view_conversations");
    const { id } = await params;
    const body = await readJson<Record<string, unknown>>(req);
    if (!body) return badRequest("Invalid JSON body.");

    const text = str(body.body, { max: 4000 });
    if (!text) return badRequest("A message is required.");
    const internal = body.internal === true;
    const conversation = await getConversation(ctx.clinicId, id);
    if (!conversation) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    requireCrmRowAccess(ctx, conversation);

    // An internal note is a CRM annotation; sending to the patient is not.
    if (!internal && !crmCan(ctx.role, "send_messages")) {
      throw new AuthError(403, "Your role cannot send messages to patients.");
    }

    const message = await sendReply(ctx.clinicId, id, {
      body: text,
      authorId: ctx.userId,
      internal,
      templateId: str(body.template_id, { max: 64 }),
      idempotencyKey: str(body.idempotency_key, { max: 100 }),
    });
    return NextResponse.json({ ok: true, message });
  } catch (err) {
    if (err instanceof OptedOutError) {
      return NextResponse.json(
        { error: "opted_out", message: err.message },
        { status: 409 }
      );
    }
    return crmError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireCrm(req, "view_conversations");
    const { id } = await params;
    const body = await readJson<Record<string, unknown>>(req);
    if (!body) return badRequest("Invalid JSON body.");

    const conversation = await getConversation(ctx.clinicId, id);
    if (!conversation) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    requireCrmRowAccess(ctx, conversation);

    const assignedTo =
      body.assigned_to !== undefined
        ? str(body.assigned_to, { max: 64 }) ?? undefined
        : conversation.assigned_to;

    if (
      body.assigned_to !== undefined &&
      assignedTo !== conversation.assigned_to &&
      !crmCan(ctx.role, "assign_conversations") &&
      assignedTo !== ctx.userId // claiming it yourself is always allowed
    ) {
      throw new AuthError(403, "Your role cannot assign conversations to others.");
    }

    const updated = await saveConversation({
      ...conversation,
      assigned_to: assignedTo,
      status:
        oneOf(body.status, CONVERSATION_STATUSES) ?? conversation.status,
      branch_id: crmWriteBranch(
        ctx,
        body.branch_id !== undefined
          ? str(body.branch_id, { max: 64 })
          : undefined,
        conversation.branch_id
      ),
    });

    if (body.assigned_to !== undefined && assignedTo !== conversation.assigned_to) {
      await addActivity({
        clinic_id: ctx.clinicId,
        contact_id: conversation.contact_id,
        kind: "conversation_assigned",
        summary: assignedTo ? "Conversation assigned" : "Conversation unassigned",
        actor_id: ctx.userId,
        branch_id: updated.branch_id,
        ref_id: id,
      });
    }

    return NextResponse.json({ ok: true, conversation: updated });
  } catch (err) {
    return crmError(err);
  }
}
