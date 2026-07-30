/**
 * Messaging provider interface - the WhatsApp boundary.
 *
 *   CRM UI  ->  /api/crm/*  ->  messagingService  ->  MessagingProvider
 *                                                      |- mock (now)
 *                                                      |- Meta WhatsApp Cloud (later)
 *
 * Nothing above this line knows what a provider is. The CRM UI and the CRM
 * business logic never import a provider, never hold a phone-number id and
 * never call Meta - they call the service, which resolves a provider from
 * configuration. Swapping the mock for the real Cloud API is a change to
 * `resolveProvider()` and one new file implementing this interface; no route
 * and no screen changes.
 *
 * The shape below is deliberately modelled on the Meta WhatsApp Cloud API so
 * the real implementation is a translation, not a redesign: webhook
 * verification, inbound message webhooks, outbound sends, approved
 * templates, delivery/read status callbacks, media metadata, retries and
 * idempotency keys all have a place here.
 */

import type { MessageAttachment, MessageState } from "@/lib/crm/types";

export interface OutboundMessage {
  /** Normalized destination number (digits, country code, no "+"). */
  to: string;
  body: string;
  /** When set, the provider sends an approved template instead of free text. */
  templateName?: string;
  templateLanguage?: string;
  templateVariables?: string[];
  attachments?: MessageAttachment[];
  /**
   * Caller-generated key. A provider must treat two sends with the same key
   * as one, so a retried request cannot double-send to a patient.
   */
  idempotencyKey: string;
}

export interface SendResult {
  ok: boolean;
  /** Provider's message id, stored as crm_messages.provider_message_id. */
  providerMessageId?: string;
  state: MessageState;
  error?: string;
  /** Set when the provider says "retry later" (rate limit, transient 5xx). */
  retryable?: boolean;
}

/** A normalized inbound message, already translated out of provider JSON. */
export interface InboundMessage {
  providerMessageId: string;
  from: string; // normalized phone
  body: string;
  attachments: MessageAttachment[];
  timestamp: string; // ISO
  contactName?: string;
}

/** A delivery/read receipt for a message we sent earlier. */
export interface StatusUpdate {
  providerMessageId: string;
  state: MessageState;
  timestamp: string;
  error?: string;
}

export interface ProviderTemplate {
  name: string;
  language: string;
  status: "approved" | "pending" | "rejected";
  category: string;
  body: string;
}

export interface MessagingProvider {
  readonly id: string;
  readonly label: string;
  /** False when credentials are absent - the service refuses to send. */
  readonly configured: boolean;

  send(message: OutboundMessage): Promise<SendResult>;

  /** Approved templates available for sending. */
  listTemplates(): Promise<ProviderTemplate[]>;

  /**
   * Webhook handshake. Meta calls the endpoint with hub.mode/hub.challenge
   * and expects the challenge echoed when the verify token matches.
   */
  verifyWebhook(params: {
    mode?: string;
    token?: string;
    challenge?: string;
  }): { ok: boolean; challenge?: string };

  /**
   * Validate a webhook payload's signature. Real providers sign the raw body
   * (Meta: X-Hub-Signature-256, HMAC-SHA256 over the raw bytes).
   */
  verifySignature(rawBody: string, signature: string | null): boolean;

  /** Translate a provider webhook body into our normalized shapes. */
  parseWebhook(body: unknown): {
    messages: InboundMessage[];
    statuses: StatusUpdate[];
  };
}
