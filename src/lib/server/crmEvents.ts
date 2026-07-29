/**
 * CRM automation hooks.
 *
 * These are the seams where email / SMS / WhatsApp notifications will attach.
 * Nothing here sends anything today — deliberately. The requirement is a
 * reusable event surface, not a live notification channel, and a half-wired
 * sender is worse than none: it would message real people from a development
 * database full of fictional contacts.
 *
 * Handlers are registered rather than hardcoded, so adding "email the
 * assignee when a follow-up is created" later is a new subscriber in one
 * file, not an edit to every route that creates a follow-up.
 *
 * Every handler is isolated: one that throws is logged and skipped, and the
 * user-facing operation still succeeds. A notification failure must never
 * fail the write that triggered it.
 */

import type { CrmContact, CrmFeedback, CrmFollowUp } from "@/lib/crm/types";

export interface CrmEventMap {
  "followup.created": { followUp: CrmFollowUp };
  "followup.due_soon": { followUp: CrmFollowUp };
  "followup.overdue": { followUp: CrmFollowUp };
  "followup.completed": { followUp: CrmFollowUp };
  "lead.created": { contact: CrmContact };
  "lead.stage_changed": { contact: CrmContact; from: string; to: string };
  "lead.awaiting_response": { contact: CrmContact };
  "feedback.received": { feedback: CrmFeedback };
  "feedback.low_rating": { feedback: CrmFeedback };
  "feedback.resolved": { feedback: CrmFeedback };
}

export type CrmEventName = keyof CrmEventMap;

type Handler<K extends CrmEventName> = (
  payload: CrmEventMap[K]
) => void | Promise<void>;

const handlers: { [K in CrmEventName]?: Array<Handler<K>> } = {};

/** Register a handler. Returns an unsubscribe function. */
export function onCrmEvent<K extends CrmEventName>(
  event: K,
  handler: Handler<K>
): () => void {
  const list = (handlers[event] ??= []) as Array<Handler<K>>;
  list.push(handler);
  return () => {
    const i = list.indexOf(handler);
    if (i !== -1) list.splice(i, 1);
  };
}

/**
 * Fire an event. Never throws: a broken subscriber must not take down the
 * request that emitted it.
 */
export async function emitCrmEvent<K extends CrmEventName>(
  event: K,
  payload: CrmEventMap[K]
): Promise<void> {
  const list = (handlers[event] ?? []) as Array<Handler<K>>;
  for (const h of list) {
    try {
      await h(payload);
    } catch (err) {
      console.error(`[crm-events] handler for "${event}" failed`, err);
    }
  }
}

// ---------------------------------------------------------------------
// Named emitters — call sites use these so the event names stay in one file
// ---------------------------------------------------------------------

export const onFollowUpCreated = (followUp: CrmFollowUp) =>
  emitCrmEvent("followup.created", { followUp });

export const onFollowUpCompleted = (followUp: CrmFollowUp) =>
  emitCrmEvent("followup.completed", { followUp });

export const onLeadCreated = (contact: CrmContact) =>
  emitCrmEvent("lead.created", { contact });

export const onLeadStageChanged = (contact: CrmContact, from: string, to: string) =>
  emitCrmEvent("lead.stage_changed", { contact, from, to });

export const onFeedbackReceived = (feedback: CrmFeedback) =>
  emitCrmEvent("feedback.received", { feedback });

export const onFeedbackLowRating = (feedback: CrmFeedback) =>
  emitCrmEvent("feedback.low_rating", { feedback });

export const onFeedbackResolved = (feedback: CrmFeedback) =>
  emitCrmEvent("feedback.resolved", { feedback });
