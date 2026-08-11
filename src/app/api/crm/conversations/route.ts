/**
 * GET /api/crm/conversations - the shared inbox list.
 *
 * Returns conversations joined to the contact they belong to, plus the
 * provider status so the UI can state plainly which messaging backend is
 * live. It never exposes provider credentials - only id, label and whether
 * a real channel is connected.
 */

import { NextResponse } from "next/server";
import { crmError, crmScopeRows, requireCrm } from "@/lib/server/crmApi";
import {
  listContacts,
  listConversations,
  listTemplates,
} from "@/lib/server/crmStore";
import { listAssignableStaff, getClinicConfig } from "@/lib/server/clinicStore";
import { providerStatus } from "@/lib/server/messaging";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const ctx = await requireCrm(req, "view_conversations");
    const [conversations, contacts, staff, config, templates] = await Promise.all([
      listConversations(ctx.clinicId),
      listContacts(ctx.clinicId),
      listAssignableStaff(ctx.clinicId),
      getClinicConfig(ctx.clinicId),
      listTemplates(ctx.clinicId),
    ]);

    const scopedConversations = crmScopeRows(ctx, conversations);
    const scopedContacts = crmScopeRows(ctx, contacts);
    const byId = new Map(scopedContacts.map((c) => [c.id, c]));

    return NextResponse.json({
      ok: true,
      conversations: scopedConversations.map((c) => {
        const contact = byId.get(c.contact_id);
        return {
          ...c,
          contact: contact
            ? {
                id: contact.id,
                name: contact.name,
                phone: contact.phone,
                stage: contact.stage,
                patient_id: contact.patient_id,
                opted_out: !!contact.opted_out_at,
              }
            : null,
        };
      }),
      staff: staff.map((s) => ({ id: s.id, name: s.name, role: s.role })),
      branches: ctx.branchId
        ? (config?.locations ?? []).filter((branch) => branch.id === ctx.branchId)
        : config?.locations ?? [],
      templates,
      provider: providerStatus(),
      me: ctx.userId,
      scopeBranchId: ctx.branchId ?? null,
    });
  } catch (err) {
    return crmError(err);
  }
}
