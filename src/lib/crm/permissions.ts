/**
 * CRM permissions - one table, used by BOTH the server routes and the UI.
 *
 * The UI uses these to decide what to render; the API routes use the same
 * functions to decide what to allow. Hiding a button is a courtesy, not a
 * control - every sensitive route calls requireCrm() server-side against the
 * verified session role, so a hand-rolled request gets the same answer as
 * the screen.
 *
 * Roles come from the existing auth system: "admin" (owner/administrator),
 * "front_desk", "doctor".
 */

import type { Role } from "@/lib/types";

export type CrmCapability =
  | "view_crm"
  | "view_all_branches"
  | "view_owner_analytics"
  | "manage_leads"
  | "convert_lead"
  | "manage_followups"
  | "view_conversations"
  | "send_messages"
  | "assign_conversations"
  | "manage_feedback"
  | "resolve_feedback"
  | "manage_templates"
  | "manage_crm_settings";

const MATRIX: Record<Role, CrmCapability[]> = {
  // Owner / administrator: the whole CRM, every branch.
  admin: [
    "view_crm",
    "view_all_branches",
    "view_owner_analytics",
    "manage_leads",
    "convert_lead",
    "manage_followups",
    "view_conversations",
    "send_messages",
    "assign_conversations",
    "manage_feedback",
    "resolve_feedback",
    "manage_templates",
    "manage_crm_settings",
  ],
  // Front desk runs the day-to-day funnel and the inbox.
  front_desk: [
    "view_crm",
    "manage_leads",
    "convert_lead",
    "manage_followups",
    "view_conversations",
    "send_messages",
    "manage_feedback",
  ],
  // Doctors see clinical context and their own follow-ups, not the
  // commercial pipeline or the owner's numbers.
  doctor: [
    "view_crm",
    "manage_followups",
    "view_conversations",
    "manage_feedback",
  ],
};

export function crmCan(
  role: Role | string | undefined,
  capability: CrmCapability
): boolean {
  if (!role) return false;
  const caps = MATRIX[role as Role];
  return !!caps && caps.includes(capability);
}

/** Capabilities for a role - handy for passing a set to the client once. */
export function crmCapabilities(role: Role | string | undefined): CrmCapability[] {
  if (!role) return [];
  return MATRIX[role as Role] ?? [];
}

/**
 * Whether a role may see rows it does not own.
 *
 * Front desk and doctors see their own branch's work; only an owner sees
 * across branches. Returning undefined means "no branch restriction".
 */
export function branchScopeFor(
  role: Role | string | undefined,
  userBranchId: string | undefined
): string | undefined {
  if (crmCan(role, "view_all_branches")) return undefined;
  return userBranchId;
}
