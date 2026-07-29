/**
 * /api/crm/contacts/[id] — one lead/contact plus its unified timeline.
 *
 *   GET    the contact, its timeline, follow-ups, conversations and feedback
 *   PATCH  edit fields, move pipeline stage, or convert to a patient
 *
 * The timeline is assembled from CRM activity AND the clinical record the
 * app already holds (appointments, invoices, treatment plans), so it is one
 * history of the person rather than a second, disconnected CRM view of them.
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
  strList,
} from "@/lib/server/crmApi";
import {
  addActivity,
  getContact,
  listActivitiesFor,
  listConversations,
  listFeedback,
  listFollowUps,
  moveContactStage,
  saveContact,
} from "@/lib/server/crmStore";
import { pgListAppointments, pgListRecords, pgUpsertRecord } from "@/lib/server/db";
import { crmCan } from "@/lib/crm/permissions";
import { AuthError } from "@/lib/server/auth";
import {
  LEAD_SOURCES,
  LOST_REASONS,
  isStage,
  type CrmActivity,
} from "@/lib/crm/types";
import type {
  Appointment,
  Consultation,
  Invoice,
  Patient,
  TreatmentPlan,
} from "@/lib/types";
import { normalizePhone } from "@/lib/crm/phone";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireCrm(req, "view_crm");
    const { id } = await params;
    const contact = await getContact(ctx.clinicId, id);
    if (!contact) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const [
      activities,
      followUps,
      conversations,
      feedback,
      appointments,
      invoices,
      plans,
      consultations,
    ] = await Promise.all([
        listActivitiesFor(ctx.clinicId, {
          contactId: id,
          patientId: contact.patient_id,
        }),
        listFollowUps(ctx.clinicId),
        listConversations(ctx.clinicId),
        listFeedback(ctx.clinicId),
        pgListAppointments<Appointment>(ctx.clinicId),
        pgListRecords<Invoice>(ctx.clinicId, "invoices"),
        pgListRecords<TreatmentPlan>(ctx.clinicId, "plans"),
        pgListRecords<Consultation>(ctx.clinicId, "consultations"),
      ]);

    // --- fold the clinical record into the same timeline ----------------
    const derived: CrmActivity[] = [];
    if (contact.patient_id) {
      for (const a of appointments) {
        if (a.patient_id !== contact.patient_id) continue;
        derived.push({
          id: `appt_${a.id}`,
          clinic_id: ctx.clinicId,
          contact_id: contact.id,
          patient_id: contact.patient_id,
          kind: a.status === "completed" ? "visit" : "appointment",
          summary:
            a.status === "completed"
              ? `Visit completed — ${a.type.replace(/_/g, " ")}`
              : `Appointment ${a.status.replace(/_/g, " ")} — ${a.type.replace(/_/g, " ")}`,
          detail: a.notes,
          branch_id: a.location_id,
          ref_id: a.id,
          created_at: a.start,
        });
      }
      for (const inv of invoices) {
        if (inv.patient_id !== contact.patient_id) continue;
        derived.push({
          id: `inv_${inv.id}`,
          clinic_id: ctx.clinicId,
          contact_id: contact.id,
          patient_id: contact.patient_id,
          kind: "invoice",
          summary: `Invoice ${inv.number} — Rs. ${inv.total.toLocaleString("en-PK")}`,
          branch_id: inv.location_id,
          ref_id: inv.id,
          created_at: inv.created_at,
        });
      }
      // A plan reaches its patient through the consultation it came out of.
      const patientConsultIds = new Set(
        consultations
          .filter((c) => c.patient_id === contact.patient_id)
          .map((c) => c.id)
      );
      for (const p of plans) {
        if (!patientConsultIds.has(p.consultation_id)) continue;
        derived.push({
          id: `plan_${p.id}`,
          clinic_id: ctx.clinicId,
          contact_id: contact.id,
          patient_id: contact.patient_id,
          kind: "treatment_plan",
          summary: "Treatment plan created",
          ref_id: p.id,
          created_at: p.created_at,
        });
      }
    }

    const timeline = [...activities, ...derived].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );

    // The registry record itself, so the CRM can show a patient's clinical
    // detail in place instead of bouncing to a Clinic OS screen a CRM
    // account is not allowed to open.
    const patient = contact.patient_id
      ? (await pgListRecords<Patient>(ctx.clinicId, "patients")).find(
          (p) => p.id === contact.patient_id
        ) ?? null
      : null;

    const patientAppointments = contact.patient_id
      ? appointments
          .filter((a) => a.patient_id === contact.patient_id)
          .sort((a, b) => b.start.localeCompare(a.start))
      : [];
    const patientInvoices = contact.patient_id
      ? invoices
          .filter((i) => i.patient_id === contact.patient_id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
      : [];

    return NextResponse.json({
      ok: true,
      contact,
      patient,
      // A compact clinical summary the CRM can render without a second call.
      patientSummary: patient
        ? {
            visits: patientAppointments.filter((a) => a.status === "completed")
              .length,
            upcoming: patientAppointments.filter(
              (a) => a.status === "booked" || a.status === "confirmed"
            ).length,
            noShows: patientAppointments.filter((a) => a.status === "no_show")
              .length,
            lastVisit:
              patientAppointments.find((a) => a.status === "completed")?.start ??
              null,
            totalBilled: patientInvoices
              .filter((i) => i.status === "paid")
              .reduce((s, i) => s + (i.total ?? 0), 0),
            invoiceCount: patientInvoices.filter((i) => i.status === "paid")
              .length,
          }
        : null,
      timeline,
      followUps: followUps.filter(
        (f) =>
          f.contact_id === id ||
          (contact.patient_id && f.patient_id === contact.patient_id)
      ),
      conversations: conversations.filter((c) => c.contact_id === id),
      feedback: feedback.filter(
        (f) =>
          f.contact_id === id ||
          (contact.patient_id && f.patient_id === contact.patient_id)
      ),
    });
  } catch (err) {
    return crmError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireCrm(req, "manage_leads");
    const { id } = await params;
    const body = await readJson<Record<string, unknown>>(req);
    if (!body) return badRequest("Invalid JSON body.");

    const existing = await getContact(ctx.clinicId, id);
    if (!existing) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // --- stage move (its own operation so it is always logged) ----------
    if (body.stage !== undefined) {
      if (!isStage(body.stage)) return badRequest("Unknown pipeline stage.");
      if (body.stage === "won" && !crmCan(ctx.role, "convert_lead")) {
        throw new AuthError(403, "Your role cannot convert leads.");
      }
      const moved = await moveContactStage(
        ctx.clinicId,
        id,
        body.stage,
        ctx.userId,
        {
          lost_reason: oneOf(body.lost_reason, LOST_REASONS),
          lost_note: str(body.lost_note, { max: 1000 }),
        }
      );
      if (Object.keys(body).length === 1 || onlyLostFields(body)) {
        return NextResponse.json({ ok: true, contact: moved });
      }
    }

    // --- field edits -----------------------------------------------------
    const current = (await getContact(ctx.clinicId, id))!;
    const phone = str(body.phone, { max: 40 });
    const updated = await saveContact({
      ...current,
      name: str(body.name, { max: 120 }) ?? current.name,
      phone: phone ?? current.phone,
      phone_norm: phone ? normalizePhone(phone) : current.phone_norm,
      email: body.email !== undefined ? str(body.email, { max: 160 }) : current.email,
      city: body.city !== undefined ? str(body.city, { max: 80 }) : current.city,
      gender: oneOf(body.gender, ["female", "male", "other"] as const) ?? current.gender,
      source: oneOf(body.source, LEAD_SOURCES) ?? current.source,
      treatment_interest:
        body.treatment_interest !== undefined
          ? strList(body.treatment_interest, 10)
          : current.treatment_interest,
      assigned_to:
        body.assigned_to !== undefined
          ? str(body.assigned_to, { max: 64 })
          : current.assigned_to,
      branch_id:
        body.branch_id !== undefined
          ? str(body.branch_id, { max: 64 })
          : current.branch_id,
      tags: body.tags !== undefined ? strList(body.tags, 12) : current.tags,
      notes: body.notes !== undefined ? str(body.notes, { max: 4000 }) : current.notes,
      estimated_value:
        body.estimated_value !== undefined
          ? num(body.estimated_value, 0, 100_000_000)
          : current.estimated_value,
      marketing_opt_in:
        typeof body.marketing_opt_in === "boolean"
          ? body.marketing_opt_in
          : current.marketing_opt_in,
      opted_out_at:
        body.opted_out === true
          ? current.opted_out_at ?? new Date().toISOString()
          : body.opted_out === false
          ? undefined
          : current.opted_out_at,
    });

    if (body.assigned_to !== undefined && body.assigned_to !== current.assigned_to) {
      await addActivity({
        clinic_id: ctx.clinicId,
        contact_id: id,
        patient_id: updated.patient_id,
        kind: "assignment",
        summary: "Lead reassigned",
        actor_id: ctx.userId,
        branch_id: updated.branch_id,
        ref_id: id,
      });
    }
    if (typeof body.note_append === "string" && body.note_append.trim()) {
      await addActivity({
        clinic_id: ctx.clinicId,
        contact_id: id,
        patient_id: updated.patient_id,
        kind: "note",
        summary: "Note added",
        detail: body.note_append.trim().slice(0, 2000),
        actor_id: ctx.userId,
        branch_id: updated.branch_id,
        ref_id: id,
      });
    }

    return NextResponse.json({ ok: true, contact: updated });
  } catch (err) {
    return crmError(err);
  }
}

function onlyLostFields(body: Record<string, unknown>): boolean {
  return Object.keys(body).every((k) =>
    ["stage", "lost_reason", "lost_note"].includes(k)
  );
}

/**
 * POST /api/crm/contacts/[id] — convert this lead into a patient.
 *
 * Reuses the existing `patients` collection rather than creating a parallel
 * one, and links the two by id, so converting does NOT re-enter the person:
 * an already-linked contact simply returns its patient.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireCrm(req, "convert_lead");
    const { id } = await params;
    const contact = await getContact(ctx.clinicId, id);
    if (!contact) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (contact.patient_id) {
      return NextResponse.json({
        ok: true,
        alreadyLinked: true,
        contact,
        patient_id: contact.patient_id,
      });
    }

    // An existing patient with the same number is the same person — link to
    // them instead of creating a duplicate patient record.
    const patients = await pgListRecords<Patient>(ctx.clinicId, "patients");
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
        clinic_id: ctx.clinicId,
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
      await pgUpsertRecord(ctx.clinicId, "patients", patientId, patient);
    }

    const updated = await saveContact({
      ...contact,
      patient_id: patientId,
      stage: "won",
    });
    await addActivity({
      clinic_id: ctx.clinicId,
      contact_id: id,
      patient_id: patientId,
      kind: "converted",
      summary: match
        ? "Linked to an existing patient record"
        : "Converted to a patient",
      actor_id: ctx.userId,
      branch_id: contact.branch_id,
      ref_id: patientId,
    });

    return NextResponse.json({
      ok: true,
      contact: updated,
      patient_id: patientId,
      linkedExisting: !!match,
    });
  } catch (err) {
    return crmError(err);
  }
}
