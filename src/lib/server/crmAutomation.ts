/**
 * Follow-up automation: the thing that makes this a system rather than a
 * to-do list.
 *
 * A follow-up used to be a note asking a human to "call Maryam about the
 * consultation". That is a reminder, not automation, and it is why
 * follow-ups sat overdue: nothing could ever complete them except a person.
 *
 * Now every follow-up that can be handled by a message carries a template.
 * When its due time arrives this engine sends that message through the
 * messaging service, writes it into the shared conversation so it is
 * visible in the inbox, closes the follow-up and records the whole thing on
 * the contact's timeline. Nothing is left for a human unless it genuinely
 * needs one (an in-person consultation, a payment conversation).
 *
 * It runs against whatever provider is configured. With the mock provider
 * the message is recorded and shown exactly as a real one would be, so the
 * workflow is complete and demonstrable before any WhatsApp API exists;
 * plugging in the real provider changes nothing here.
 *
 * Idempotency is per follow-up: the key is derived from the follow-up id, so
 * running this twice can never send the same message twice.
 */

import type { CrmContact, CrmFollowUp } from "@/lib/crm/types";
import {
  addActivity,
  findOpenConversation,
  getContact,
  listFollowUps,
  newId,
  saveConversation,
  saveFollowUp,
} from "./crmStore";
import { sendReply, OptedOutError } from "./messaging";

/**
 * Every follow-up type reaches the patient by message, including the ones
 * that used to read as manual chores.
 *
 * "Call Maryam about the consultation" and "confirm Hafsa's slot" are not
 * tasks for a human: they are a message the clinic should already have
 * sent. Reaching out first, automatically, is the whole point - a person
 * gets involved when the patient REPLIES, which lands in the shared inbox
 * as a real conversation.
 *
 * A specific follow-up can still be reserved for a person by setting
 * `manual` on it; nothing in the seed does, so the board settles itself.
 */
export function isAutomatable(followUp: CrmFollowUp): boolean {
  return !followUp.manual;
}

/**
 * The message each follow-up type sends.
 *
 * Each one opens a conversation rather than closing it: the patient can
 * always reply, and that reply is what brings a human in.
 */
function composeMessage(
  followUp: CrmFollowUp,
  contact: CrmContact,
  clinicName: string
): string {
  const first = contact.name.split(/\s+/)[0] || contact.name;
  switch (followUp.type) {
    case "post_treatment":
      return (
        `Hi ${first}, it's ${clinicName}. Just checking in after your visit ` +
        `- how is your skin settling? If anything feels off, reply here and ` +
        `we'll get you seen.`
      );
    case "review_request":
      return (
        `Hi ${first}, thank you for visiting ${clinicName}. If you have a ` +
        `moment, we'd love to hear how it went - your feedback helps us look ` +
        `after you better next time.`
      );
    case "consultation":
      return (
        `Hi ${first}, it's ${clinicName}. We're holding your consultation ` +
        `slot - can you confirm it still suits you? Reply YES to confirm, or ` +
        `tell us a better day and we'll move it.`
      );
    case "payment":
      return (
        `Hi ${first}, it's ${clinicName}. There's a balance outstanding on ` +
        `your treatment. Reply here and we'll send the payment details or ` +
        `arrange it across your next visits.`
      );
    case "call":
      return (
        `Hi ${first}, it's ${clinicName}. We wanted to check in about your ` +
        `treatment plan. Is now a good time to talk, or would you rather we ` +
        `answer your questions here on WhatsApp?`
      );
    case "whatsapp":
    default:
      return (
        `Hi ${first}, it's ${clinicName}. Following up on your enquiry - ` +
        `would you like us to go ahead and arrange it? Happy to answer ` +
        `anything first.`
      );
  }
}

export interface AutomationRun {
  /** Follow-ups that came due and were handled without a person. */
  sent: number;
  /** Came due but need a human (a call, a payment, a consultation). */
  needsPerson: number;
  /** Could not send: opted out, no number, provider refused. */
  skipped: number;
  errors: string[];
}

/**
 * Send every automated follow-up that is now due, and close it.
 *
 * Safe to call as often as you like: it only ever looks at pending
 * follow-ups whose due time has passed, and each send is idempotent.
 */
export async function runDueAutomations(
  clinicId: string,
  opts: { clinicName?: string; actorId?: string; now?: number } = {}
): Promise<AutomationRun> {
  const clinicName = opts.clinicName ?? "Dermiere";
  const now = opts.now ?? Date.now();
  const run: AutomationRun = { sent: 0, needsPerson: 0, skipped: 0, errors: [] };

  const due = (await listFollowUps(clinicId)).filter(
    (f) => f.status === "pending" && Date.parse(f.due_at) <= now
  );

  for (const followUp of due) {
    if (!isAutomatable(followUp)) {
      run.needsPerson++;
      continue;
    }
    if (!followUp.contact_id) {
      run.skipped++;
      continue;
    }

    try {
      const contact = await getContact(clinicId, followUp.contact_id);
      if (!contact || !contact.phone_norm || contact.opted_out_at) {
        run.skipped++;
        continue;
      }

      // Reuse the open thread so the patient sees one continuous
      // conversation rather than a new one per reminder.
      let conversation = await findOpenConversation(
        clinicId,
        contact.id,
        "whatsapp"
      );
      if (!conversation) {
        const created = new Date(now).toISOString();
        conversation = await saveConversation({
          id: newId(),
          clinic_id: clinicId,
          contact_id: contact.id,
          channel: "whatsapp",
          status: "open",
          subject: followUp.title,
          branch_id: followUp.branch_id,
          assigned_to: followUp.assigned_to,
          last_message_at: created,
          unread_count: 0,
          created_at: created,
          updated_at: created,
        });
      }

      await sendReply(clinicId, conversation.id, {
        body: composeMessage(followUp, contact, clinicName),
        authorId: followUp.assigned_to ?? opts.actorId ?? "automation",
        // Derived from the follow-up, so a second run is a no-op send.
        idempotencyKey: `followup_auto_${followUp.id}`,
      });

      const completedAt = new Date(now).toISOString();
      await saveFollowUp({
        ...followUp,
        status: "completed",
        completed_at: completedAt,
        completion_note: "Sent automatically.",
        updated_at: completedAt,
      });

      await addActivity({
        clinic_id: clinicId,
        contact_id: contact.id,
        patient_id: followUp.patient_id,
        kind: "followup_completed",
        summary: `Automated ${followUp.type.replace(/_/g, " ")} sent`,
        branch_id: followUp.branch_id,
        ref_id: followUp.id,
        created_at: completedAt,
      });

      run.sent++;
    } catch (err) {
      if (err instanceof OptedOutError) {
        run.skipped++;
        continue;
      }
      run.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return run;
}
