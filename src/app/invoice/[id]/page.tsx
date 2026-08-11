"use client";

/**
 * CAPTURE A4 invoice - the printed artefact that closes the visit (§5.3).
 * Letterhead discipline (flat white, Fraunces display, hairline rules,
 * champagne accents only) on the print-exact report-sheet pipeline.
 * Public route by unguessable id, like /report - front desk opens it with
 * ?print=1 and the dialog fires.
 */

import { useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { formatPkr, CAPTURE_BRAND } from "@/lib/capture/kb";

function InvoiceInner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const mounted = useMounted();
  const seedIfNeeded = useStore((s) => s.seedIfNeeded);
  const invoice = useStore((st) => st.invoices.find((i) => i.id === params.id));
  const locations = useStore((st) => st.locations);
  const patients = useStore((st) => st.patients);
  // one-shot auto-print guard - a ref, not state: nothing re-renders on it
  const printedRef = useRef(false);

  useEffect(() => {
    void seedIfNeeded();
  }, [seedIfNeeded]);

  useEffect(() => {
    if (mounted && invoice && search.get("print") === "1" && !printedRef.current) {
      printedRef.current = true;
      setTimeout(() => window.print(), 120);
    }
  }, [mounted, invoice, search]);

  const location = useMemo(
    () =>
      locations.find((l) => l.id === invoice?.location_id) ?? {
        name: "CAPTURE Experience Centre",
        address: "2nd Floor, Vogue Towers, 15 C/2 M.M. Alam Road",
        area: "Gulberg III",
        city: "Islamabad",
        phone: CAPTURE_BRAND.whatsapp,
        kind: "experience_centre" as const,
        doctor: undefined,
      },
    [locations, invoice]
  );

  const patient = patients.find((p) => p.id === invoice?.patient_id);

  if (!mounted) return null;
  if (!invoice) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-ink-700">Invoice not found on this device.</p>
        <Link href="/pos" className="btn btn-secondary">
          <ArrowLeft size={15} /> Back to Point of Sale
        </Link>
      </div>
    );
  }

  const issuedAt = new Date(invoice.created_at);

  return (
    <div className="report-root py-8 px-4">
      {/* screen-only toolbar */}
      <div className="no-print fixed top-4 left-1/2 -translate-x-1/2 z-50 flex gap-2">
        <button onClick={() => window.print()} className="btn btn-primary btn-sm">
          <Printer size={14} /> Print / Save PDF
        </button>
        <Link href="/pos" className="btn btn-secondary btn-sm">
          <ArrowLeft size={14} /> Point of Sale
        </Link>
      </div>

      <section className="report-sheet ar-sheet">
        {/* letterhead */}
        <header className="ar-head">
          <div className="ar-head-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/capture-logo-black.png"
              alt="CAPTURE"
              style={{ width: 132, height: 34, objectFit: "contain" }}
            />
            <div>
              <span className="ar-head-clinic">
                {CAPTURE_BRAND.tagline}
              </span>
              <h1 className="ar-title">Invoice</h1>
            </div>
          </div>
          <dl className="ar-head-meta">
            <div>
              <dt>Invoice No.</dt>
              <dd style={{ fontFamily: "var(--font-fraunces)" }}>{invoice.number}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>
                {issuedAt.toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>
                {issuedAt.toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </dd>
            </div>
          </dl>
        </header>

        {/* parties */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 16 }}>
          <div>
            <div className="rb-label">Billed to</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{invoice.patient_name}</div>
            {patient && (
              <div style={{ fontSize: 10.5, color: "var(--ink-700)", marginTop: 2 }}>
                {patient.phone}
                {patient.email ? ` · ${patient.email}` : ""}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="rb-label">Issued at</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{location.name}</div>
            <div style={{ fontSize: 10.5, color: "var(--ink-700)", marginTop: 2, lineHeight: 1.5 }}>
              {location.address}, {location.area}, {location.city}
              <br />
              WhatsApp {location.phone ?? CAPTURE_BRAND.whatsapp} · {CAPTURE_BRAND.website}
            </div>
          </div>
        </div>

        {/* items */}
        <table className="ar-table" style={{ marginBottom: 14 }}>
          <thead>
            <tr>
              <th style={{ width: "50%" }}>Description</th>
              <th>Type</th>
              <th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right" }}>Unit price</th>
              <th style={{ textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it) => (
              <tr key={it.id}>
                <td style={{ fontWeight: 500 }}>{it.name}</td>
                <td className="ar-muted" style={{ textTransform: "capitalize" }}>
                  {it.kind}
                </td>
                <td className="ar-num-cell" style={{ textAlign: "right" }}>
                  {it.qty}
                </td>
                <td className="ar-num-cell" style={{ textAlign: "right" }}>
                  {formatPkr(it.unitPrice)}
                </td>
                <td className="ar-num-cell" style={{ textAlign: "right", fontWeight: 600 }}>
                  {formatPkr(it.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* totals */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
          <div style={{ width: 260 }}>
            <TotalRow label="Subtotal" value={formatPkr(invoice.subtotal)} />
            {/* discount lines: Circle code and cashier flat discount are
                separate rows; discount_amount stores their combined total */}
            {invoice.reward_code &&
              invoice.discount_amount - (invoice.manual_discount ?? 0) > 0 && (
                <TotalRow
                  label={`Capture Circle ${invoice.reward_code}`}
                  value={`−${formatPkr(
                    invoice.discount_amount - (invoice.manual_discount ?? 0)
                  )}`}
                  gold
                />
              )}
            {(invoice.manual_discount ?? 0) > 0 && (
              <TotalRow
                label="Discount"
                value={`−${formatPkr(invoice.manual_discount!)}`}
                gold
              />
            )}
            {!invoice.reward_code &&
              !(invoice.manual_discount ?? 0) &&
              invoice.discount_amount > 0 && (
                <TotalRow
                  label="Discount"
                  value={`−${formatPkr(invoice.discount_amount)}`}
                  gold
                />
              )}
            <TotalRow
              label={`Sales tax (${invoice.tax_rate}%)`}
              value={formatPkr(invoice.tax_amount)}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0 2px",
                borderTop: "1.4px solid rgba(28,26,22,0.7)",
                marginTop: 6,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em" }}>
                TOTAL
              </span>
              <span
                style={{
                  fontFamily: "var(--font-fraunces)",
                  fontSize: 19,
                  fontWeight: 600,
                }}
                className="ar-num-cell"
              >
                {formatPkr(invoice.total)}
              </span>
            </div>
            <div style={{ fontSize: 9.5, color: "var(--ink-700)", textAlign: "right", marginTop: 4 }}>
              Paid by {invoice.payment_method === "cash" ? "cash" : "card"}
              {invoice.payment_method === "cash" && invoice.amount_received
                ? ` · received ${formatPkr(invoice.amount_received)} · change ${formatPkr(
                    Math.max(0, invoice.amount_received - invoice.total)
                  )}`
                : ""}
            </div>
          </div>
        </div>

        {/* capture circle note */}
        <div className="rb-label" style={{ marginBottom: 4 }}>
          The Capture Circle
        </div>
        <p style={{ fontSize: 10, color: "var(--ink-700)", lineHeight: 1.55, maxWidth: "72ch" }}>
          Share your experience after your visit and earn rewards toward your
          next treatment. Your specialist or our WhatsApp concierge
          ({CAPTURE_BRAND.whatsapp}) can send your personal review link.
        </p>

        {/* sign-off */}
        <footer className="ar-signoff">
          <div className="ar-sign-lines">
            <div>
              <span className="ar-sign-rule" />
              <span>Received by</span>
            </div>
            <div>
              <span className="ar-sign-rule" />
              <span>For CAPTURE · {invoice.cashier_name ?? "Front desk"}</span>
            </div>
            <div className="ar-cta-block">
              <b>Thank you.</b>
              <br />
              <span>{CAPTURE_BRAND.tagline} · {CAPTURE_BRAND.website}</span>
            </div>
          </div>
          <p className="ar-smallprint">
            CAPTURE is a subsidiary of Don Valley Pharmaceuticals. Payments are
            recorded at the point of sale; card transactions are processed on
            the terminal. Treatments are professional cosmetic services;
            results vary by individual. Invoice {invoice.number} ·{" "}
            {location.name} · {issuedAt.toLocaleDateString("en-GB")}.
          </p>
        </footer>
      </section>
    </div>
  );
}

function TotalRow({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "3px 0",
        fontSize: 11,
        color: gold ? "#8A6F35" : "var(--ink-700)",
        fontWeight: gold ? 600 : 400,
      }}
    >
      <span>{label}</span>
      <span className="ar-num-cell">{value}</span>
    </div>
  );
}

export default function InvoicePage() {
  return (
    <Suspense fallback={null}>
      <InvoiceInner />
    </Suspense>
  );
}
