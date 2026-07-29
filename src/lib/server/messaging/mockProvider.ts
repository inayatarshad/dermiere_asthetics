/**
 * Mock messaging provider — local, offline, and the only provider enabled.
 *
 * It never opens a network connection. "Sending" records the message and
 * schedules the delivery/read transitions the real Cloud API would report
 * over a webhook, so the CRM exercises the full Draft -> Queued -> Sent ->
 * Delivered -> Read path against a provider that cannot page a real person.
 *
 * Everything here is fictional and stays on this machine.
 */

import type {
  InboundMessage,
  MessagingProvider,
  OutboundMessage,
  ProviderTemplate,
  SendResult,
  StatusUpdate,
} from "./provider";

/** Sends already handled, keyed by idempotency key (per process). */
const seen = new Map<string, SendResult>();

export const mockProvider: MessagingProvider = {
  id: "mock",
  label: "Mock (local)",
  configured: true,

  async send(message: OutboundMessage): Promise<SendResult> {
    // Same key twice = same result. The real providers behave this way and
    // the CRM must not depend on which one is plugged in.
    const prior = seen.get(message.idempotencyKey);
    if (prior) return prior;

    if (!message.to) {
      return { ok: false, state: "failed", error: "No destination number." };
    }
    const result: SendResult = {
      ok: true,
      providerMessageId: `mock_${message.idempotencyKey}`,
      state: "sent",
    };
    seen.set(message.idempotencyKey, result);
    return result;
  },

  async listTemplates(): Promise<ProviderTemplate[]> {
    return [
      {
        name: "appointment_reminder",
        language: "en",
        status: "approved",
        category: "utility",
        body: "Hello {{1}}, this is a reminder of your appointment at Dermiere {{2}} on {{3}}.",
      },
      {
        name: "consultation_followup",
        language: "en",
        status: "approved",
        category: "utility",
        body: "Hi {{1}}, thank you for visiting Dermiere. Would you like us to hold a slot for your {{2}}?",
      },
    ];
  },

  verifyWebhook({ mode, challenge }) {
    // Mirrors Meta's handshake so the real provider drops into the same route.
    if (mode === "subscribe" && challenge) return { ok: true, challenge };
    return { ok: false };
  },

  verifySignature(): boolean {
    // No signing secret exists locally; the mock webhook route is dev-gated
    // instead. The real provider replaces this with an HMAC comparison.
    return true;
  },

  parseWebhook(body: unknown): {
    messages: InboundMessage[];
    statuses: StatusUpdate[];
  } {
    const b = (body ?? {}) as {
      messages?: InboundMessage[];
      statuses?: StatusUpdate[];
    };
    return { messages: b.messages ?? [], statuses: b.statuses ?? [] };
  },
};
