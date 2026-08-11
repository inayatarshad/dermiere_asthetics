import type { Appointment, Patient } from "@/lib/types";
import type { ContactStage, CrmContact } from "./types";
import { normalizePhone } from "./phone";

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function patientForContact(
  contact: CrmContact,
  patientsById: Map<string, Patient>,
  patientsByPhone: Map<string, Patient[]>
): Patient | undefined {
  const linked = contact.patient_id
    ? patientsById.get(contact.patient_id)
    : undefined;
  // Trust an existing link only when the identity signal agrees. This avoids
  // projecting one patient's branch/history onto another person through a
  // stale patient_id.
  if (linked && normalizePhone(linked.phone) === contact.phone_norm) return linked;

  const candidates = patientsByPhone.get(contact.phone_norm) ?? [];
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const name = normalizedName(contact.name);
    const named = candidates.filter(
      (patient) => normalizedName(patient.name) === name
    );
    if (named.length === 1) return named[0];
  }
  return undefined;
}

function stageFromAppointments(
  appointments: Appointment[],
  now: number
): ContactStage | undefined {
  if (appointments.length === 0) return undefined;
  const ordered = [...appointments].sort(
    (a, b) => Date.parse(b.start) - Date.parse(a.start)
  );
  const upcoming = ordered
    .filter(
      (appointment) =>
        Date.parse(appointment.start) >= now &&
        (appointment.status === "booked" || appointment.status === "confirmed")
    )
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
  if (upcoming) {
    if (upcoming.status === "confirmed") return "confirmed";
    const hasCompletedVisit = appointments.some(
      (appointment) =>
        appointment.status === "completed" && Date.parse(appointment.start) < now
    );
    return hasCompletedVisit ? "rebooked" : "consult_booked";
  }

  const latest = ordered[0];
  if (latest.status === "completed") return "visited";
  if (latest.status === "no_show") return "no_show";
  if (latest.status === "cancelled") return "cancelled";
  if (latest.status === "confirmed") return "confirmed";
  if (latest.status === "booked") return "consult_booked";
  return undefined;
}

/**
 * Read-only CRM view over Clinic OS data.
 *
 * This never saves a contact, patient or appointment. It repairs stale CRM
 * links in the response using phone identity, takes branch ownership from the
 * patient/appointment registry, and derives journey stage from real bookings.
 */
export function projectCrmContacts(
  contacts: CrmContact[],
  patients: Patient[],
  appointments: Appointment[],
  now = Date.now(),
  validBranchIds?: ReadonlySet<string>
): CrmContact[] {
  const patientsById = new Map(patients.map((patient) => [patient.id, patient]));
  const patientsByPhone = new Map<string, Patient[]>();
  for (const patient of patients) {
    const phone = normalizePhone(patient.phone);
    if (!phone) continue;
    patientsByPhone.set(phone, [...(patientsByPhone.get(phone) ?? []), patient]);
  }

  return contacts.map((contact) => {
    const patient = patientForContact(contact, patientsById, patientsByPhone);
    const matchedAppointments = appointments.filter((appointment) => {
      if (patient && appointment.patient_id === patient.id) return true;
      // Unlinked voice/front-desk bookings still belong to this person when
      // their normalized phone agrees. A conflicting linked patient is never
      // pulled across merely because a household reuses a number.
      return (
        !appointment.patient_id &&
        !!appointment.phone &&
        normalizePhone(appointment.phone) === contact.phone_norm
      );
    });
    const latestAppointment = [...matchedAppointments].sort(
      (a, b) => Date.parse(b.start) - Date.parse(a.start)
    )[0];
    const stage = stageFromAppointments(matchedAppointments, now);
    const branchId = [
      patient?.branch_id,
      latestAppointment?.location_id,
      contact.branch_id,
    ].find(
      (candidate): candidate is string =>
        !!candidate && (!validBranchIds || validBranchIds.has(candidate))
    );

    return {
      ...contact,
      patient_id: patient?.id,
      branch_id: branchId,
      stage: stage ?? contact.stage,
    };
  });
}
