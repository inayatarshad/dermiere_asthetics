import type { Appointment, Invoice, Patient } from "@/lib/types";

/**
 * Derive the branch a patient currently attends from their latest dated
 * appointment or invoice. A registration branch is only a fallback; actual
 * visit/billing activity wins when the patient later attends another site.
 */
export function derivePatientBranches(
  patients: Patient[],
  appointments: Appointment[],
  invoices: Invoice[]
): Map<string, string> {
  const branchByPatient = new Map<string, string>();
  const latestAt = new Map<string, string>();

  const note = (patientId: string | undefined, at: string, branchId?: string) => {
    if (!patientId || !branchId) return;
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
  for (const patient of patients) {
    if (!branchByPatient.has(patient.id) && patient.branch_id) {
      branchByPatient.set(patient.id, patient.branch_id);
    }
  }

  return branchByPatient;
}
