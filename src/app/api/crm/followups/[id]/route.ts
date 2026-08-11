/**
 * PATCH /api/crm/followups/[id] - complete, reschedule or cancel.
 *
 * The three transitions are explicit `action`s rather than a free-form
 * status edit, so each one records the right timestamps and the right
 * timeline entry and cannot leave the row half-updated.
 */

import { NextResponse } from "next/server";
import {
  badRequest,
  crmError,
  isoDate,
  oneOf,
  readJson,
  requireCrm,
  crmWriteBranch,
  requireCrmRowAccess,
  str,
} from "@/lib/server/crmApi";
import {
  addActivity,
  getFollowUp,
  saveFollowUp,
} from "@/lib/server/crmStore";
import { FOLLOWUP_TYPES, PRIORITIES } from "@/lib/crm/types";
import { onFollowUpCompleted } from "@/lib/server/crmEvents";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireCrm(req, "manage_followups");
    const { id } = await params;
    const body = await readJson<Record<string, unknown>>(req);
    if (!body) return badRequest("Invalid JSON body.");

    const existing = await getFollowUp(ctx.clinicId, id);
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    requireCrmRowAccess(ctx, existing);

    const action = oneOf(body.action, [
      "complete",
      "reschedule",
      "cancel",
      "reopen",
      "edit",
    ] as const);
    if (!action) return badRequest("An action is required.");
    const now = new Date().toISOString();

    if (action === "complete") {
      if (existing.status === "completed") {
        return NextResponse.json({ ok: true, followUp: existing });
      }
      const updated = await saveFollowUp({
        ...existing,
        status: "completed",
        completed_at: now,
        completion_note: str(body.completion_note, { max: 2000 }),
      });
      await addActivity({
        clinic_id: ctx.clinicId,
        contact_id: updated.contact_id,
        patient_id: updated.patient_id,
        kind: "followup_completed",
        summary: `Follow-up completed: ${updated.title}`,
        detail: updated.completion_note,
        actor_id: ctx.userId,
        branch_id: updated.branch_id,
        ref_id: updated.id,
      });
      await onFollowUpCompleted(updated);
      return NextResponse.json({ ok: true, followUp: updated });
    }

    if (action === "reschedule") {
      const due = isoDate(body.due_at);
      if (!due) return badRequest("A valid new due date is required.");
      const updated = await saveFollowUp({
        ...existing,
        status: "pending",
        due_at: due,
        completed_at: undefined,
        cancelled_at: undefined,
        // Keep the trail of what it used to be due.
        rescheduled_from: [...existing.rescheduled_from, existing.due_at].slice(-10),
      });
      await addActivity({
        clinic_id: ctx.clinicId,
        contact_id: updated.contact_id,
        patient_id: updated.patient_id,
        kind: "followup_rescheduled",
        summary: `Follow-up rescheduled: ${updated.title}`,
        detail: `Now due ${new Date(due).toLocaleString("en-PK")}`,
        actor_id: ctx.userId,
        branch_id: updated.branch_id,
        ref_id: updated.id,
      });
      return NextResponse.json({ ok: true, followUp: updated });
    }

    if (action === "cancel") {
      const updated = await saveFollowUp({
        ...existing,
        status: "cancelled",
        cancelled_at: now,
        cancel_reason: str(body.cancel_reason, { max: 500 }),
      });
      await addActivity({
        clinic_id: ctx.clinicId,
        contact_id: updated.contact_id,
        patient_id: updated.patient_id,
        kind: "followup_cancelled",
        summary: `Follow-up cancelled: ${updated.title}`,
        detail: updated.cancel_reason,
        actor_id: ctx.userId,
        branch_id: updated.branch_id,
        ref_id: updated.id,
      });
      return NextResponse.json({ ok: true, followUp: updated });
    }

    if (action === "reopen") {
      const updated = await saveFollowUp({
        ...existing,
        status: "pending",
        completed_at: undefined,
        cancelled_at: undefined,
        cancel_reason: undefined,
      });
      return NextResponse.json({ ok: true, followUp: updated });
    }

    // action === "edit"
    const updated = await saveFollowUp({
      ...existing,
      title: str(body.title, { max: 200 }) ?? existing.title,
      description:
        body.description !== undefined
          ? str(body.description, { max: 2000 })
          : existing.description,
      type: oneOf(body.type, FOLLOWUP_TYPES) ?? existing.type,
      priority: oneOf(body.priority, PRIORITIES) ?? existing.priority,
      assigned_to:
        body.assigned_to !== undefined
          ? str(body.assigned_to, { max: 64 })
          : existing.assigned_to,
      branch_id: crmWriteBranch(
        ctx,
        body.branch_id !== undefined
          ? str(body.branch_id, { max: 64 })
          : undefined,
        existing.branch_id
      ),
      due_at: isoDate(body.due_at) ?? existing.due_at,
    });
    return NextResponse.json({ ok: true, followUp: updated });
  } catch (err) {
    return crmError(err);
  }
}
