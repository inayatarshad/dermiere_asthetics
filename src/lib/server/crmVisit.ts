/**
 * Marking someone Visited puts them in the patient registry.
 *
 * There is no "convert this lead" step any more. The pipeline begins after
 * a booking exists, so everyone on the board is already a patient of the
 * clinic in every sense except the paperwork - asking a receptionist to
 * press a button to make that official was a leftover from a funnel that
 * started at cold enquiries.
 *
 * So the moment a contact is marked Visited, the registry record is created
 * or, if their number is already on file, linked. Idempotent: a contact who
 * already has a patient_id is left exactly as it is.
 */

import type { Patient } from "@/lib/types";
import type { CrmContact } from "@/lib/crm/types";
import { normalizePhone } from "@/lib/crm/phone";
import { pgListRecords, pgUpsertRecord } from "./db";
import { addActivity, saveContact } from "./crmStore";

export async function ensurePatientForVisit(
  clinicId: string,
  contact: CrmContact,
  opts: { actorId?: string } = {}
): Promise<CrmContact> {
  if (contact.patient_id) return contact;

  const patients = await pgListRecords<Patient>(clinicId, "patients");
  // The phone is the identity: someone who has been here before must not
  // get a second record because they came back through the CRM.
  const match = patients.find(
    (p) => normalizePhone(p.phone) === contact.phone_norm
  );

  let patientId: string;
  if (match) {
    patientId = match.id;
  } else {
    patientId = crypto.randomUUID();
    const patient: Patient = {
      id: patientId,
      clinic_id: clinicId,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      gender: contact.gender ?? "other",
      city: contact.city ?? "",
      language: "urdu",
      source: contact.source === "walk_in" ? "walk_in" : "social",
      clinical_flags: {},
      created_at: new Date().toISOString(),
    };
    await pgUpsertRecord(clinicId, "patients", patientId, patient);
  }

  const updated = await saveContact({ ...contact, patient_id: patientId });
  await addActivity({
    clinic_id: clinicId,
    contact_id: contact.id,
    patient_id: patientId,
    kind: "converted",
    summary: match
      ? "Linked to an existing patient record"
      : "Added to the patient registry",
    actor_id: opts.actorId,
    branch_id: contact.branch_id,
    ref_id: patientId,
  });

  return updated;
}
