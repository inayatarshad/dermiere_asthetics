/**
 * Booking a patient from the conversation they are already having.
 *
 * A patient writes "can I come Tuesday at 3?". Until now that was text a
 * human had to read and act on, which is exactly why an agreed time never
 * reached the calendar. This closes that loop:
 *
 *   patient asks  ->  read the date, check the real diary, OFFER a slot
 *   patient says yes  ->  book it, put it on the calendar, confirm
 *
 * The offer step is the whole safety design. Reading dates out of free text
 * is fallible - people write "Tuesday 28" when the 28th is a Friday - and a
 * booking made on a bad guess costs the clinic the slot AND the patient. So
 * nothing is ever booked off the first message: the system proposes, and
 * the patient's own "yes" is what commits it. When the date cannot be read
 * confidently the system asks instead of choosing.
 *
 * It runs on whatever messaging provider is configured, so it works end to
 * end with the mock provider and needs no WhatsApp credentials.
 */

import type { CrmContact } from "@/lib/crm/types";
import {
  describeSlot,
  isAffirmative,
  isNegative,
  parseBookingIntent,
} from "@/lib/crm/bookingIntent";
import { getClinicConfig } from "./clinicStore";
import { availabilityFor } from "./vyberoStore";
import { moveContactStage, saveContact } from "./crmStore";
import { ensureConsultationBooked } from "./crmBooking";
import { sendReply } from "./messaging";

/** How long an offered slot is held before it must be re-proposed. */
const OFFER_TTL_MS = 48 * 60 * 60 * 1000;

export type ChatBookingOutcome =
  | { action: "none" }
  | { action: "offered"; start: string }
  | { action: "asked"; reason: string }
  | { action: "booked"; start: string }
  | { action: "no_availability"; date: string };

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Pick the free slot closest to the time the patient asked for.
 *
 * With no time given, the first free slot of the day is the honest offer:
 * it is the earliest the clinic can actually see them.
 */
function chooseSlot(
  free: { start: string; end: string }[],
  wantedMinutes?: number
): string | undefined {
  if (free.length === 0) return undefined;
  if (wantedMinutes == null) return free[0].start;
  let best = free[0];
  let bestDelta = Infinity;
  for (const slot of free) {
    const d = new Date(slot.start);
    const delta = Math.abs(d.getHours() * 60 + d.getMinutes() - wantedMinutes);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = slot;
    }
  }
  return best.start;
}

/**
 * React to one inbound message.
 *
 * Returns what it did so the caller can log it. Any reply it sends goes
 * through the normal outbound path, so it lands in the same thread the
 * patient is reading and appears in the shared inbox like any other message.
 */
export async function handleInboundForBooking(
  clinicId: string,
  contact: CrmContact,
  conversationId: string,
  body: string,
  opts: { now?: Date } = {}
): Promise<ChatBookingOutcome> {
  const now = opts.now ?? new Date();
  const config = await getClinicConfig(clinicId);
  const clinicName = config?.name ?? "Dermiere";
  const hours = config?.hours;

  const reply = (text: string) =>
    sendReply(clinicId, conversationId, {
      body: text,
      authorId: "automation",
      // Keyed on the message content and contact so a redelivered webhook
      // cannot send the same reply twice.
      idempotencyKey: `chatbook_${contact.id}_${Buffer.from(body)
        .toString("base64")
        .slice(0, 24)}`,
    });

  // --- 1. an outstanding offer the patient is answering ----------------
  const offer = contact.pending_slot;
  const offerLive = offer && Date.parse(offer.expires_at) > now.getTime();

  if (offerLive && isAffirmative(body)) {
    const appointment = await ensureConsultationBooked(clinicId, contact, {
      start: offer!.start,
    });
    await saveContact({ ...contact, pending_slot: undefined });
    await moveContactStage(clinicId, contact.id, "consult_booked", undefined);
    await reply(
      `Booked. We'll see you ${describeSlot(appointment.start)} at ` +
        `${clinicName}. If anything changes, just message here.`
    );
    return { action: "booked", start: appointment.start };
  }

  if (offerLive && isNegative(body)) {
    // They said no. Drop the hold rather than leaving a slot half-promised.
    await saveContact({ ...contact, pending_slot: undefined });
    await reply(
      `No problem - what day suits you better? Tell me a day and I'll ` +
        `check what's free.`
    );
    return { action: "asked", reason: "declined the offer" };
  }

  // --- 2. a fresh request to be seen -----------------------------------
  const intent = parseBookingIntent(body, now);
  if (!intent.wantsBooking) return { action: "none" };

  if (intent.ambiguous) {
    // Never guess between two readings of a date.
    const options = intent.ambiguous.candidates
      .map((d) =>
        d.toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "short",
        })
      )
      .join(" or ");
    await reply(
      options
        ? `Happy to book you in - just to be sure, ${intent.ambiguous.reason}. ` +
            `Did you mean ${options}?`
        : `Happy to book you in - ${intent.ambiguous.reason}. Which day did you mean?`
    );
    return { action: "asked", reason: intent.ambiguous.reason };
  }

  if (!intent.date) {
    await reply(
      `Of course - which day suits you? Tell me a day and I'll check what's free.`
    );
    return { action: "asked", reason: "no date given" };
  }

  // --- 3. offer a real slot from the real diary ------------------------
  const dateKey = localDateKey(intent.date);
  const free = await availabilityFor(clinicId, dateKey, hours);
  const start = chooseSlot(free, intent.minutes);

  if (!start) {
    await reply(
      `We're fully booked on ${intent.date.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "short",
      })}. Would another day work? Tell me one and I'll check.`
    );
    return { action: "no_availability", date: dateKey };
  }

  await saveContact({
    ...contact,
    pending_slot: {
      start,
      offered_at: now.toISOString(),
      expires_at: new Date(now.getTime() + OFFER_TTL_MS).toISOString(),
    },
  });

  await reply(
    `Yes - I can offer you ${describeSlot(start)} at ${clinicName}. ` +
      `Reply YES to confirm and I'll book it.`
  );
  return { action: "offered", start };
}
