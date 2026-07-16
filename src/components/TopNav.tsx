"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ChartColumn,
  Compass,
  Settings,
  LogOut,
  RadioTower,
  Check,
  ExternalLink,
  ShoppingBag,
  MessageSquareHeart,
} from "lucide-react";
import { useStore, useSessionUser, can } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/format";
import { Logo, Modal, Spinner } from "./ui";

/** true = booth storage reachable; false = server says not_configured */
async function probeBoothStorage(): Promise<boolean> {
  try {
    const r = await fetch("/api/booth/pull", { cache: "no-store" });
    if (r.ok) return true;
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    return d.error !== "not_configured";
  } catch {
    // transient network problems should not block the toggle; the
    // background agent copes with flaky wifi
    return true;
  }
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSessionUser();
  const clinic = useStore((s) => s.clinic);
  const logout = useStore((s) => s.logout);
  const boothLink = useStore((s) => s.boothLink);
  const setBoothLink = useStore((s) => s.setBoothLink);
  const setBoothAvailable = useStore((s) => s.setBoothAvailable);
  const [boothChecking, setBoothChecking] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [recheckState, setRecheckState] = useState<"idle" | "checking" | "still_missing">("idle");

  const toggleBooth = async () => {
    if (boothLink) {
      setBoothLink(false);
      return;
    }
    // Probe BEFORE enabling, so the toggle never flicks on-then-off.
    setBoothChecking(true);
    const ok = await probeBoothStorage();
    setBoothChecking(false);
    if (ok) {
      setBoothAvailable(true);
      setBoothLink(true);
    } else {
      setBoothAvailable(false);
      setRecheckState("idle");
      setSetupOpen(true);
    }
  };

  const recheck = async () => {
    setRecheckState("checking");
    const ok = await probeBoothStorage();
    if (ok) {
      setBoothAvailable(true);
      setBoothLink(true);
      setSetupOpen(false);
      setRecheckState("idle");
    } else {
      setRecheckState("still_missing");
    }
  };

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/patients", label: "Patients", icon: Users },
    { href: "/calendar", label: "Calendar", icon: CalendarDays },
    // POS is front-of-house: front desk + admin ring up the visit
    ...(user?.role !== "doctor"
      ? [{ href: "/pos", label: "Point of Sale", icon: ShoppingBag }]
      : []),
    // Reviews monitoring: doctors + admins watch the client voice
    ...(user?.role !== "front_desk"
      ? [{ href: "/reviews", label: "Reviews", icon: MessageSquareHeart }]
      : []),
    ...(can.manageUsers(user?.role)
      ? [
          { href: "/analytics", label: "Analytics", icon: ChartColumn },
          { href: "/discovery", label: "Discovery", icon: Compass },
          { href: "/settings", label: "Settings", icon: Settings },
        ]
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
                    ? "bg-ink-900 text-[#F6EBD3] shadow-md"
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
          onClick={() => void toggleBooth()}
          disabled={boothChecking}
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
          {boothChecking ? (
            <Spinner className="w-3 h-3" />
          ) : (
            <RadioTower size={13} className={boothLink ? "animate-pulse" : ""} />
          )}
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

      {/* One-time booth storage setup guide (shown instead of a toggle
          that silently refuses to stay on) */}
      <Modal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        title="Booth link: one-time setup"
      >
        <p className="text-sm text-ink-700 leading-relaxed">
          The booth link moves patients between devices through a small
          storage space on your Vercel project. This deployment does not have
          one yet, so the link cannot switch on. It takes about two minutes:
        </p>
        <ol className="mt-4 space-y-2.5 text-sm text-ink-700 list-none">
          {[
            <>
              Open{" "}
              <a
                className="text-mint-500 font-medium inline-flex items-center gap-1"
                href="https://vercel.com"
                target="_blank"
                rel="noreferrer"
              >
                vercel.com <ExternalLink size={12} />
              </a>{" "}
              and open your <b>aesthetics</b> project.
            </>,
            <>
              Go to the <b>Storage</b> tab, choose <b>Create Database</b>, and
              pick <b>Blob</b>.
            </>,
            <>
              Name it anything (e.g. <b>contour-booth</b>) and <b>Connect</b>{" "}
              it to the project when asked.
            </>,
            <>
              Redeploy so the new storage key takes effect: <b>Deployments</b>,
              latest deployment, <b>Redeploy</b>. Or simply ask Claude to
              trigger it.
            </>,
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-mint-100 text-ink-700 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        {recheckState === "still_missing" && (
          <p className="caption mt-4">
            Still not reachable. If you just connected the store, the redeploy
            step is the missing piece; check again once it finishes.
          </p>
        )}
        <div className="flex gap-2 justify-end mt-6">
          <button className="btn btn-ghost" onClick={() => setSetupOpen(false)}>
            Later
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void recheck()}
            disabled={recheckState === "checking"}
          >
            {recheckState === "checking" ? (
              <Spinner className="w-4 h-4" />
            ) : (
              <Check size={15} />
            )}
            Check again
          </button>
        </div>
      </Modal>
    </header>
  );
}
