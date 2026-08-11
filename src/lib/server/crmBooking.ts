/**
 * Turning a CRM booking into a real appointment.
 *
 * A lead reaching "consultation booked" used to change a label and nothing
 * else, so the front desk's calendar never knew about it. That is the bug
 * behind "when an appointment is booked it needs to show up in the calendar,
 * whether it's done by WhatsApp, the voice agent or in person".
 *
 * There is one appointments table and one calendar. This module is the CRM's
 * way in, so a booking made by a person in the pipeline, by the automation
 * replying to a patient, or by the voice agent all end up in the same diary.
 */

import type { Appointment } from "@/lib/types";
import type { CrmContact } from "@/lib/crm/types";
import { pgListAppointments, pgUpsertAppointment } from "./db";
import { addActivity } from "./crmStore";
import { CLINIC_TZ, clinicLocalToISO } from "./clinicTime";

/** Deterministic id so re-running a stage change cannot double-book. */
function appointmentIdFor(contactId: string): string {
  return `crm_appt_${contactId}`;
}

/**
 * The next sensible consultation slot: tomorrow (or Monday) at 12:00.
 *
 * A real booking flow asks the patient for a time. Until that exists, a
 * lead marked "consultation booked" still has to occupy a real slot on a
 * real day, or the calendar keeps lying about what the clinic has agreed.
 */
function nextSlot(from = new Date()): string {
  const localDate = from.toLocaleDateString("en-CA", { timeZone: CLINIC_TZ });
  const slot = new Date(`${localDate}T00:00:00Z`);
  slot.setDate(slot.getDate() + 1);
  // Sunday is closed; push to Monday.
  if (slot.getUTCDay() === 0) slot.setUTCDate(slot.getUTCDate() + 1);
  return clinicLocalToISO(slot.toISOString().slice(0, 10), "12:00")!;
}

/**
 * Ensure this contact has a consultation on the calendar.
 *
 * Idempotent: the appointment id is derived from the contact, so calling
 * this twice updates one booking rather than creating two.
 */
export async function ensureConsultationBooked(
  clinicId: string,
  contact: CrmContact,
  opts: { actorId?: string; start?: string } = {}
): Promise<Appointment> {
  const id = appointmentIdFor(contact.id);
  const existing = (await pgListAppointments<Appointment>(clinicId)).find(
    (a) => a.id === id
  );

  const now = new Date().toISOString();
  const start = opts.start ?? existing?.start ?? nextSlot();

  const appointment: Appointment = {
    id,
    patient_id: contact.patient_id,
    patient_name: contact.name,
    phone: contact.phone,
    start,
    duration_min: 30,
    type: "consultation",
    procedure_interest: contact.treatment_interest[0],
    source: "crm",
    status: "booked",
    notes: "Booked from the CRM pipeline.",
    location_id: contact.branch_id,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  await pgUpsertAppointment(
    clinicId,
    appointment.id,
    appointment.start,
    appointment.status,
    appointment
  );

  // Only announce a booking the first time, so a re-save is quiet.
  if (!existing) {
    await addActivity({
      clinic_id: clinicId,
      contact_id: contact.id,
      patient_id: contact.patient_id,
      kind: "appointment",
      summary: "Consultation booked",
      detail: new Date(start).toLocaleString("en-GB", {
        timeZone: CLINIC_TZ,
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
      actor_id: opts.actorId,
      branch_id: contact.branch_id,
      ref_id: appointment.id,
      created_at: now,
    });
  }

  return appointment;
}

/**
 * Cancel the CRM-made booking when a lead is lost or archived, so the
 * calendar does not keep holding a slot nobody is coming to.
 */
export async function cancelCrmBooking(
  clinicId: string,
  contactId: string
): Promise<void> {
  const id = appointmentIdFor(contactId);
  const existing = (await pgListAppointments<Appointment>(clinicId)).find(
    (a) => a.id === id
  );
  if (!existing || existing.status === "completed") return;
  const cancelled: Appointment = {
    ...existing,
    status: "cancelled",
    updated_at: new Date().toISOString(),
  };
  await pgUpsertAppointment(clinicId, id, cancelled.start, "cancelled", cancelled);
}
