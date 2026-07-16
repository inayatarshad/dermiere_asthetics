"use client";

/**
 * The exportable patient report (07_report-export.md) — the takeaway.
 * Three A4 sheets: cover · consultation + visualization · plan + next steps.
 * Surfaces use pre-composed opaque glass (no backdrop-filter) so the printed
 * PDF matches the screen pixel for pixel.
 */

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "@/lib/store";
import { useAssetUrl } from "@/lib/hooks";
import { activeTemplatesFor, getTemplate, TEMPLATES } from "@/lib/templates";
import { zoneByKey } from "@/lib/botoxUnits";
import { magnitudeBand } from "@/lib/prompt";
import { formatDate, formatDateTime, firstName } from "@/lib/format";
import { AI_DISCLAIMER, CONSENT_COPY, type ConsentType } from "@/lib/types";
import { CONSENT_ACK_PARAGRAPH, RISKS_BY_CATEGORY } from "@/lib/consentPack";

export function ReportView({
  consultationId,
  consentPack = false,
}: {
  consultationId: string;
  /** T5: render ONLY the one-sheet consent pack instead of the report. */
  consentPack?: boolean;
}) {
  const consultation = useStore((s) =>
    s.consultations.find((c) => c.id === consultationId)
  );
  const patient = useStore((s) =>
    s.patients.find((p) => p.id === consultation?.patient_id)
  );
  const clinic = useStore((s) => s.clinic);
  const doctor = useStore((s) =>
    s.users.find((u) => u.id === consultation?.doctor_id)
  );
  const viz = useStore((s) =>
    s.visualizations
      .filter((v) => v.consultation_id === consultationId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  );
  const plan = useStore((s) =>
    s.plans.find((p) => p.consultation_id === consultationId)
  );
  const planItems = useStore(
    useShallow((s) =>
      s.planItems
        .filter((i) => plan && i.plan_id === plan.id)
        .sort((a, b) => a.order - b.order)
    )
  );
  const consents = useStore(
    useShallow((s) =>
      s.consents.filter((c) => c.patient_id === patient?.id && c.granted)
    )
  );
  const assets = useStore((s) => s.assets);

  const beforeAsset = useMemo(() => {
    if (viz) return assets.find((a) => a.id === viz.before_asset_id);
    return assets
      .filter((a) => a.patient_id === patient?.id && a.kind === "photo_front")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  }, [viz, assets, patient?.id]);
  const afterAsset = useMemo(
    () => (viz ? assets.find((a) => a.id === viz.after_asset_id) : undefined),
    [viz, assets]
  );

  const beforeUrl = useAssetUrl(beforeAsset);
  const afterUrl = useAssetUrl(afterAsset);

  if (!consultation || !patient || !clinic) {
    return <div className="p-10 text-center caption">Report data not found.</div>;
  }

  const template = getTemplate(consultation.brief.primary_interest);
  // Multi-procedure (T2): cover + chips state every active procedure
  const activeProcedures = activeTemplatesFor(
    consultation.brief.interests,
    consultation.brief.primary_interest
  );
  const procedureTitle =
    activeProcedures.length > 0
      ? activeProcedures.map((t) => t.name).join(" + ")
      : template?.name;
  const milestones = planItems.filter((i) => i.kind === "milestone");
  const medicines = planItems.filter((i) => i.kind === "medicine");
  const followups = planItems.filter((i) => i.kind === "followup");
  const consentRef = consents
    .map((c) => c.type[0].toUpperCase())
    .sort()
    .join("·");

  const activeParams = viz
    ? Object.entries(viz.params).filter(([, v]) => Math.abs(v) >= 15)
    : [];

  // Slider keys are globally unique, so label lookup spans all templates
  const sliderLabel = (key: string) => {
    for (const t of TEMPLATES) {
      const def = t.slider_schema.find((s) => s.key === key);
      if (def) return def.label;
    }
    return key;
  };

  // ================= T5: one-sheet consent pack =================
  if (consentPack) {
    const categories = [
      ...new Set(
        activeProcedures.map((t) =>
          t.category === "surgical"
            ? "surgical"
            : t.category === "hair"
              ? "hair"
              : "injectable"
        )
      ),
    ] as ("injectable" | "surgical" | "hair")[];
    const grantedConsents = consents.filter((c) => c.granted);
    return (
      <div className="report-root">
        <section className="report-sheet report-body">
          <SheetHeader clinic={clinic.name} title="Consent summary" />

          {/* 1 — who / when / what */}
          <div className="rb-panel cp-tight">
            <div className="rb-tl-head">
              <span className="rb-list-label">{patient.name}</span>
              <span className="rb-tl-due">{formatDate(consultation.date)}</span>
            </div>
            <div className="rb-meta-row" style={{ marginTop: "8px" }}>
              {activeProcedures.map((t) => (
                <span key={t.id} className="rb-chip rb-chip-mint">
                  {t.name}
                </span>
              ))}
            </div>
          </div>

          {/* 2 — the simulation viewed */}
          <div className="rb-panel cp-tight">
            <div className="rb-label">The visualization you were shown</div>
            {beforeUrl && afterUrl ? (
              <div className="cp-ba">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={beforeUrl} alt="Before" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={afterUrl} alt="Simulated outcome" />
              </div>
            ) : (
              <p className="rb-note" style={{ marginTop: 0 }}>
                Visualization to be generated and attached at the clinic.
              </p>
            )}
            <div className="cp-caption">
              ILLUSTRATIVE SIMULATION: not a guaranteed outcome
            </div>
          </div>

          {/* 3 — acknowledgement */}
          <div className="rb-panel cp-tight">
            <div className="rb-label">Acknowledgement</div>
            <p className="cp-body">{CONSENT_ACK_PARAGRAPH}</p>
          </div>

          {/* 4 — risks checklist */}
          <div className={categories.length > 1 ? "rb-two-col" : ""}>
            {categories.map((cat) => (
              <div key={cat} className="rb-panel cp-tight">
                <div className="rb-label">{RISKS_BY_CATEGORY[cat].title}</div>
                <ul className="cp-risks">
                  {RISKS_BY_CATEGORY[cat].risks.map((r) => (
                    <li key={r}>
                      <span className="cp-check" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* 5 — consents actually captured */}
          <div className="rb-panel cp-tight" style={{ marginTop: categories.length > 1 ? "14px" : undefined }}>
            <div className="rb-label">Consents on record</div>
            <ul className="cp-consents">
              {grantedConsents.map((c) => (
                <li key={c.id}>
                  <span className="cp-check cp-check-done" />
                  <span>
                    <b>{CONSENT_COPY[c.type as ConsentType]?.title ?? c.type}.</b>{" "}
                    {CONSENT_COPY[c.type as ConsentType]?.body}{" "}
                    <span className="cp-stamp">
                      Recorded {formatDateTime(c.granted_at)} · wording{" "}
                      {c.text_version}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* 6 — signatures */}
          <div className="cp-signatures">
            <div>
              <div className="cp-sign-line" />
              <div className="cp-sign-label">
                Patient signature · {patient.name}
              </div>
              <div className="cp-sign-date">Date:</div>
            </div>
            <div>
              <div className="cp-sign-line" />
              <div className="cp-sign-label">
                Practitioner · {doctor?.name}
                {doctor?.title ? `, ${doctor.title}` : ""}
              </div>
              <div className="cp-sign-date">Date:</div>
            </div>
          </div>

          <SheetFooter
            left={`${patient.name} · Consent summary · ${clinic.name}`}
            page="01 / 01"
          />
        </section>
      </div>
    );
  }

  return (
    <div className="report-root">
      {/* ============ SHEET 1 — COVER ============ */}
      <section className="report-sheet report-cover">
        <div className="rc-orb rc-orb-1" />
        <div className="rc-orb rc-orb-2" />
        <div className="rc-orb rc-orb-3" />

        <header className="rc-header">
          <div className="rc-clinic">
            <span className="rc-mark">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2l2.4 6.2L21 10l-6.6 1.8L12 18l-2.4-6.2L3 10l6.6-1.8L12 2z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <div>
              <div className="rc-clinic-name">{clinic.name}</div>
              <div className="rc-clinic-city">{clinic.city}</div>
            </div>
          </div>
          <div className="rc-doc-type">Aesthetic Consultation Report</div>
        </header>

        <div className="rc-center">
          <div className="rc-prepared">Prepared for</div>
          <h1 className="rc-name">{firstName(patient.name)}</h1>
          {procedureTitle && <div className="rc-procedure">{procedureTitle}</div>}
          <div className="rc-date">{formatDate(consultation.date)}</div>
        </div>

        <footer className="rc-footer">
          <div className="rc-panel">
            <span>{clinic.branding.tagline}</span>
          </div>
          <div className="rc-page">01 / 03</div>
        </footer>
      </section>

      {/* ============ SHEET 2 — CONSULTATION + VISUALIZATION ============ */}
      <section className="report-sheet report-body">
        <SheetHeader clinic={clinic.name} title="Your consultation" />

        <div className="rb-panel">
          <div className="rb-label">Your goal, in your words</div>
          <blockquote className="rb-quote">
            "{consultation.brief.goal_text || "Discussed during consultation."}"
          </blockquote>
          <div className="rb-meta-row">
            {activeProcedures.map((t) => (
              <span key={t.id} className="rb-chip rb-chip-mint">
                {t.name}
              </span>
            ))}
            {consultation.brief.interests
              .filter((i) => !activeProcedures.some((t) => t.id === i))
              .map((i) => (
                <span key={i} className="rb-chip">
                  {getTemplate(i)?.name ?? i}
                </span>
              ))}
            {consultation.brief.concerns.map((c) => (
              <span key={c} className="rb-chip">
                {c.replace(/_/g, "-")}
              </span>
            ))}
          </div>
          {consultation.doctor_note && (
            <>
              <div className="rb-label" style={{ marginTop: "16px" }}>
                {doctor?.name}
                {doctor?.title ? `, ${doctor.title}` : ""}
              </div>
              <p className="rb-note">{consultation.doctor_note}</p>
            </>
          )}
        </div>

        <div className="rb-section-title">Your visualization</div>
        <div className="rb-panel">
          {beforeUrl ? (
            <div className="rb-ba-grid">
              <figure>
                <div className="rb-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={beforeUrl} alt="Before" />
                  <span className="rb-photo-tag">Before</span>
                </div>
              </figure>
              <figure>
                <div className="rb-photo rb-photo-after">
                  {afterUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={afterUrl} alt="Visualized result" />
                      <span className="rb-photo-tag rb-photo-tag-mint">
                        Visualized result
                      </span>
                    </>
                  ) : (
                    <div className="rb-photo-empty">
                      Visualization to be generated at your next visit
                    </div>
                  )}
                </div>
              </figure>
            </div>
          ) : (
            <div className="rb-photo-empty">Photos to be captured at your next visit</div>
          )}

          {activeParams.length > 0 && (
            <div className="rb-meta-row" style={{ marginTop: "14px" }}>
              {activeParams.map(([key, v]) => (
                <span key={key} className="rb-chip">
                  {sliderLabel(key)}: {magnitudeBand(Math.abs(v))}
                </span>
              ))}
            </div>
          )}

          <div className="rb-disclaimer">{AI_DISCLAIMER}</div>
        </div>

        <SheetFooter
          left={`${patient.name} · ${formatDate(consultation.date)}`}
          page="02 / 03"
        />
      </section>

      {/* ============ SHEET 3 — PLAN + NEXT STEPS ============ */}
      <section className="report-sheet report-body">
        <SheetHeader clinic={clinic.name} title="Your treatment plan" />

        {plan ? (
          <>
            {plan.summary && (
              <div className="rb-panel">
                <p className="rb-note" style={{ marginTop: 0 }}>
                  {plan.summary}
                </p>
              </div>
            )}

            {milestones.length > 0 && (
              <div className="rb-panel">
                <div className="rb-label">Milestones</div>
                <div className="rb-timeline">
                  {milestones.map((m) => (
                    <div key={m.id} className="rb-tl-item">
                      <span
                        className={`rb-tl-dot ${m.done ? "rb-tl-dot-done" : ""}`}
                      />
                      <div className="rb-tl-body">
                        <div className="rb-tl-head">
                          <span className="rb-tl-label">{m.label}</span>
                          {m.due && (
                            <span className="rb-tl-due">{formatDate(m.due)}</span>
                          )}
                        </div>
                        {m.detail && <div className="rb-tl-detail">{m.detail}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rb-two-col">
              {medicines.length > 0 && (
                <div className="rb-panel">
                  <div className="rb-label">Medicines & aftercare</div>
                  <ul className="rb-list">
                    {medicines.map((m) => (
                      <li key={m.id}>
                        <span className="rb-list-label">{m.label}</span>
                        {m.detail && (
                          <span className="rb-list-detail">{m.detail}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {followups.length > 0 && (
                <div className="rb-panel">
                  <div className="rb-label">Follow-up schedule</div>
                  <ul className="rb-list">
                    {followups.map((f) => (
                      <li key={f.id}>
                        <span className="rb-list-label">
                          {f.label}
                          {f.due ? ` · ${formatDate(f.due)}` : ""}
                        </span>
                        {f.detail && (
                          <span className="rb-list-detail">{f.detail}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rb-panel">
            <p className="rb-note" style={{ marginTop: 0 }}>
              Your personalised treatment plan will be finalised with your
              doctor at the clinic.
            </p>
          </div>
        )}

        {/* Toxin plan (T3): botox zones, units and cost */}
        {consultation.toxin_plan && (
          <div className="rb-panel">
            <div className="rb-label">Botox unit plan</div>
            <ul className="rb-list">
              {Object.entries(consultation.toxin_plan.zones).map(([key, z]) => (
                <li key={key}>
                  <span className="rb-tl-head">
                    <span className="rb-list-label">
                      {zoneByKey(key)?.label ?? key}
                    </span>
                    <span className="rb-tl-due">{z.units} units</span>
                  </span>
                </li>
              ))}
            </ul>
            <div
              className="rb-tl-head"
              style={{
                marginTop: "10px",
                paddingTop: "10px",
                borderTop: "1px solid rgba(20,80,70,0.1)",
              }}
            >
              <span className="rb-list-label">Total</span>
              <span className="rb-list-label">
                {consultation.toxin_plan.total_units} units · PKR{" "}
                {consultation.toxin_plan.total_cost.toLocaleString("en-PK")}
              </span>
            </div>
          </div>
        )}

        <div className="rb-section-title">Next steps</div>
        <div className="rb-panel rb-next">
          <div>
            <div className="rb-label">Ready when you are</div>
            <p className="rb-note" style={{ marginTop: "4px" }}>
              To confirm your treatment date or ask anything at all, contact
              us. We will walk you through preparation, timings and aftercare.
            </p>
          </div>
          <div className="rb-contact">
            {clinic.branding.phone && <div>{clinic.branding.phone}</div>}
            {clinic.branding.email && <div>{clinic.branding.email}</div>}
            {clinic.branding.address && <div>{clinic.branding.address}</div>}
          </div>
        </div>

        <div className="rb-legal">
          {AI_DISCLAIMER} All visualizations are communication aids based on
          your consultation preferences. Final surgical outcomes vary by
          individual anatomy and healing. Consent on record: {consentRef || "T"}{" "}
          · {doctor?.name}
          {doctor?.title ? `, ${doctor.title}` : ""} · {clinic.name},{" "}
          {clinic.city}
        </div>

        <SheetFooter
          left={`${patient.name} · ${formatDate(consultation.date)}`}
          page="03 / 03"
        />
      </section>
    </div>
  );
}

function SheetHeader({ clinic, title }: { clinic: string; title: string }) {
  return (
    <header className="rb-header rb-header-branded">
      <div>
        <span className="rb-header-clinic">{clinic}</span>
        <h2 className="rb-header-title">{title}</h2>
      </div>
      {/* CAPTURE mark, co-branded top-right (prints on the white sheet) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/capture-logo-black.png"
        alt="CAPTURE"
        className="rb-header-mark"
        style={{ width: 96, height: 30, objectFit: "contain" }}
      />
    </header>
  );
}

function SheetFooter({ left, page }: { left: string; page: string }) {
  return (
    <footer className="rb-footer">
      <span>{left}</span>
      <span>{page}</span>
    </footer>
  );
}
