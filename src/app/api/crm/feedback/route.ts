/**
 * /api/crm/feedback
 *
 *   GET    all feedback plus the staff/branch context the UI renders with
 *   POST   record feedback (also used by the branded feedback form)
 *   PATCH  service recovery: assign, progress, resolve
 *
 * Extends the clinic's existing review capture rather than replacing it: a
 * feedback row can carry the review invite token it came from, and the
 * structured per-branch / per-doctor / per-treatment ratings live here.
 */

import { NextResponse } from "next/server";
import {
  badRequest,
  crmError,
  num,
  oneOf,
  readJson,
  requireCrm,
  str,
} from "@/lib/server/crmApi";
import {
  addActivity,
  getFeedback,
  listFeedback,
  newId,
  saveFeedback,
} from "@/lib/server/crmStore";
import { listStaff, getClinicConfig } from "@/lib/server/clinicStore";
import { crmCan } from "@/lib/crm/permissions";
import { AuthError } from "@/lib/server/auth";
import { LOW_RATING_THRESHOLD, RECOVERY_STATUSES } from "@/lib/crm/types";
import {
  onFeedbackLowRating,
  onFeedbackReceived,
  onFeedbackResolved,
} from "@/lib/server/crmEvents";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const ctx = await requireCrm(req, "manage_feedback");
    const [feedback, staff, config] = await Promise.all([
      listFeedback(ctx.clinicId),
      listStaff(ctx.clinicId),
      getClinicConfig(ctx.clinicId),
    ]);
    return NextResponse.json({
      ok: true,
      feedback,
      staff: staff.map((s) => ({ id: s.id, name: s.name, role: s.role })),
      branches: config?.locations ?? [],
      lowRatingThreshold: LOW_RATING_THRESHOLD,
      me: ctx.userId,
    });
  } catch (err) {
    return crmError(err);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCrm(req, "manage_feedback");
    const body = await readJson<Record<string, unknown>>(req);
    if (!body) return badRequest("Invalid JSON body.");

    const overall = num(body.overall_rating, 1, 5);
    if (overall === undefined) {
      return badRequest("An overall rating between 1 and 5 is required.");
    }

    const low = overall <= LOW_RATING_THRESHOLD;
    const feedback = await saveFeedback({
      id: newId(),
      clinic_id: ctx.clinicId,
      contact_id: str(body.contact_id, { max: 64 }),
      patient_id: str(body.patient_id, { max: 64 }),
      branch_id: str(body.branch_id, { max: 64 }),
      doctor_id: str(body.doctor_id, { max: 64 }),
      invite_token: str(body.invite_token, { max: 120 }),
      overall_rating: overall,
      branch_rating: num(body.branch_rating, 1, 5),
      doctor_rating: num(body.doctor_rating, 1, 5),
      treatment_rating: num(body.treatment_rating, 1, 5),
      treatment_id: str(body.treatment_id, { max: 64 }),
      comment: str(body.comment, { max: 4000 }),
      // A low score opens a service-recovery case automatically — that is
      // the whole point of tracking it.
      recovery_status: low ? "open" : "none",
      created_at: new Date().toISOString(),
    });

    await addActivity({
      clinic_id: ctx.clinicId,
      contact_id: feedback.contact_id,
      patient_id: feedback.patient_id,
      kind: "feedback",
      summary: `Feedback received — ${overall}/5`,
      detail: feedback.comment,
      branch_id: feedback.branch_id,
      ref_id: feedback.id,
    });

    await onFeedbackReceived(feedback);
    if (low) await onFeedbackLowRating(feedback);

    return NextResponse.json({ ok: true, feedback });
  } catch (err) {
    return crmError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await requireCrm(req, "manage_feedback");
    const body = await readJson<Record<string, unknown>>(req);
    if (!body) return badRequest("Invalid JSON body.");

    const id = str(body.id, { max: 64 });
    if (!id) return badRequest("A feedback id is required.");
    const existing = await getFeedback(ctx.clinicId, id);
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const status = oneOf(body.recovery_status, RECOVERY_STATUSES);
    if (status === "resolved" && !crmCan(ctx.role, "resolve_feedback")) {
      throw new AuthError(403, "Your role cannot close a service-recovery case.");
    }

    const resolving = status === "resolved" && existing.recovery_status !== "resolved";
    const updated = await saveFeedback({
      ...existing,
      recovery_status: status ?? existing.recovery_status,
      assigned_to:
        body.assigned_to !== undefined
          ? str(body.assigned_to, { max: 64 })
          : existing.assigned_to,
      resolution_note:
        body.resolution_note !== undefined
          ? str(body.resolution_note, { max: 4000 })
          : existing.resolution_note,
      resolved_at: resolving ? new Date().toISOString() : existing.resolved_at,
      resolved_by: resolving ? ctx.userId : existing.resolved_by,
    });

    if (resolving) {
      await addActivity({
        clinic_id: ctx.clinicId,
        contact_id: updated.contact_id,
        patient_id: updated.patient_id,
        kind: "feedback",
        summary: "Service-recovery case resolved",
        detail: updated.resolution_note,
        actor_id: ctx.userId,
        branch_id: updated.branch_id,
        ref_id: updated.id,
      });
      await onFeedbackResolved(updated);
    }

    return NextResponse.json({ ok: true, feedback: updated });
  } catch (err) {
    return crmError(err);
  }
}
