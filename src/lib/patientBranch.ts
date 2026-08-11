import type { Appointment, Invoice, Patient } from "@/lib/types";

/**
 * Resolve a patient's owning branch. An explicit registration assignment is
 * authoritative; activity is only a compatibility fallback for older rows.
 * This prevents a mistakenly cross-branch invoice from silently moving the
 * patient's entire clinical record to the wrong branch.
 */
export function derivePatientBranches(
  patients: Patient[],
  appointments: Appointment[],
  invoices: Invoice[]
): Map<string, string> {
  const branchByPatient = new Map<string, string>();
  const latestAt = new Map<string, string>();
  const explicitlyAssigned = new Set<string>();

  for (const patient of patients) {
    if (patient.branch_id) {
      branchByPatient.set(patient.id, patient.branch_id);
      explicitlyAssigned.add(patient.id);
    }
  }

  const note = (patientId: string | undefined, at: string, branchId?: string) => {
    if (!patientId || !branchId || explicitlyAssigned.has(patientId)) return;
    const previous = latestAt.get(patientId);
    if (!previous || at > previous) {
      latestAt.set(patientId, at);
      branchByPatient.set(patientId, branchId);
    }
  };

  for (const appointment of appointments) {
    note(appointment.patient_id, appointment.start, appointment.location_id);
  }
  for (const invoice of invoices) {
    note(invoice.patient_id, invoice.created_at, invoice.location_id);
  }
  return branchByPatient;
}
