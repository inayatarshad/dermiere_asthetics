"use client";

/**
 * CRM shell.
 *
 * A CRM account already has these sections in the PRIMARY top bar, so this
 * renders nothing extra — one navigation bar, never two. The secondary strip
 * exists only for Clinic OS accounts, who arrive through a single "CRM"
 * entry in their own bar and need a way to move between CRM sections.
 *
 * Items come from CRM_NAV and are filtered by the same capability table the
 * API enforces, so both bars and the server agree on what a role can open.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSessionUser } from "@/lib/store";
import { crmCan } from "@/lib/crm/permissions";
import { CRM_NAV, isCrmNavActive } from "@/lib/crm/nav";

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useSessionUser();

  // The primary bar is already the CRM bar for these users.
  if (user?.workspace === "crm") return <>{children}</>;

  const tabs = CRM_NAV.filter((t) => crmCan(user?.role, t.capability));

  return (
    <div className="space-y-5">
      <nav
        className="glass-subtle flex flex-wrap items-center gap-1 p-1.5"
        aria-label="CRM sections"
      >
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isCrmNavActive(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? "bg-ink-900 text-[#F6EBD3] shadow-md"
                  : "text-ink-700 hover:bg-mint-100"
              }`}
            >
              <Icon size={15} />
              {label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
