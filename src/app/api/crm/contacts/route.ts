/**
 * /api/crm/contacts - the leads and contacts collection.
 *
 *   GET   list, with the staff directory and branches the UI needs to render
 *   POST  create a lead (duplicate-checked on the normalized phone)
 *
 * A duplicate POST answers 409 with the existing contact attached, so the UI
 * can offer "open the existing lead" instead of silently making a second one.
 */

import { NextResponse } from "next/server";
import {
  badRequest,
  crmError,
  isoDate,
  num,
  oneOf,
  readJson,
  requireCrm,
  crmScopeRows,
  crmWriteBranch,
  str,
  strList,
} from "@/lib/server/crmApi";
import {
  addActivity,
  findContactByPhone,
  listContacts,
  newId,
  saveContact,
} from "@/lib/server/crmStore";
import { getClinicConfig, listAssignableStaff } from "@/lib/server/clinicStore";
import { pgListAppointments, pgListRecords } from "@/lib/server/db";
import type { Appointment, Patient } from "@/lib/types";
import { isPlausiblePhone, normalizePhone } from "@/lib/crm/phone";
import { LEAD_SOURCES, isStage, type ContactStage } from "@/lib/crm/types";
import { projectCrmContacts } from "@/lib/crm/projection";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const ctx = await requireCrm(req, "view_crm");
    const [contacts, staff, config, appointments, patients] = await Promise.all([
      listContacts(ctx.clinicId),
      listAssignableStaff(ctx.clinicId),
      getClinicConfig(ctx.clinicId),
      // The board shows when each person is actually coming in, which lives
      // on the appointment, not the contact.
      pgListAppointments<Appointment>(ctx.clinicId),
      // Read-only registry projection: the CRM sees the branch Clinic OS
      // already assigned without copying or updating the patient record.
      pgListRecords<Patient>(ctx.clinicId, "patients"),
    ]);
    const validBranchIds = new Set(
      (config?.locations ?? []).map((location) => location.id)
    );
    const projectedContacts = projectCrmContacts(
      contacts,
      patients,
      appointments,
      Date.now(),
      validBranchIds
    );
    const scopedContacts = crmScopeRows(ctx, projectedContacts);
    const scopedAppointments = ctx.branchId
      ? appointments.filter((appointment) => appointment.location_id === ctx.branchId)
      : appointments;
    return NextResponse.json({
      ok: true,
      contacts: scopedContacts,
      staff: staff.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        title: s.title,
        active: s.active,
      })),
      branches: ctx.branchId
        ? (config?.locations ?? []).filter((branch) => branch.id === ctx.branchId)
        : config?.locations ?? [],
      treatments: config?.menu ?? [],
      appointments: scopedAppointments,
      scopeBranchId: ctx.branchId ?? null,
    });
  } catch (err) {
    return crmError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCrm(req, "manage_leads");
    const body = await readJson<Record<string, unknown>>(req);
    if (!body) return badRequest("Invalid JSON body.");

    const name = str(body.name, { max: 120 });
    const phone = str(body.phone, { max: 40 });
    if (!name) return badRequest("A name is required.");
    if (!phone || !isPlausiblePhone(phone)) {
      return badRequest("A valid phone number is required.");
    }

    const duplicate = await findContactByPhone(ctx.clinicId, phone);
    if (duplicate) {
      return NextResponse.json(
        {
          error: "duplicate",
          message: `${duplicate.name} is already in the CRM with this number.`,
          contact: duplicate,
        },
        { status: 409 }
      );
    }

    const stage = (isStage(body.stage) ? body.stage : "new") as ContactStage;
    const now = new Date().toISOString();
    const contact = await saveContact({
      id: newId(),
      clinic_id: ctx.clinicId,
      name,
      phone,
      phone_norm: normalizePhone(phone),
      email: str(body.email, { max: 160 }),
      city: str(body.city, { max: 80 }),
      gender: oneOf(body.gender, ["female", "male", "other"] as const),
      stage,
      source: oneOf(body.source, LEAD_SOURCES) ?? "other",
      treatment_interest: strList(body.treatment_interest, 10),
      assigned_to: str(body.assigned_to, { max: 64 }),
      branch_id: crmWriteBranch(ctx, str(body.branch_id, { max: 64 })),
      tags: strList(body.tags, 12),
      notes: str(body.notes, { max: 4000 }),
      estimated_value: num(body.estimated_value, 0, 100_000_000),
      marketing_opt_in: body.marketing_opt_in === true,
      created_at: isoDate(body.created_at) ?? now,
      updated_at: now,
    });

    await addActivity({
      clinic_id: ctx.clinicId,
      contact_id: contact.id,
      kind: "lead_created",
      summary: `Lead created from ${contact.source.replace(/_/g, " ")}`,
      actor_id: ctx.userId,
      branch_id: contact.branch_id,
      ref_id: contact.id,
    });

    return NextResponse.json({ ok: true, contact });
  } catch (err) {
    return crmError(err);
  }
}
