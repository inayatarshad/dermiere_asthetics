/**
 * The CRM workspace navigation - defined once, rendered in exactly one place.
 *
 * A CRM account sees these items in the PRIMARY top bar; there is no second
 * navigation strip beneath it. A Clinic OS account reaches the same screens
 * through a single "CRM" entry in its own top bar.
 *
 * Items are filtered by the same capability table the API enforces, so the
 * bar and the server agree on what a role can open.
 *
 * Follow-ups and Feedback are deliberately absent. The four automations run
 * themselves and write into the Inbox, so a separate board of things to
 * chase is a list nobody needs to work; feedback arrives as a message in
 * the same thread as everything else. Both remain reachable by URL.
 */

import {
  ChartColumn,
  ChartPie,
  Contact,
  Inbox,
  KanbanSquare,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import type { CrmCapability } from "./permissions";

export interface CrmNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  capability: CrmCapability;
}

export const CRM_NAV: CrmNavItem[] = [
  { href: "/crm", label: "Overview", icon: ChartPie, capability: "view_crm" },
  { href: "/crm/leads", label: "Leads", icon: KanbanSquare, capability: "manage_leads" },
  { href: "/crm/patients", label: "Patients", icon: Contact, capability: "view_crm" },
  { href: "/crm/inbox", label: "Inbox", icon: Inbox, capability: "view_conversations" },
  { href: "/crm/settings", label: "Templates", icon: Settings2, capability: "manage_templates" },
];

/**
 * Is this nav item the active one?
 *
 * "/crm" is the workspace root, so it must match exactly - otherwise it
 * would light up on every child route.
 */
export function isCrmNavActive(href: string, pathname: string): boolean {
  if (href === "/crm") return pathname === "/crm";
  return pathname === href || pathname.startsWith(`${href}/`);
}
