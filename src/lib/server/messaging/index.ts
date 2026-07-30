/**
 * Messaging service - the only thing CRM code talks to.
 *
 * Responsibilities that belong HERE rather than in a route or a screen:
 *  - resolve the active provider (mock today, Meta later),
 *  - match or create the contact an inbound message belongs to,
 *  - open or reuse the contact's conversation,
 *  - write messages idempotently (a redelivered webhook changes nothing),
 *  - move messages through their delivery states,
 *  - refuse to message anyone who has opted out.
 *
 * The real WhatsApp provider stays disabled until Meta credentials exist.
 * `resolveProvider()` is the single switch; nothing else in the codebase
 * needs to know which provider answered.
 */

import type {
  CrmContact,
  CrmConversation,
  CrmMessage,
  MessageState,
} from "@/lib/crm/types";
import { normalizePhone } from "@/lib/crm/phone";
import {
  addActivity,
  findContactByPhone,
  findMessageByProviderId,
  findOpenConversation,
  getContact,
  getConversation,
  listMessages,
  newId,
  saveContact,
  saveConversation,
  saveMessage,
} from "../crmStore";
import { mockProvider } from "./mockProvider";
import type { InboundMessage, MessagingProvider, StatusUpdate } from "./provider";

export type { MessagingProvider } from "./provider";

/**
 * Which provider is live.
 *
 * The Meta WhatsApp Cloud provider is intentionally NOT implemented yet and
 * no placeholder credentials exist. When it is added, it goes here behind a
 * real-credentials check - absent credentials must keep falling through to
 * the mock rather than half-configuring a live channel.
 */
export function resolveProvider(): MessagingProvider {
  return mockProvider;
}

/** What the UI is allowed to know about the messaging backend. */
export function providerStatus() {
  const p = resolveProvider();
  return {
    id: p.id,
    label: p.label,
    configured: p.configured,
    live: p.id !== "mock",
  };
}

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------
// Inbound
// ---------------------------------------------------------------------

export interface IngestResult {
  contact: CrmContact;
  conversation: CrmConversation;
  message: CrmMessage;
  /** True when this exact provider message had already been stored. */
  duplicate: boolean;
}

/**
 * Ingest one inbound message.
 *
 * Idempotent on `providerMessageId`: providers redeliver webhooks, and a
 * redelivery must not create a second message, a second conversation, or a
 * second unread badge. The duplicate check runs before anything is written.
 */
export async function ingestInbound(
  clinicId: string,
  inbound: InboundMessage,
  opts: { branchId?: string; providerId?: string } = {}
): Promise<IngestResult> {
  const provider = opts.providerId ?? resolveProvider().id;

  const existing = await findMessageByProviderId(
    clinicId,
    provider,
    inbound.providerMessageId
  );
  if (existing) {
    const conv = await getConversation(clinicId, existing.conversation_id);
    const contact = conv ? await findContactByPhone(clinicId, inbound.from) : null;
    if (conv && contact) {
      return { contact, conversation: conv, message: existing, duplicate: true };
    }
  }

  // --- match or create the contact -------------------------------------
  const phone = normalizePhone(inbound.from);
  let contact = await findContactByPhone(clinicId, phone);
  if (!contact) {
    contact = await saveContact({
      id: newId(),
      clinic_id: clinicId,
      name: inbound.contactName?.trim() || `WhatsApp ${phone.slice(-4)}`,
      phone,
      phone_norm: phone,
      stage: "new",
      source: "whatsapp",
      treatment_interest: [],
      branch_id: opts.branchId,
      tags: [],
      marketing_opt_in: false,
      created_at: inbound.timestamp,
      updated_at: inbound.timestamp,
    });
    await addActivity({
      clinic_id: clinicId,
      contact_id: contact.id,
      kind: "lead_created",
      summary: "Lead captured from an inbound WhatsApp message",
      branch_id: contact.branch_id,
      ref_id: contact.id,
      created_at: inbound.timestamp,
    });
  }

  // --- open or reuse the conversation ----------------------------------
  let conversation = await findOpenConversation(clinicId, contact.id, "whatsapp");
  if (!conversation) {
    conversation = await saveConversation({
      id: newId(),
      clinic_id: clinicId,
      contact_id: contact.id,
      channel: "whatsapp",
      status: "open",
      assigned_to: contact.assigned_to,
      branch_id: contact.branch_id ?? opts.branchId,
      last_message_at: inbound.timestamp,
      last_message_preview: inbound.body.slice(0, 90),
      unread_count: 0,
      created_at: inbound.timestamp,
      updated_at: inbound.timestamp,
    });
  }

  const message: CrmMessage = {
    id: newId(),
    clinic_id: clinicId,
    conversation_id: conversation.id,
    direction: "inbound",
    internal: false,
    body: inbound.body,
    attachments: inbound.attachments ?? [],
    state: "delivered",
    provider,
    provider_message_id: inbound.providerMessageId,
    created_at: inbound.timestamp,
    delivered_at: inbound.timestamp,
  };
  await saveMessage(message);

  conversation = await saveConversation({
    ...conversation,
    status: conversation.status === "closed" ? "open" : conversation.status,
    last_message_at: inbound.timestamp,
    last_message_preview: inbound.body.slice(0, 90),
    unread_count: conversation.unread_count + 1,
  });

  await addActivity({
    clinic_id: clinicId,
    contact_id: contact.id,
    patient_id: contact.patient_id,
    kind: "message_in",
    summary: "Message received on WhatsApp",
    detail: inbound.body.slice(0, 140),
    branch_id: conversation.branch_id,
    ref_id: message.id,
    created_at: inbound.timestamp,
  });

  return { contact, conversation, message, duplicate: false };
}

// ---------------------------------------------------------------------
// Outbound
// ---------------------------------------------------------------------

export class OptedOutError extends Error {}

/**
 * Send a reply on a conversation.
 *
 * Internal notes never reach the provider - they are staff-only and are
 * written straight to storage.
 */
export async function sendReply(
  clinicId: string,
  conversationId: string,
  input: {
    body: string;
    authorId: string;
    internal?: boolean;
    templateId?: string;
    /** Reuse across retries so a double-click cannot double-send. */
    idempotencyKey?: string;
  }
): Promise<CrmMessage> {
  const conversation = await getConversation(clinicId, conversationId);
  if (!conversation) throw new Error("Conversation not found.");

  const contact = await getContact(clinicId, conversation.contact_id);
  if (!contact) throw new Error("Conversation has no contact.");

  const internal = !!input.internal;

  // Consent is enforced here, not in the UI: a patient who opted out must
  // not receive a message however the send was triggered.
  if (!internal && contact.opted_out_at) {
    throw new OptedOutError(
      `${contact.name} has opted out of messages and cannot be contacted.`
    );
  }

  const created = nowIso();
  const provider = resolveProvider();

  const message: CrmMessage = {
    id: newId(),
    clinic_id: clinicId,
    conversation_id: conversationId,
    direction: "outbound",
    internal,
    body: input.body,
    template_id: input.templateId,
    attachments: [],
    state: internal ? "sent" : "queued",
    provider: provider.id,
    author_id: input.authorId,
    created_at: created,
    sent_at: internal ? created : undefined,
  };
  await saveMessage(message);

  if (!internal) {
    const result = await provider.send({
      to: contact.phone_norm,
      body: input.body,
      idempotencyKey: input.idempotencyKey ?? message.id,
    });
    message.state = result.ok ? "sent" : "failed";
    message.provider_message_id = result.providerMessageId;
    message.error = result.error;
    message.sent_at = result.ok ? nowIso() : undefined;
    await saveMessage(message);
  }

  await saveConversation({
    ...conversation,
    last_message_at: created,
    last_message_preview: internal ? "Internal note" : input.body.slice(0, 90),
    // Replying clears the unread badge: someone has now read the thread.
    unread_count: 0,
  });

  await addActivity({
    clinic_id: clinicId,
    contact_id: contact.id,
    patient_id: contact.patient_id,
    kind: internal ? "note" : "message_out",
    summary: internal ? "Internal note added" : "Reply sent on WhatsApp",
    detail: input.body.slice(0, 140),
    actor_id: input.authorId,
    branch_id: conversation.branch_id,
    ref_id: message.id,
    created_at: created,
  });

  return message;
}

/** Apply a delivery/read receipt. Unknown ids are ignored, as providers retry. */
export async function applyStatus(
  clinicId: string,
  update: StatusUpdate,
  providerId?: string
): Promise<CrmMessage | null> {
  const provider = providerId ?? resolveProvider().id;
  const message = await findMessageByProviderId(
    clinicId,
    provider,
    update.providerMessageId
  );
  if (!message) return null;
  // Never move a message backwards: a late "sent" receipt must not undo a
  // "read" that already arrived.
  if (!advances(message.state, update.state)) return message;

  const updated: CrmMessage = {
    ...message,
    state: update.state,
    error: update.error ?? message.error,
    delivered_at:
      update.state === "delivered" ? update.timestamp : message.delivered_at,
    read_at: update.state === "read" ? update.timestamp : message.read_at,
  };
  await saveMessage(updated);
  return updated;
}

const ORDER: MessageState[] = ["draft", "queued", "sent", "delivered", "read"];

function advances(from: MessageState, to: MessageState): boolean {
  if (to === "failed") return from !== "read";
  const a = ORDER.indexOf(from);
  const b = ORDER.indexOf(to);
  if (a === -1 || b === -1) return true;
  return b > a;
}

/** Mark a conversation read by the staff member looking at it. */
export async function markConversationRead(
  clinicId: string,
  conversationId: string
): Promise<void> {
  const conv = await getConversation(clinicId, conversationId);
  if (!conv || conv.unread_count === 0) return;
  await saveConversation({ ...conv, unread_count: 0 });
}

export async function conversationMessages(
  clinicId: string,
  conversationId: string
): Promise<CrmMessage[]> {
  return listMessages(clinicId, conversationId);
}
