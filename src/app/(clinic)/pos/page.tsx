"use client";

/**
 * CAPTURE Point of Sale - the visit closes here (§5.3 + §5.5 redemption).
 * Build the bill from treatments + retail, apply a Capture Circle code,
 * record the payment (cash/card, record-only) and hand off to the printed
 * A4 invoice and the review link - the full end-of-visit ritual.
 */

import { useMemo, useState } from "react";
import {
  ShoppingBag,
  Sparkles,
  Package,
  Layers,
  Search,
  Plus,
  Minus,
  X,
  Ticket,
  Printer,
  Star,
  RotateCcw,
  Banknote,
  CreditCard,
  CalendarCheck2,
  Trash2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { formatPkr, CAPTURE_TREATMENTS, CAPTURE_PRODUCTS, findTreatment } from "@/lib/capture/kb";
import type { Invoice, InvoiceItem, PaymentMethod } from "@/lib/types";
import { derivePatientBranches } from "@/lib/patientBranch";
import { Modal, Spinner } from "@/components/ui";

type Tab = "treatments" | "products" | "regimens";

interface CartLine {
  ref: string;
  kind: InvoiceItem["kind"];
  name: string;
  qty: number;
  unitPrice: number;
}

interface AppliedReward {
  code: string;
  value: number;
  patient_name: string;
}

export default function PosPage() {
  const mounted = useMounted();
  const patients = useStore((s) => s.patients);
  const locations = useStore((s) => s.locations);
  const taxRate = useStore((s) => s.taxRate);
  const prices = useStore((s) => s.prices);
  const invoices = useStore((s) => s.invoices);
  const appointments = useStore((s) => s.appointments);
  const addInvoice = useStore((s) => s.addInvoice);
  const nextInvoiceNumber = useStore((s) => s.nextInvoiceNumber);
  const markRewardRedeemed = useStore((s) => s.markRewardRedeemed);
  const users = useStore((s) => s.users);
  const sessionUserId = useStore((s) => s.sessionUserId);

  const me = users.find((u) => u.id === sessionUserId);
  const assignedLocationId =
    me?.branch_id && locations.some((location) => location.id === me.branch_id)
      ? me.branch_id
      : null;

  const [tab, setTab] = useState<Tab>("treatments");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [clientName, setClientName] = useState("");
  /** Explicitly picked patient record (beats name matching). */
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Default to the clinic's own first site once config loads. A hardcoded
  // id belonging to another clinic matched nothing and emptied the till list.
  // Empty means "not chosen yet"; the clinic's first site is used until the
  // user picks one. Derived rather than synced, so config arriving late needs
  // no effect and cannot cause a cascading render.
  const [pickedLocation, setPickedLocation] = useState("");
  const locationId = assignedLocationId || pickedLocation || locations[0]?.id || "";
  const [codeInput, setCodeInput] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [applied, setApplied] = useState<AppliedReward | null>(null);
  /** Cashier-entered flat discount in PKR (no code needed). */
  const [flatDiscount, setFlatDiscount] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [received, setReceived] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [done, setDone] = useState<Invoice | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  const patientBranches = useMemo(
    () => derivePatientBranches(patients, appointments, invoices),
    [appointments, invoices, patients]
  );
  const availablePatients = useMemo(
    () =>
      assignedLocationId
        ? patients.filter(
            (patient) => patientBranches.get(patient.id) === assignedLocationId
          )
        : patients,
    [assignedLocationId, patientBranches, patients]
  );

  // Picker suggestions: branch-scoped name or phone contains the typed text.
  const patientMatches = useMemo(() => {
    const q = clientName.trim().toLowerCase();
    if (!q) return availablePatients.slice(0, 6);
    return availablePatients
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.phone ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, ""))
      )
      .slice(0, 6);
  }, [availablePatients, clientName]);

  // The billed client: explicit pick wins; exact typed name still links
  // (covers the today's-sessions prefill) - otherwise it's a walk-in.
  const matchedPatient = useMemo(() => {
    if (selectedPatientId) {
      const p = availablePatients.find((x) => x.id === selectedPatientId);
      if (p) return p;
    }
    return availablePatients.find(
      (p) => p.name.toLowerCase() === clientName.trim().toLowerCase()
    );
  }, [availablePatients, selectedPatientId, clientName]);

  const patientBillCount = useMemo(
    () =>
      matchedPatient
        ? invoices.filter((i) => i.patient_id === matchedPatient.id).length
        : 0,
    [invoices, matchedPatient]
  );

  const pickPatient = (id: string) => {
    const p = availablePatients.find((x) => x.id === id);
    if (!p) return;
    setSelectedPatientId(p.id);
    setClientName(p.name);
    setPickerOpen(false);
  };

  // Today's sessions at this location - one tap closes the visit out
  const todaysSessions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return appointments
      .filter(
        (a) =>
          a.start.slice(0, 10) === today &&
          (a.location_id ?? locations[0]?.id) === locationId &&
          a.status !== "cancelled" &&
          a.status !== "no_show" &&
          a.procedure_interest &&
          findTreatment(a.procedure_interest)
      )
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [appointments, locationId, locations]);

  const addFromAppointment = (apptId: string) => {
    const appt = todaysSessions.find((a) => a.id === apptId);
    if (!appt) return;
    const t = findTreatment(appt.procedure_interest!);
    if (!t) return;
    setClientName(appt.patient_name);
    setSelectedPatientId(appt.patient_id ?? null);
    setCart((c) => {
      if (c.some((l) => l.ref === t.id)) return c;
      return [
        ...c,
        {
          ref: t.id,
          kind: "treatment",
          name: t.name,
          qty: 1,
          unitPrice: prices[t.id] ?? t.pricePkr,
        },
      ];
    });
  };

  const catalogue = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (tab === "treatments") {
      return CAPTURE_TREATMENTS.filter(
        (t) => !q || t.name.toLowerCase().includes(q)
      ).map((t) => ({
        ref: t.id,
        kind: "treatment" as const,
        name: t.name,
        sub: `${t.durationMin} min session`,
        price: prices[t.id] ?? t.pricePkr,
      }));
    }
    const kind = tab === "products" ? "product" : "regimen";
    return CAPTURE_PRODUCTS.filter(
      (p) => p.kind === kind && (!q || p.name.toLowerCase().includes(q))
    ).map((p) => ({
      ref: p.id,
      kind: p.kind === "regimen" ? ("regimen" as const) : ("product" as const),
      name: p.name,
      sub: p.note ?? p.category,
      price: p.pricePkr,
    }));
  }, [tab, query, prices]);

  const add = (item: (typeof catalogue)[number]) => {
    setCart((c) => {
      const hit = c.find((l) => l.ref === item.ref);
      if (hit) {
        return c.map((l) =>
          l.ref === item.ref ? { ...l, qty: l.qty + 1 } : l
        );
      }
      return [
        ...c,
        { ref: item.ref, kind: item.kind, name: item.name, qty: 1, unitPrice: item.price },
      ];
    });
  };

  const bump = (ref: string, delta: number) =>
    setCart((c) =>
      c
        .map((l) => (l.ref === ref ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );

  const subtotal = cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const codeDiscount = applied
    ? Math.round((subtotal * applied.value) / 100)
    : 0;
  // flat discount clamped so the bill can never go negative
  const manualDiscount = Math.min(
    Math.max(0, parseInt(flatDiscount.replace(/\D/g, "") || "0", 10)),
    Math.max(0, subtotal - codeDiscount)
  );
  const discount = codeDiscount + manualDiscount;
  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round((taxable * taxRate) / 100);
  const total = taxable + tax;
  const change =
    method === "cash" && received
      ? Math.max(0, parseInt(received.replace(/\D/g, "") || "0", 10) - total)
      : 0;

  const applyCode = async () => {
    const code = codeInput.trim().toUpperCase();
    if (!code || codeBusy) return;
    setCodeBusy(true);
    setCodeError(null);
    try {
      const res = await fetch(`/api/rewards/validate?code=${encodeURIComponent(code)}`);
      const data = (await res.json()) as {
        valid?: boolean;
        reason?: string;
        reward?: { code: string; value: number; patient_name: string };
      };
      if (data.valid && data.reward) {
        setApplied({
          code: data.reward.code,
          value: data.reward.value,
          patient_name: data.reward.patient_name,
        });
        setCodeInput("");
      } else {
        setCodeError(
          data.reason === "already_redeemed"
            ? "That code has already been redeemed."
            : data.reason === "expired"
              ? "That code has expired."
              : "Code not recognised."
        );
      }
    } catch {
      setCodeError("Could not verify the code. Try again.");
    } finally {
      setCodeBusy(false);
    }
  };

  const checkout = async () => {
    if (cart.length === 0 || checkoutBusy) return;
    setCheckoutBusy(true);
    try {
      const items: InvoiceItem[] = cart.map((l) => ({
        id: crypto.randomUUID(),
        ref: l.ref,
        kind: l.kind,
        name: l.name,
        qty: l.qty,
        unitPrice: l.unitPrice,
        total: l.qty * l.unitPrice,
      }));
      const invoice = addInvoice({
        number: nextInvoiceNumber(locationId),
        patient_id: matchedPatient?.id,
        patient_name: clientName.trim() || "Walk-in client",
        location_id: locationId,
        items,
        subtotal,
        tax_rate: taxRate,
        tax_amount: tax,
        discount_amount: discount,
        reward_code: applied?.code,
        manual_discount: manualDiscount > 0 ? manualDiscount : undefined,
        total,
        payment_method: method,
        amount_received:
          method === "cash" && received
            ? parseInt(received.replace(/\D/g, "") || "0", 10)
            : undefined,
        cashier_id: me?.id,
        cashier_name: me?.name,
        status: "paid",
      });
      if (applied) {
        markRewardRedeemed(applied.code, invoice.id);
        void fetch("/api/rewards/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: applied.code, invoiceId: invoice.id }),
        }).catch(() => {});
      }
      setDone(invoice);
      setPayOpen(false);
    } finally {
      setCheckoutBusy(false);
    }
  };

  const sendReviewLink = async () => {
    if (!done || reviewBusy) return;
    setReviewBusy(true);
    try {
      const res = await fetch("/api/reviews/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: done.patient_id,
          patient_name: done.patient_name,
          location_id: done.location_id,
          treatments: done.items
            .filter((i) => i.kind === "treatment")
            .map((i) => i.ref),
          staff_name: me?.name,
          invoice_id: done.id,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; url?: string };
      if (data.ok && data.url) {
        setReviewUrl(data.url);
        const msg = `Thank you for visiting CAPTURE, ${done.patient_name.split(" ")[0]}. We would love to hear about your experience: ${data.url} - your review earns you a Capture Circle reward for your next visit.`;
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
      }
    } finally {
      setReviewBusy(false);
    }
  };

  const reset = () => {
    setCart([]);
    setClientName("");
    setSelectedPatientId(null);
    setPickerOpen(false);
    setApplied(null);
    setCodeInput("");
    setCodeError(null);
    setFlatDiscount("");
    setReceived("");
    setDone(null);
    setReviewUrl(null);
  };

  const todaysInvoices = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return invoices
      .filter(
        (i) =>
          i.created_at.slice(0, 10) === today && i.location_id === locationId
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [invoices, locationId]);

  if (!mounted) return null;

  const TABS: Array<{ id: Tab; label: string; icon: typeof Sparkles }> = [
    { id: "treatments", label: "Treatments", icon: Sparkles },
    { id: "products", label: "Home care", icon: Package },
    { id: "regimens", label: "Regimens", icon: Layers },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-5 fade-up">
        <h1 className="h1 flex items-center gap-2.5">
          <ShoppingBag size={22} className="text-[color:var(--mint-500)]" />
          Point of Sale
        </h1>
        <span className="chip chip-static ml-auto hidden sm:inline-flex">
          {locations.find((l) => l.id === locationId)?.name ?? "CAPTURE"}
        </span>
      </div>

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5 items-start">
        {/* Catalogue */}
        <div className="glass p-4 sm:p-5 fade-up-1">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`chip ${tab === id ? "chip-active" : ""}`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
            <div className="relative ml-auto w-full sm:w-56">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                className="input !py-2 !pl-8 text-sm"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-2.5">
            {catalogue.map((item) => (
              <button
                key={item.ref}
                onClick={() => add(item)}
                className="glass-subtle card-hover px-4 py-3 text-left flex items-center gap-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink-900 leading-snug">
                    {item.name}
                  </span>
                  <span className="block text-[11.5px] text-ink-400">{item.sub}</span>
                </span>
                <span className="text-sm font-semibold text-ink-900 tabular-nums shrink-0">
                  {formatPkr(item.price)}
                </span>
                <Plus size={15} className="text-[color:var(--mint-500)] shrink-0" />
              </button>
            ))}
            {catalogue.length === 0 && (
              <p className="caption col-span-full py-6 text-center">Nothing matches that search.</p>
            )}
          </div>

          {/* Today's invoices */}
          {todaysInvoices.length > 0 && (
            <div className="mt-6 pt-4 border-t border-[rgba(28,26,22,0.08)]">
              <div className="field-label">Today&rsquo;s invoices</div>
              <div className="space-y-1.5">
                {todaysInvoices.slice(0, 6).map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 text-sm px-3 py-2 rounded-lg bg-white/45">
                    <span className="font-mono text-[12px] text-ink-700">{inv.number}</span>
                    <span className="text-ink-900 truncate flex-1">{inv.patient_name}</span>
                    <span className="tabular-nums font-medium">{formatPkr(inv.total)}</span>
                    <a
                      href={`/invoice/${inv.id}?print=1`}
                      target="_blank"
                      className="p-1.5 rounded-md hover:bg-mint-100 text-ink-700"
                      title="Print invoice"
                    >
                      <Printer size={14} />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cart / checkout / done */}
        {done ? (
          <div className="glass-strong p-6 fade-up-1 space-y-4">
            <div className="text-center pt-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-[rgba(110,159,112,0.15)] text-[#5B8A5E] flex items-center justify-center">
                <Ticket size={22} />
              </div>
              <h2 className="h2 mt-3">Payment recorded</h2>
              <p className="caption mt-1">
                Invoice <b className="font-mono">{done.number}</b> · {formatPkr(done.total)} ·{" "}
                {done.payment_method === "cash" ? "cash" : "card"}
              </p>
              {done.reward_code && (
                <p className="caption mt-0.5">
                  Capture Circle {done.reward_code} redeemed (−
                  {formatPkr(done.discount_amount - (done.manual_discount ?? 0))})
                </p>
              )}
              {(done.manual_discount ?? 0) > 0 && (
                <p className="caption mt-0.5">
                  Flat discount applied (−{formatPkr(done.manual_discount!)})
                </p>
              )}
            </div>
            <a
              href={`/invoice/${done.id}?print=1`}
              target="_blank"
              className="btn btn-primary w-full"
            >
              <Printer size={16} /> Print A4 invoice
            </a>
            {done.patient_id && (
              <a
                href={`/patients/${done.patient_id}`}
                className="btn btn-secondary w-full"
              >
                View {done.patient_name.split(" ")[0]}&apos;s record
                (bill saved to their Billing history)
              </a>
            )}
            <button
              onClick={() => void sendReviewLink()}
              disabled={reviewBusy}
              className="btn btn-secondary w-full"
            >
              {reviewBusy ? <Spinner className="w-4 h-4" /> : <Star size={15} />}
              {reviewUrl ? "Review link created ✓" : "Send review link (WhatsApp)"}
            </button>
            {reviewUrl && (
              <p className="text-[11.5px] text-ink-700 break-all bg-mint-100 rounded-lg px-3 py-2">
                {reviewUrl}
              </p>
            )}
            <button onClick={reset} className="btn btn-ghost w-full">
              <RotateCcw size={15} /> New sale
            </button>
          </div>
        ) : (
          <div className="glass-strong p-5 fade-up-1 space-y-4 lg:sticky lg:top-[84px]">
            {/* today's sessions: one-tap visit close-out */}
            {todaysSessions.length > 0 && (
              <div>
                <span className="field-label flex items-center gap-1.5">
                  <CalendarCheck2 size={13} className="text-[color:var(--mint-500)]" />
                  Today&rsquo;s sessions here
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {todaysSessions.slice(0, 4).map((a) => (
                    <button
                      key={a.id}
                      onClick={() => addFromAppointment(a.id)}
                      className="chip"
                      title={`Bill ${a.patient_name} for ${findTreatment(a.procedure_interest!)?.name}`}
                    >
                      {new Date(a.start).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {a.patient_name.split(" ")[0]} ·{" "}
                      {findTreatment(a.procedure_interest!)?.short}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* client + location */}
            <div className="grid grid-cols-1 gap-3">
              <div className="relative">
                <span className="field-label">Client</span>
                <input
                  className="input"
                  placeholder="Search patients, or type a walk-in name"
                  value={clientName}
                  onChange={(e) => {
                    setClientName(e.target.value);
                    setSelectedPatientId(null);
                    setPickerOpen(true);
                  }}
                  onFocus={() => setPickerOpen(true)}
                  onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                />
                {pickerOpen && (patientMatches.length > 0 || clientName.trim()) && (
                  <div className="absolute z-30 left-0 right-0 mt-1.5 glass-strong rounded-xl p-1.5 shadow-lg max-h-64 overflow-y-auto">
                    {patientMatches.map((p) => (
                      <button
                        key={p.id}
                        /* onMouseDown so the pick fires before input blur */
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickPatient(p.id);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-mint-100 transition-colors"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-ink-900 truncate">
                            {p.name}
                          </span>
                          <span className="caption block">{p.phone}</span>
                        </span>
                        <span className="chip chip-static text-[10px] shrink-0">
                          Patient
                        </span>
                      </button>
                    ))}
                    {clientName.trim() && !matchedPatient && (
                      <button
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedPatientId(null);
                          setPickerOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-mint-100 transition-colors"
                      >
                        <span className="text-sm text-ink-700 truncate flex-1">
                          Bill as walk-in: &ldquo;{clientName.trim()}&rdquo;
                        </span>
                        <span className="chip chip-static text-[10px] shrink-0">
                          Walk-in
                        </span>
                      </button>
                    )}
                  </div>
                )}
                {matchedPatient ? (
                  <p className="caption mt-1">
                    Linked to record · {matchedPatient.phone}
                    {patientBillCount > 0 &&
                      ` · ${patientBillCount} previous bill${patientBillCount === 1 ? "" : "s"}`}
                  </p>
                ) : (
                  clientName.trim() && (
                    <p className="caption mt-1">
                      Walk-in - not linked to a patient record.
                    </p>
                  )
                )}
              </div>
              <div>
                <span className="field-label">Location</span>
                <select
                  className="input"
                  value={locationId}
                  onChange={(e) => setPickedLocation(e.target.value)}
                  disabled={!!assignedLocationId}
                  title={
                    assignedLocationId
                      ? "POS is assigned to your staff branch"
                      : "Choose the branch receiving this payment"
                  }
                >
                  {(locations.length > 0
                    ? locations
                    : [{ id: "experience-centre", name: "CAPTURE Experience Centre" }]
                  ).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* cart lines */}
            <div className="space-y-2 min-h-[90px]">
              {cart.length > 0 && (
                <div className="flex items-center justify-between -mb-0.5">
                  <span className="field-label mb-0">
                    Bill · {cart.reduce((s, l) => s + l.qty, 0)} item
                    {cart.reduce((s, l) => s + l.qty, 0) === 1 ? "" : "s"}
                  </span>
                  <button
                    onClick={() => setCart([])}
                    className="inline-flex items-center gap-1 text-[11.5px] text-ink-400 hover:text-danger transition-colors"
                  >
                    <Trash2 size={12} /> Clear
                  </button>
                </div>
              )}
              {cart.length === 0 && (
                <p className="caption text-center py-6">
                  Tap items on the left to build the bill.
                </p>
              )}
              {cart.map((l) => (
                <div key={l.ref} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 min-w-0 truncate text-ink-900">{l.name}</span>
                  <span className="inline-flex items-center gap-1">
                    <button onClick={() => bump(l.ref, -1)} className="w-6 h-6 rounded-md bg-white/60 flex items-center justify-center hover:bg-mint-100">
                      <Minus size={12} />
                    </button>
                    <span className="w-6 text-center tabular-nums">{l.qty}</span>
                    <button onClick={() => bump(l.ref, 1)} className="w-6 h-6 rounded-md bg-white/60 flex items-center justify-center hover:bg-mint-100">
                      <Plus size={12} />
                    </button>
                  </span>
                  <span className="w-24 text-right tabular-nums font-medium">
                    {formatPkr(l.qty * l.unitPrice)}
                  </span>
                  <button onClick={() => bump(l.ref, -l.qty)} className="text-ink-400 hover:text-danger">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Capture Circle */}
            <div className="pt-3 border-t border-[rgba(28,26,22,0.08)]">
              <span className="field-label flex items-center gap-1.5">
                <Ticket size={13} className="text-[color:var(--mint-500)]" />
                Capture Circle code
              </span>
              {applied ? (
                <div className="flex items-center gap-2 rounded-lg bg-[rgba(196,161,90,0.12)] border border-[rgba(196,161,90,0.4)] px-3 py-2 text-sm">
                  <span className="font-mono font-semibold">{applied.code}</span>
                  <span className="text-ink-700">
                    −{applied.value}% · {applied.patient_name}
                  </span>
                  <button onClick={() => setApplied(null)} className="ml-auto text-ink-400 hover:text-danger">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    className="input flex-1 !py-2 uppercase font-mono text-sm"
                    placeholder="CIRCLE-XXXX"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void applyCode();
                    }}
                  />
                  <button onClick={() => void applyCode()} disabled={codeBusy} className="btn btn-secondary btn-sm">
                    {codeBusy ? <Spinner className="w-3.5 h-3.5" /> : "Apply"}
                  </button>
                </div>
              )}
              {codeError && <p className="text-xs text-danger mt-1">{codeError}</p>}
            </div>

            {/* flat discount - no code needed (owner 2026-07-23) */}
            <div>
              <span className="field-label flex items-center gap-1.5">
                <Banknote size={13} className="text-[color:var(--mint-500)]" />
                Flat discount (PKR)
              </span>
              <div className="flex items-center gap-2">
                <input
                  className="input flex-1 !py-2 tabular-nums text-sm"
                  inputMode="numeric"
                  placeholder="0"
                  value={flatDiscount}
                  onChange={(e) => setFlatDiscount(e.target.value)}
                />
                {manualDiscount > 0 && (
                  <button
                    onClick={() => setFlatDiscount("")}
                    className="text-ink-400 hover:text-danger"
                    title="Remove flat discount"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              {manualDiscount > 0 && (
                <p className="caption mt-1">
                  −{formatPkr(manualDiscount)} off, before tax
                  {applied ? " (on top of the Circle code)" : ""}.
                </p>
              )}
            </div>

            {/* totals */}
            <div className="pt-3 border-t border-[rgba(28,26,22,0.08)] space-y-1 text-sm">
              <Row label="Subtotal" value={formatPkr(subtotal)} />
              {codeDiscount > 0 && (
                <Row label={`Capture Circle (−${applied?.value}%)`} value={`−${formatPkr(codeDiscount)}`} accent />
              )}
              {manualDiscount > 0 && (
                <Row label="Flat discount" value={`−${formatPkr(manualDiscount)}`} accent />
              )}
              <Row label={`Sales tax (${taxRate}%)`} value={formatPkr(tax)} />
              <div className="flex items-baseline justify-between pt-1.5">
                <span className="font-medium text-ink-900">Total</span>
                <span className="text-xl font-semibold tabular-nums text-ink-900">{formatPkr(total)}</span>
              </div>
            </div>

            <button
              onClick={() => setPayOpen(true)}
              disabled={cart.length === 0}
              className="btn btn-primary w-full btn-lg"
            >
              Charge {formatPkr(total)}
            </button>
          </div>
        )}
      </div>

      {/* Payment modal */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Record payment">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMethod("card")}
              className={`rounded-xl border px-4 py-3.5 text-left ${
                method === "card"
                  ? "border-[color:var(--mint-500)] bg-[rgba(196,161,90,0.1)]"
                  : "border-[rgba(28,26,22,0.1)] bg-white/50"
              }`}
            >
              <CreditCard size={17} className="text-[color:var(--mint-500)]" />
              <div className="mt-1 text-sm font-medium">Card</div>
              <div className="text-[11px] text-ink-400">terminal · record only</div>
            </button>
            <button
              onClick={() => setMethod("cash")}
              className={`rounded-xl border px-4 py-3.5 text-left ${
                method === "cash"
                  ? "border-[color:var(--mint-500)] bg-[rgba(196,161,90,0.1)]"
                  : "border-[rgba(28,26,22,0.1)] bg-white/50"
              }`}
            >
              <Banknote size={17} className="text-[color:var(--mint-500)]" />
              <div className="mt-1 text-sm font-medium">Cash</div>
              <div className="text-[11px] text-ink-400">with change calculation</div>
            </button>
          </div>

          {method === "cash" && (
            <div>
              <span className="field-label">Amount received (PKR)</span>
              <input
                className="input tabular-nums"
                inputMode="numeric"
                placeholder={String(total)}
                value={received}
                onChange={(e) => setReceived(e.target.value)}
              />
              {received && (
                <p className="caption mt-1">
                  Change due: <b className="text-ink-900">{formatPkr(change)}</b>
                </p>
              )}
            </div>
          )}

          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-700">Total to record</span>
            <span className="text-lg font-semibold tabular-nums">{formatPkr(total)}</span>
          </div>

          <button onClick={() => void checkout()} disabled={checkoutBusy} className="btn btn-primary w-full btn-lg">
            {checkoutBusy ? <Spinner className="w-4 h-4" /> : <Printer size={16} />}
            Record payment &amp; create invoice
          </button>
          <p className="caption text-center">
            CAPTURE records the payment; card processing happens on your terminal.
          </p>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={accent ? "text-[color:#8A6F35]" : "text-ink-700"}>{label}</span>
      <span className={`tabular-nums ${accent ? "text-[color:#8A6F35] font-medium" : "text-ink-900"}`}>
        {value}
      </span>
    </div>
  );
}
