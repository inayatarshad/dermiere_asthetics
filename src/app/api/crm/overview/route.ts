/**
 * GET /api/crm/overview - every number on the CRM dashboard.
 *
 * Computed server-side from the caller's clinic only, then filtered by the
 * date range and branch in the query string. Owner-only: the full
 * cross-branch picture is a "view_owner_analytics" capability, and a role
 * without it gets a 403 here regardless of what the UI showed.
 */

import { NextResponse } from "next/server";
import { crmError, requireCrm } from "@/lib/server/crmApi";
import {
  listContacts,
  listConversations,
  listFeedback,
  listFollowUps,
  listAllMessages,
} from "@/lib/server/crmStore";
import { pgListAppointments, pgListRecords } from "@/lib/server/db";
import { getClinicConfig } from "@/lib/server/clinicStore";
import { computeAnalytics } from "@/lib/crm/analytics";
import type { Appointment, Invoice, Patient } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const ctx = await requireCrm(req, "view_owner_analytics");
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;
    const branchId = url.searchParams.get("branch") || undefined;

    const [
      contacts,
      followUps,
      feedback,
      conversations,
      messages,
      patients,
      appointments,
      invoices,
      config,
    ] = await Promise.all([
      listContacts(ctx.clinicId),
      listFollowUps(ctx.clinicId),
      listFeedback(ctx.clinicId),
      listConversations(ctx.clinicId),
      listAllMessages(ctx.clinicId),
      pgListRecords<Patient>(ctx.clinicId, "patients"),
      pgListAppointments<Appointment>(ctx.clinicId),
      pgListRecords<Invoice>(ctx.clinicId, "invoices"),
      getClinicConfig(ctx.clinicId),
    ]);

    const analytics = computeAnalytics({
      contacts,
      followUps,
      feedback,
      conversations,
      messages,
      patients,
      appointments,
      invoices,
      range: { from, to },
      branchId,
    });

    return NextResponse.json({
      ok: true,
      analytics,
      // Branches come from the clinic config, so a new branch appears here
      // the moment it is added in Settings.
      branches: config?.locations ?? [],
      range: { from: from ?? null, to: to ?? null, branchId: branchId ?? null },
    });
  } catch (err) {
    return crmError(err);
  }
}
