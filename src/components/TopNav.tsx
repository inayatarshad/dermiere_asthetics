"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Users, Settings, LogOut, RadioTower } from "lucide-react";
import { useStore, useSessionUser, can } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/format";
import { Logo } from "./ui";

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSessionUser();
  const clinic = useStore((s) => s.clinic);
  const logout = useStore((s) => s.logout);
  const boothLink = useStore((s) => s.boothLink);
  const setBoothLink = useStore((s) => s.setBoothLink);

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/patients", label: "Patients", icon: Users },
    ...(can.manageUsers(user?.role)
      ? [{ href: "/settings", label: "Settings", icon: Settings }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 px-4 pt-4 no-print">
      <div className="glass-strong mx-auto max-w-7xl flex items-center gap-2 px-4 py-2.5">
        <Link href="/dashboard" className="mr-2">
          <Logo size="sm" />
        </Link>

        <nav className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-mint-500 text-white shadow-md"
                    : "text-ink-700 hover:bg-mint-100"
                }`}
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Booth link: poll the booth inbox for phone-registered patients */}
        <button
          onClick={() => setBoothLink(!boothLink)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
            boothLink
              ? "bg-mint-500 text-white shadow-md"
              : "text-ink-700 hover:bg-mint-100 border border-white/70"
          }`}
          title={
            boothLink
              ? "Booth link is ON: this screen receives patients registered on other devices"
              : "Turn on to receive patients registered on the booth phone"
          }
          aria-pressed={boothLink}
        >
          <RadioTower size={13} className={boothLink ? "animate-pulse" : ""} />
          <span className="hidden sm:inline">
            Booth link{boothLink ? ": ON" : ""}
          </span>
        </button>

        {clinic && (
          <span className="hidden md:inline-flex chip chip-static text-xs">
            {clinic.name}
          </span>
        )}

        {user && (
          <div className="flex items-center gap-2 pl-2 border-l border-white/60">
            <div className="text-right leading-tight hidden sm:block">
              <div className="text-sm font-medium text-ink-900">
                {user.name}
              </div>
              <div className="text-[11px] text-ink-400">
                {ROLE_LABELS[user.role]}
              </div>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                logout();
                router.replace("/");
              }}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
