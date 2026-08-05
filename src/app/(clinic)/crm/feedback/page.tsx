"use client";

/**
 * Feedback and service recovery.
 *
 * Extends the clinic's existing review capture with structured ratings
 * (branch / doctor / treatment) and a recovery workflow for low scores.
 *
 * Averages are only shown where feedback actually exists - a branch with no
 * responses shows "-", never a 0.0 or an inherited clinic average.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, RefreshCw, Star } from "lucide-react";
import {
  LOW_RATING_THRESHOLD,
  RECOVERY_STATUSES,
  type CrmFeedback,
  type RecoveryStatus,
} from "@/lib/crm/types";
import {
  avg,
  dateTime,
  fetchFeedback,
  relativeTime,
  titleize,
  updateFeedback,
  type StaffLite,
} from "@/lib/crm/client";
import { useSessionUser } from "@/lib/store";
import { crmCan } from "@/lib/crm/permissions";
import { EmptyState, Field, GlassCard, Modal, SectionTitle, Spinner } from "@/components/ui";
import { Metric, Pill, Rating, SubHeading } from "@/components/crm/CrmUi";
import type { ClinicLocation } from "@/lib/types";

type View = "all" | "low" | "open" | "resolved";

const RECOVERY_LABELS: Record<RecoveryStatus, string> = {
  none: "No case",
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

export default function FeedbackPage() {
  const user = useSessionUser();
  const canResolve = crmCan(user?.role, "resolve_feedback");

  const [items, setItems] = useState<CrmFeedback[]>([]);
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [branches, setBranches] = useState<ClinicLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("all");
  const [branch, setBranch] = useState("");
  const [working, setWorking] = useState<CrmFeedback | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof fetchFeedback>>) => {
    if (res) {
      setItems(res.feedback);
      setStaff(res.staff);
      setBranches(res.branches ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchFeedback();
      if (!cancelled) apply(res);
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const load = useCallback(async () => {
    apply(await fetchFeedback());
  }, [apply]);

  const refresh = () => {
    setLoading(true);
    void load();
  };

  const staffName = (id?: string) =>
    staff.find((s) => s.id === id)?.name ?? (id ? "Unknown" : "Unassigned");
  const branchShort = (id?: string) =>
    branches.find((b) => b.id === id)?.short ?? (id ? titleize(id) : "-");

  const scoped = useMemo(
    () => (branch ? items.filter((f) => f.branch_id === branch) : items),
    [items, branch]
  );

  const rows = useMemo(() => {
    switch (view) {
      case "low":
        return scoped.filter((f) => f.overall_rating <= LOW_RATING_THRESHOLD);
      case "open":
        return scoped.filter(
          (f) => f.recovery_status === "open" || f.recovery_status === "in_progress"
        );
      case "resolved":
        return scoped.filter((f) => f.recovery_status === "resolved");
      default:
        return scoped;
    }
  }, [scoped, view]);

  // Averages are computed from what exists; an empty set stays null.
  const summary = useMemo(() => {
    const m = (vals: number[]) =>
      vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    return {
      count: scoped.length,
      overall: m(scoped.map((f) => f.overall_rating)),
      branch: m(scoped.filter((f) => f.branch_rating != null).map((f) => f.branch_rating!)),
      doctor: m(scoped.filter((f) => f.doctor_rating != null).map((f) => f.doctor_rating!)),
      treatment: m(
        scoped.filter((f) => f.treatment_rating != null).map((f) => f.treatment_rating!)
      ),
      low: scoped.filter((f) => f.overall_rating <= LOW_RATING_THRESHOLD).length,
      open: scoped.filter(
        (f) => f.recovery_status === "open" || f.recovery_status === "in_progress"
      ).length,
    };
  }, [scoped]);

  /** Per-branch averages, only for branches that actually have feedback. */
  const byBranch = useMemo(() => {
    return branches.map((b) => {
      const rows = items.filter((f) => f.branch_id === b.id);
      return {
        branch: b,
        count: rows.length,
        avg: rows.length
          ? rows.reduce((s, f) => s + f.overall_rating, 0) / rows.length
          : null,
      };
    });
  }, [items, branches]);

  if (loading && items.length === 0) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Feedback"
        sub="Ratings, complaints and service recovery"
        action={
          <button className="btn btn-ghost btn-sm" onClick={refresh} aria-label="Refresh">
            <RefreshCw size={15} />
          </button>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="No feedback yet"
          body="Once patients respond to a feedback request, their ratings and comments appear here. Nothing is averaged until then."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric
              label="Responses"
              value={summary.count}
              hint={branch ? branchShort(branch) : "All branches"}
            />
            <Metric
              label="Average rating"
              value={avg(summary.overall)}
              tone={
                summary.overall === null ? "neutral" : summary.overall >= 4 ? "good" : "warn"
              }
            />
            <Metric
              label="Low ratings"
              value={summary.low}
              hint={`${LOW_RATING_THRESHOLD} stars or below`}
              tone={summary.low > 0 ? "bad" : "good"}
            />
            <Metric
              label="Open cases"
              value={summary.open}
              icon={<AlertTriangle size={16} />}
              tone={summary.open > 0 ? "warn" : "good"}
              emphasis={summary.open > 0}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <GlassCard className="p-5">
              <SubHeading>Ratings breakdown</SubHeading>
              <div className="space-y-2.5">
                <RatingRow label="Overall" value={summary.overall} />
                <RatingRow label="Branch experience" value={summary.branch} />
                <RatingRow label="Doctor" value={summary.doctor} />
                <RatingRow label="Treatment" value={summary.treatment} />
              </div>
            </GlassCard>

            <GlassCard className="p-5">
              <SubHeading>By branch</SubHeading>
              <div className="space-y-2.5">
                {byBranch.map(({ branch: b, count, avg: a }) => (
                  <div key={b.id} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-ink-700">{b.short}</span>
                    {count === 0 ? (
                      <span className="text-xs text-ink-400">No feedback yet</span>
                    ) : (
                      <Rating value={a} count={count} />
                    )}
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* --- filters --- */}
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "low", "open", "resolved"] as View[]).map((v) => (
              <button
                key={v}
                className={`chip ${view === v ? "chip-active" : ""}`}
                onClick={() => setView(v)}
              >
                {v === "all"
                  ? "All feedback"
                  : v === "low"
                  ? "Low ratings"
                  : v === "open"
                  ? "Open cases"
                  : "Resolved"}
              </button>
            ))}
            <div className="w-40">
              <select
                className="input input-sm"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                aria-label="Filter by branch"
              >
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.short}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              title="Nothing here"
              body="No feedback matches this filter."
            />
          ) : (
            <div className="space-y-2">
              {rows.map((f) => {
                const low = f.overall_rating <= LOW_RATING_THRESHOLD;
                return (
                  <div
                    key={f.id}
                    className={`glass p-4 ${low ? "ring-1 ring-rose-200" : ""}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex" aria-label={`${f.overall_rating} of 5`}>
                            {[1, 2, 3, 4, 5].map((i) => (
                              <Star
                                key={i}
                                size={14}
                                className={
                                  i <= f.overall_rating
                                    ? "text-amber-500 fill-amber-500"
                                    : "text-ink-200"
                                }
                              />
                            ))}
                          </span>
                          <Pill>{branchShort(f.branch_id)}</Pill>
                          {f.treatment_id && <Pill tone="teal">{titleize(f.treatment_id)}</Pill>}
                          {f.recovery_status !== "none" && (
                            <Pill
                              tone={
                                f.recovery_status === "resolved"
                                  ? "green"
                                  : f.recovery_status === "in_progress"
                                  ? "amber"
                                  : "rose"
                              }
                            >
                              {RECOVERY_LABELS[f.recovery_status]}
                            </Pill>
                          )}
                        </div>

                        {f.comment && (
                          <p className="text-sm text-ink-700 mt-2 leading-relaxed">
                            “{f.comment}”
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-ink-400">
                          <span title={dateTime(f.created_at)}>
                            {relativeTime(f.created_at)}
                          </span>
                          <span>· Doctor {staffName(f.doctor_id)}</span>
                          {f.assigned_to && <span>· Case owner {staffName(f.assigned_to)}</span>}
                          {f.contact_id && (
                            <Link
                              href={`/crm/patients/${f.contact_id}`}
                              className="text-mint-600 font-medium"
                            >
                              Open contact →
                            </Link>
                          )}
                        </div>

                        {f.resolution_note && (
                          <p className="text-xs text-ink-700 mt-2 glass-subtle p-2">
                            <span className="font-medium">Resolution: </span>
                            {f.resolution_note}
                            {f.resolved_at && (
                              <span className="text-ink-400">
                                {" "}
                                · {relativeTime(f.resolved_at)}
                              </span>
                            )}
                          </p>
                        )}
                      </div>

                      {f.recovery_status !== "none" && (
                        <button
                          className="btn btn-secondary btn-sm shrink-0"
                          onClick={() => setWorking(f)}
                        >
                          {f.recovery_status === "resolved" ? "View case" : "Work case"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {working && (
        <RecoveryModal
          feedback={working}
          staff={staff}
          canResolve={canResolve}
          onClose={() => setWorking(null)}
          onSaved={() => {
            setWorking(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function RatingRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink-700">{label}</span>
      {value === null ? (
        <span className="text-xs text-ink-400">Not rated</span>
      ) : (
        <Rating value={value} />
      )}
    </div>
  );
}

function RecoveryModal({
  feedback,
  staff,
  canResolve,
  onClose,
  onSaved,
}: {
  feedback: CrmFeedback;
  staff: StaffLite[];
  canResolve: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<RecoveryStatus>(feedback.recovery_status);
  const [assignee, setAssignee] = useState(feedback.assigned_to ?? "");
  const [note, setNote] = useState(feedback.resolution_note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const res = await updateFeedback({
      id: feedback.id,
      recovery_status: status,
      assigned_to: assignee || undefined,
      resolution_note: note || undefined,
    });
    setSaving(false);
    if (res.ok) onSaved();
    else setError(res.error ?? "Could not update the case.");
  };

  return (
    <Modal open onClose={onClose} title="Service recovery">
      <div className="space-y-3">
        <div className="glass-subtle p-3">
          <div className="flex items-center gap-1 mb-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                size={13}
                className={
                  i <= feedback.overall_rating
                    ? "text-amber-500 fill-amber-500"
                    : "text-ink-200"
                }
              />
            ))}
          </div>
          {feedback.comment && (
            <p className="text-sm text-ink-700">“{feedback.comment}”</p>
          )}
        </div>

        <Field label="Case status">
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as RecoveryStatus)}
          >
            {RECOVERY_STATUSES.filter((s) => s !== "none").map((s) => (
              <option
                key={s}
                value={s}
                disabled={s === "resolved" && !canResolve}
              >
                {RECOVERY_LABELS[s]}
                {s === "resolved" && !canResolve ? " (owner only)" : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Owner">
          <select
            className="input"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Resolution note">
          <textarea
            className="input min-h-[90px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was done to put this right?"
          />
        </Field>

        {error && <p className="text-sm text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? <Spinner className="w-4 h-4" /> : <Check size={15} />}
            Save case
          </button>
        </div>
      </div>
    </Modal>
  );
}
