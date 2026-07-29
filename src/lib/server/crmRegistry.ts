/**
 * The bridge between the CRM and the clinic's existing patient registry.
 *
 * There is ONE list of people. A CRM contact and a `patients` record are two
 * views of the same person, joined by `crm_contacts.patient_id`. This module
 * is what guarantees that:
 *
 *  - a patient registered anywhere in Clinic OS (front desk, booth, voice
 *    agent) gets a CRM contact, so they are searchable and have a timeline;
 *  - a lead converted in the CRM links to the existing patient rather than
 *    creating a second one;
 *  - the join key is the normalized phone number, so the same person typed
 *    three different ways still resolves to one record.
 *
 * Everything here is additive and idempotent: it creates the missing link,
 * never overwrites clinical data, and never deletes.
 */

import type { Patient } from "@/lib/types";
import type { CrmContact, LeadSource } from "@/lib/crm/types";
import { normalizePhone } from "@/lib/crm/phone";
import {
  addActivity,
  findContactByPhone,
  listContacts,
  newId,
  saveContact,
} from "./crmStore";
import { pgListRecords } from "./db";

/** How a registry patient's `source` maps onto a CRM lead source. */
function leadSourceFor(patient: Patient): LeadSource {
  switch (patient.source) {
    case "walk_in":
      return "walk_in";
    case "referral":
      return "referral";
    case "social":
      return "instagram";
    case "vibro":
      return "phone";
    default:
      return "other";
  }
}

/**
 * Ensure a CRM contact exists for one registry patient.
 *
 * Matching order matters: an existing contact with the same phone is the
 * same person, so it is LINKED (patient_id filled in) rather than duplicated.
 * Returns the contact, or null when the patient has no usable phone.
 */
export async function ensureContactForPatient(
  clinicId: string,
  patient: Patient,
  opts: { branchId?: string; actorId?: string } = {}
): Promise<CrmContact | null> {
  const phone = normalizePhone(patient.phone);
  if (!phone) return null;

  const existing = await findContactByPhone(clinicId, phone);
  if (existing) {
    // Already linked to this patient — nothing to do.
    if (existing.patient_id === patient.id) return existing;
    // A lead for this person exists but was never converted. Linking it is
    // the whole point: it keeps one row per human being.
    if (!existing.patient_id) {
      const linked = await saveContact({
        ...existing,
        patient_id: patient.id,
        // Registering someone is the clinic saying "this is a patient now".
        stage: existing.stage === "lost" || existing.stage === "archived"
          ? existing.stage
          : "won",
        email: existing.email ?? patient.email,
        city: existing.city ?? patient.city,
        gender: existing.gender ?? patient.gender,
      });
      await addActivity({
        clinic_id: clinicId,
        contact_id: linked.id,
        patient_id: patient.id,
        kind: "converted",
        summary: "Linked to the patient registry",
        actor_id: opts.actorId,
        branch_id: linked.branch_id,
        ref_id: patient.id,
      });
      return linked;
    }
    // Linked to a DIFFERENT patient: two registry records share a number
    // (a family phone, or a duplicate). Leave both alone — silently
    // repointing a contact at another patient would lose history.
    return existing;
  }

  const now = new Date().toISOString();
  const contact = await saveContact({
    id: newId(),
    clinic_id: clinicId,
    patient_id: patient.id,
    name: patient.name,
    phone: patient.phone,
    phone_norm: phone,
    email: patient.email,
    city: patient.city,
    gender: patient.gender,
    stage: "won",
    source: leadSourceFor(patient),
    treatment_interest: [],
    branch_id: opts.branchId,
    tags: [],
    marketing_opt_in: false,
    created_at: patient.created_at ?? now,
    updated_at: now,
  });

  await addActivity({
    clinic_id: clinicId,
    contact_id: contact.id,
    patient_id: patient.id,
    kind: "lead_created",
    summary: "Added from the patient registry",
    actor_id: opts.actorId,
    branch_id: contact.branch_id,
    ref_id: patient.id,
    created_at: contact.created_at,
  });

  return contact;
}

/**
 * Backfill: give every registry patient a CRM contact.
 *
 * Safe to run repeatedly — patients that already have one are skipped.
 * Returns how many links were created.
 */
export async function linkRegistryPatients(
  clinicId: string
): Promise<{ scanned: number; created: number; linked: number }> {
  const [patients, contacts] = await Promise.all([
    pgListRecords<Patient>(clinicId, "patients"),
    listContacts(clinicId),
  ]);

  const alreadyLinked = new Set(
    contacts.map((c) => c.patient_id).filter((x): x is string => !!x)
  );
  const byPhone = new Map(contacts.map((c) => [c.phone_norm, c]));

  let created = 0;
  let linked = 0;
  for (const p of patients) {
    if (alreadyLinked.has(p.id)) continue;
    const phone = normalizePhone(p.phone);
    const hadContact = !!phone && byPhone.has(phone);
    const result = await ensureContactForPatient(clinicId, p);
    if (!result) continue;
    if (hadContact) linked++;
    else created++;
    alreadyLinked.add(p.id);
    byPhone.set(result.phone_norm, result);
  }

  return { scanned: patients.length, created, linked };
}
