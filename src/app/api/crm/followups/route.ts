/**
 * /api/crm/followups
 *
 *   GET   every follow-up for the clinic (the dashboard buckets client-side
 *         from one payload, so switching tabs costs no round trip)
 *   POST  create one
 *
 * "Overdue" is never stored — see followUpState() in crm/types.ts.
 */

import { NextResponse } from "next/server";
import {
  badRequest,
  crmError,
  isoDate,
  oneOf,
  readJson,
  requireCrm,
  str,
} from "@/lib/server/crmApi";
import {
  addActivity,
  getContact,
  listFollowUps,
  newId,
  saveFollowUp,
} from "@/lib/server/crmStore";
import { listStaff, getClinicConfig } from "@/lib/server/clinicStore";
import { FOLLOWUP_TYPES, PRIORITIES } from "@/lib/crm/types";
import { onFollowUpCreated } from "@/lib/server/crmEvents";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const ctx = await requireCrm(req, "view_crm");
    const [followUps, staff, config] = await Promise.all([
      listFollowUps(ctx.clinicId),
      listStaff(ctx.clinicId),
      getClinicConfig(ctx.clinicId),
    ]);
    return NextResponse.json({
      ok: true,
      followUps,
      staff: staff.map((s) => ({ id: s.id, name: s.name, role: s.role })),
      branches: config?.locations ?? [],
      me: ctx.userId,
    });
  } catch (err) {
    return crmError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCrm(req, "manage_followups");
    const body = await readJson<Record<string, unknown>>(req);
    if (!body) return badRequest("Invalid JSON body.");

    const title = str(body.title, { max: 200 });
    const dueAt = isoDate(body.due_at);
    if (!title) return badRequest("A title is required.");
    if (!dueAt) return badRequest("A valid due date and time is required.");

    const contactId = str(body.contact_id, { max: 64 });
    const contact = contactId ? await getContact(ctx.clinicId, contactId) : null;
    if (contactId && !contact) return badRequest("That contact does not exist.");

    const now = new Date().toISOString();
    const followUp = await saveFollowUp({
      id: newId(),
      clinic_id: ctx.clinicId,
      contact_id: contactId,
      patient_id: str(body.patient_id, { max: 64 }) ?? contact?.patient_id,
      title,
      description: str(body.description, { max: 2000 }),
      type: oneOf(body.type, FOLLOWUP_TYPES) ?? "call",
      priority: oneOf(body.priority, PRIORITIES) ?? "normal",
      status: "pending",
      assigned_to: str(body.assigned_to, { max: 64 }) ?? ctx.userId,
      branch_id: str(body.branch_id, { max: 64 }) ?? contact?.branch_id,
      due_at: dueAt,
      rescheduled_from: [],
      created_at: now,
      created_by: ctx.userId,
      updated_at: now,
    });

    await addActivity({
      clinic_id: ctx.clinicId,
      contact_id: followUp.contact_id,
      patient_id: followUp.patient_id,
      kind: "followup_created",
      summary: `Follow-up scheduled: ${followUp.title}`,
      detail: followUp.description,
      actor_id: ctx.userId,
      branch_id: followUp.branch_id,
      ref_id: followUp.id,
    });

    await onFollowUpCreated(followUp);

    return NextResponse.json({ ok: true, followUp });
  } catch (err) {
    return crmError(err);
  }
}
