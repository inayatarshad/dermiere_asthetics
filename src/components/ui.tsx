"use client";

/**
 * UI primitives — the glassmorphic mint component set
 * (knowledge base / 08_design-system.md §6).
 */

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function GlassCard({
  children,
  className = "",
  strong = false,
  hover = false,
  onClick,
  ref,
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
  hover?: boolean;
  onClick?: () => void;
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      onClick={onClick}
      className={`${strong ? "glass-strong" : "glass"} ${
        hover ? "card-hover cursor-pointer" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  sub,
  action,
  className = "",
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
      <div>
        <h2 className="h2 text-ink-900">{title}</h2>
        {sub && <p className="caption mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  accent = false,
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="glass p-5 flex items-center gap-4">
      {icon && (
        <div
          className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
            accent ? "bg-mint-500 text-white" : "bg-mint-100 text-ink-700"
          }`}
        >
          {icon}
        </div>
      )}
      <div>
        <div className="text-2xl font-medium text-ink-900 leading-tight">
          {value}
        </div>
        <div className="caption">{label}</div>
      </div>
    </div>
  );
}

export function Chip({
  children,
  active = false,
  onClick,
  className = "",
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`chip ${active ? "chip-active" : ""} ${
        onClick ? "" : "chip-static"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`toggle ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    />
  );
}

export function Field({
  label,
  children,
  className = "",
  hint,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  hint?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="caption mt-1 block">{hint}</span>}
    </label>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass-subtle flex flex-col items-center justify-center text-center px-8 py-12 gap-3">
      {icon && <div className="text-ink-400">{icon}</div>}
      <div className="font-medium text-ink-700">{title}</div>
      {body && <p className="caption max-w-sm">{body}</p>}
      {action}
    </div>
  );
}

export function Spinner({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <span
      className={`inline-block rounded-full border-2 border-mint-200 border-t-mint-500 ${className}`}
      style={{ animation: "spin-slow 0.8s linear infinite" }}
      aria-label="Loading"
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  // Portal to <body>: position:fixed resolves against the nearest transformed
  // ancestor, and page sections animate with fade-up transforms — rendered
  // in place, the overlay covers the section instead of the viewport (the
  // broken top-glued modal the owner screenshotted on Analytics). The body
  // has no transform, so the overlay always spans the real viewport and
  // paints above the sticky nav (z-40).
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(14, 42, 38, 0.35)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className={`glass-strong fade-up w-full ${
          wide ? "max-w-3xl" : "max-w-lg"
        } max-h-[92vh] overflow-y-auto p-6`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between mb-4">
          {title && <h3 className="h2 text-ink-900">{title}</h3>}
          <button
            className="btn btn-ghost btn-sm -mr-2"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

const STATUS_STYLES: Record<string, string> = {
  proposed: "bg-mint-100 text-ink-700",
  accepted: "bg-mint-200 text-ink-900",
  in_progress: "bg-mint-500 text-white",
  done: "bg-ink-900 text-white",
  open: "bg-mint-500 text-white",
  completed: "bg-ink-900 text-white",
};

const STATUS_LABELS: Record<string, string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  in_progress: "In progress",
  done: "Done",
  open: "Open",
  completed: "Completed",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
        STATUS_STYLES[status] ?? "bg-mint-100 text-ink-700"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/**
 * Brand lockup: the CAPTURE wordmark (official black logo from capture.cc)
 * stacked over a champagne-gold "Clinic OS" line — two-line lockup so the
 * operational product reads separately from the retail brand.
 */
export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dims =
    size === "lg" ? "h-8" : size === "sm" ? "h-[18px]" : "h-[22px]";
  const tag =
    size === "lg" ? "text-[11px] mt-1.5" : size === "sm" ? "text-[7.5px] mt-[3px]" : "text-[9px] mt-1";
  return (
    <span className="inline-flex flex-col items-start select-none leading-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/capture-logo-black.png"
        alt="Capture"
        className={`${dims} w-auto shrink-0`}
        draggable={false}
      />
      <span
        className={`${tag} font-medium uppercase tracking-[0.3em] text-[color:var(--mint-500)]`}
      >
        Clinic&nbsp;OS
      </span>
    </span>
  );
}
