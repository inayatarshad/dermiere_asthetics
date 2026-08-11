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
import { createInvite } from "./reviewStore";
import { describeSlot } from "@/lib/crm/bookingIntent";
import { pgListAppointments } from "./db";
import type { Appointment } from "@/lib/types";

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
  clinicName: string,
  when?: string,
  reviewUrl?: string
): string {
  const first = contact.name.split(/\s+/)[0] || contact.name;
  const hello = `Assalam o alaikum ${first},`;
  const slot = when ? describeSlot(when) : null;

  switch (followUp.type) {
    case "booking_confirmation":
      return [
        hello,
        "",
        slot
          ? `Your appointment at ${clinicName} is confirmed for ${slot}.`
          : `Your appointment at ${clinicName} is confirmed.`,
        "",
        "Please arrive about ten minutes early so we can settle you in, and " +
          "come with clean skin if you can - no makeup is best.",
        "",
        "If anything changes, just reply here and we will move it for you. " +
          "We are looking forward to seeing you.",
        "",
        `Warmly,\n${clinicName}`,
      ].join("\n");

    case "appointment_reminder":
      return [
        hello,
        "",
        slot
          ? `A gentle reminder about your appointment with us ${slot}.`
          : "A gentle reminder about your appointment with us tomorrow.",
        "",
        "There is nothing you need to bring. If you have started any new " +
          "skincare or medication since we last spoke, do mention it when " +
          "you arrive so we can take it into account.",
        "",
        "See you soon, and reply here if you need to reschedule.",
        "",
        `Warmly,\n${clinicName}`,
      ].join("\n");

    case "follow_up_consultation":
      return [
        hello,
        "",
        "We hope you have been well since your visit. At this point in your " +
          "treatment it is a good moment to see how your skin has responded, " +
          "so we can decide together whether to continue as planned or adjust " +
          "anything.",
        "",
        "Would you like us to arrange your follow-up consultation? Tell us a " +
          "day that suits you and we will find you a time.",
        "",
        `Warmly,\n${clinicName}`,
      ].join("\n");

    case "feedback_request":
    default:
      return [
        hello,
        "",
        `Thank you for visiting ${clinicName}. It was a pleasure looking ` +
          "after you.",
        "",
        "When you have a spare moment, we would love to know how you found " +
          "your visit. It takes less than a minute:",
        "",
        reviewUrl ?? "(review link)",
        "",
        "You can also simply reply here - it is read by the team, and it " +
          "genuinely shapes how we look after you next time.",
        "",
        "If anything was not right, please tell us that too. We would much " +
          "rather hear it from you and put it right.",
        "",
        `Warmly,\n${clinicName}`,
      ].join("\n");
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
  opts: {
    clinicName?: string;
    actorId?: string;
    now?: number;
    /** Origin for review links, e.g. https://dermiere.vercel.app */
    baseUrl?: string;
    /** Restrict an interactive staff-triggered run to that staff member's branch. */
    branchId?: string;
  } = {}
): Promise<AutomationRun> {
  const clinicName = opts.clinicName ?? "Dermiére";
  const now = opts.now ?? Date.now();
  const run: AutomationRun = { sent: 0, needsPerson: 0, skipped: 0, errors: [] };

  const appointments = await pgListAppointments<Appointment>(clinicId);

  const due = (await listFollowUps(clinicId)).filter(
    (f) =>
      f.status === "pending" &&
      Date.parse(f.due_at) <= now &&
      (!opts.branchId || f.branch_id === opts.branchId)
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

      // Name the real slot when there is one: "confirmed for Sat 1 Aug,
      // 11:00 am" reads like a clinic, "your appointment is confirmed"
      // reads like a robot.
      const upcoming = appointments
        .filter(
          (a) =>
            (a.patient_id && a.patient_id === contact.patient_id) ||
            (a.phone && a.phone === contact.phone)
        )
        .filter((a) => a.status !== "cancelled")
        .sort((x, y) => x.start.localeCompare(y.start))[0];

      // A feedback request without a link is just a nice sentence. Mint a
      // real single-use review link so the patient can actually leave one.
      let reviewUrl: string | undefined;
      if (followUp.type === "feedback_request" && opts.baseUrl) {
        const invite = await createInvite(clinicId, {
          patient_id: contact.patient_id,
          patient_name: contact.name,
          location_id: contact.branch_id ?? "",
          treatments: contact.treatment_interest,
        });
        reviewUrl = `${opts.baseUrl}/review/${invite.token}`;
      }

      await sendReply(clinicId, conversation.id, {
        body: composeMessage(
          followUp,
          contact,
          clinicName,
          upcoming?.start,
          reviewUrl
        ),
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
