"use client";

/**
 * Follow-ups dashboard.
 *
 * Buckets (due today / upcoming / overdue / completed) are derived from the
 * clock at render time via followUpState(), never read from stored status -
 * so an item becomes overdue on its own, without a job to age it.
 *
 * Notification indicators are in-app only. Email / SMS / WhatsApp delivery
 * attaches to the automation hooks in crmEvents.ts and is deliberately not
 * wired to a live channel.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlarmClock,
  CalendarClock,
  CalendarPlus,
  Check,
  CircleSlash,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  FOLLOWUP_TYPE_LABELS,
  followUpState,
  type CrmFollowUp,
  type FollowUpDerivedStatus,
} from "@/lib/crm/types";
import {
  dateTime,
  fetchFollowUps,
  relativeTime,
  runAutomations,
  updateFollowUp,
  type StaffLite,
} from "@/lib/crm/client";
import { EmptyState, Field, Modal, SectionTitle, Spinner } from "@/components/ui";
import { Metric, Pill } from "@/components/crm/CrmUi";
import type { ClinicLocation } from "@/lib/types";

type Bucket = "today" | "upcoming" | "overdue" | "completed" | "cancelled";

const BUCKET_LABELS: Record<Bucket, string> = {
  today: "Due today",
  upcoming: "Upcoming",
  overdue: "Overdue",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function FollowUpsPage() {
  const [items, setItems] = useState<CrmFollowUp[]>([]);
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [branches, setBranches] = useState<ClinicLocation[]>([]);
  const [me, setMe] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [bucket, setBucket] = useState<Bucket>("today");
  const [assignee, setAssignee] = useState("");
  const [branch, setBranch] = useState("");
  const [mineOnly, setMineOnly] = useState(false);

  const [completing, setCompleting] = useState<CrmFollowUp | null>(null);
  const [rescheduling, setRescheduling] = useState<CrmFollowUp | null>(null);
  const [cancelling, setCancelling] = useState<CrmFollowUp | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** How many the engine sent on this load, for the banner. */
  const [autoSent, setAutoSent] = useState(0);

  const apply = useCallback((res: Awaited<ReturnType<typeof fetchFollowUps>>) => {
    if (res) {
      setItems(res.followUps);
      setStaff(res.staff);
      setBranches(res.branches ?? []);
      setMe(res.me);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Automation runs BEFORE the board is fetched, so anything the system
      // can handle itself is already sent and closed by the time it renders.
      // A failure here is not fatal: the board still loads, the due items
      // simply stay pending.
      const run = await runAutomations().catch(() => null);
      if (cancelled) return;
      if (run?.ok && run.data && run.data.sent > 0) setAutoSent(run.data.sent);
      const res = await fetchFollowUps();
      if (!cancelled) apply(res);
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const load = useCallback(async () => {
    apply(await fetchFollowUps());
  }, [apply]);

  const refresh = () => {
    setLoading(true);
    void load();
  };

  const staffName = useCallback(
    (id?: string) => staff.find((s) => s.id === id)?.name ?? "Unassigned",
    [staff]
  );
  const branchShort = useCallback(
    (id?: string) => branches.find((b) => b.id === id)?.short ?? "-",
    [branches]
  );

  // --- bucketing --------------------------------------------------------
  const { buckets, counts } = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay.getTime() + 86_399_999);

    const filtered = items.filter((f) => {
      if (branch && f.branch_id !== branch) return false;
      if (mineOnly && f.assigned_to !== me) return false;
      if (assignee && f.assigned_to !== assignee) return false;
      return true;
    });

    const b: Record<Bucket, CrmFollowUp[]> = {
      today: [],
      upcoming: [],
      overdue: [],
      completed: [],
      cancelled: [],
    };

    for (const f of filtered) {
      const state: FollowUpDerivedStatus = followUpState(f, now);
      if (state === "completed") b.completed.push(f);
      else if (state === "cancelled") b.cancelled.push(f);
      else if (state === "overdue") b.overdue.push(f);
      else {
        const t = new Date(f.due_at).getTime();
        if (t >= startOfDay.getTime() && t <= endOfDay.getTime()) b.today.push(f);
        else b.upcoming.push(f);
      }
    }

    b.today.sort((x, y) => x.due_at.localeCompare(y.due_at));
    b.upcoming.sort((x, y) => x.due_at.localeCompare(y.due_at));
    b.overdue.sort((x, y) => x.due_at.localeCompare(y.due_at));
    b.completed.sort((x, y) => (y.completed_at ?? "").localeCompare(x.completed_at ?? ""));

    return {
      buckets: b,
      counts: {
        today: b.today.length,
        upcoming: b.upcoming.length,
        overdue: b.overdue.length,
        completed: b.completed.length,
        cancelled: b.cancelled.length,
      },
    };
  }, [items, branch, assignee, mineOnly, me]);

  const act = async (
    f: CrmFollowUp,
    body: Record<string, unknown>
  ): Promise<void> => {
    setBusyId(f.id);
    await updateFollowUp(f.id, body);
    await load();
    setBusyId(null);
  };

  if (loading && items.length === 0) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const rows = buckets[bucket];

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Follow-ups"
        sub="Messages send themselves; what is left needs a person"
        action={
          <button className="btn btn-ghost btn-sm" onClick={refresh} aria-label="Refresh">
            <RefreshCw size={15} />
          </button>
        }
      />

      {/* Automation reports what it just did. Without this the board looks
          like it simply had fewer items than the team expected. */}
      {autoSent > 0 && (
        <div className="glass-subtle flex items-center gap-2 px-4 py-2.5 text-sm text-ink-700">
          <Sparkles size={15} className="text-[color:var(--mint-500)] shrink-0" />
          <span>
            <strong className="font-medium text-ink-900">
              {autoSent} follow-up{autoSent === 1 ? "" : "s"}
            </strong>{" "}
            came due and {autoSent === 1 ? "was" : "were"} sent automatically.
            Anything still listed needs a person: a call, a payment or a
            consultation to book.
          </span>
        </div>
      )}

      {/* --- at-a-glance --- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric
          label="Due today"
          value={counts.today}
          icon={<CalendarClock size={16} />}
          emphasis={counts.today > 0}
        />
        <Metric
          label="Overdue"
          value={counts.overdue}
          icon={<AlarmClock size={16} />}
          tone={counts.overdue > 0 ? "bad" : "good"}
          emphasis={counts.overdue > 0}
        />
        <Metric label="Upcoming" value={counts.upcoming} />
        <Metric label="Completed" value={counts.completed} tone="good" />
      </div>

      {/* --- filters --- */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(BUCKET_LABELS) as Bucket[]).map((b) => (
          <button
            key={b}
            className={`chip ${bucket === b ? "chip-active" : ""}`}
            onClick={() => setBucket(b)}
          >
            {BUCKET_LABELS[b]}
            <span className="ml-1.5 tabular-nums opacity-60">{counts[b]}</span>
          </button>
        ))}
        <div className="w-px h-5 bg-ink-200 mx-1 hidden sm:block" />
        <button
          className={`chip ${mineOnly ? "chip-active" : ""}`}
          onClick={() => setMineOnly((v) => !v)}
        >
          Mine only
        </button>
        <div className="w-44">
          <select
            className="input input-sm"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            aria-label="Filter by staff member"
            disabled={mineOnly}
          >
            <option value="">Anyone</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-40">
          {branches.length > 1 ? (
            <select className="input input-sm" value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Filter by branch">
              <option value="">All branches</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.short}</option>)}
            </select>
          ) : (
            <span className="chip">{branches[0]?.short ?? "Branch"}</span>
          )}
        </div>
      </div>

      {/* --- list --- */}
      {rows.length === 0 ? (
        <EmptyState
          title={`Nothing ${BUCKET_LABELS[bucket].toLowerCase()}`}
          body={
            bucket === "overdue"
              ? "Every follow-up is on schedule."
              : "Follow-ups appear here as they are scheduled."
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((f) => {
            const state = followUpState(f);
            return (
              <div
                key={f.id}
                className={`glass p-4 ${busyId === f.id ? "opacity-60" : ""} ${
                  state === "overdue" ? "ring-1 ring-rose-200" : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-ink-900">{f.title}</span>
                      <Pill
                        tone={
                          state === "overdue"
                            ? "rose"
                            : state === "completed"
                            ? "green"
                            : state === "cancelled"
                            ? "slate"
                            : "amber"
                        }
                      >
                        {state}
                      </Pill>
                      {f.priority === "high" && <Pill tone="rose">High</Pill>}
                      <Pill tone="sky">{FOLLOWUP_TYPE_LABELS[f.type] ?? f.type}</Pill>
                    </div>

                    {f.description && (
                      <p className="text-sm text-ink-700 mt-1">{f.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-ink-400">
                      <span title={dateTime(f.due_at)}>
                        Due {relativeTime(f.due_at)}
                      </span>
                      <span>· {staffName(f.assigned_to)}</span>
                      <span>· {branchShort(f.branch_id)}</span>
                      {f.contact_id && (
                        <Link
                          href={`/crm/patients/${f.contact_id}`}
                          className="text-mint-600 font-medium"
                        >
                          Open contact →
                        </Link>
                      )}
                      {f.rescheduled_from.length > 0 && (
                        <span title={f.rescheduled_from.map(dateTime).join(", ")}>
                          · rescheduled {f.rescheduled_from.length}×
                        </span>
                      )}
                    </div>

                    {f.completion_note && (
                      <p className="text-xs text-ink-700 mt-2 glass-subtle p-2">
                        {f.completion_note}
                      </p>
                    )}
                    {f.cancel_reason && (
                      <p className="text-xs text-ink-700 mt-2 glass-subtle p-2">
                        Cancelled: {f.cancel_reason}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {f.status === "pending" ? (
                      <>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => setCompleting(f)}
                          disabled={busyId === f.id}
                        >
                          <Check size={14} /> Complete
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setRescheduling(f)}
                          disabled={busyId === f.id}
                          title="Reschedule"
                        >
                          <CalendarPlus size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setCancelling(f)}
                          disabled={busyId === f.id}
                          title="Cancel"
                        >
                          <CircleSlash size={14} />
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => void act(f, { action: "reopen" })}
                        disabled={busyId === f.id}
                      >
                        <RotateCcw size={14} /> Reopen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {completing && (
        <CompleteModal
          followUp={completing}
          onClose={() => setCompleting(null)}
          onDone={(note) => {
            const f = completing;
            setCompleting(null);
            void act(f, { action: "complete", completion_note: note });
          }}
        />
      )}
      {rescheduling && (
        <RescheduleModal
          followUp={rescheduling}
          onClose={() => setRescheduling(null)}
          onDone={(due) => {
            const f = rescheduling;
            setRescheduling(null);
            void act(f, { action: "reschedule", due_at: due });
          }}
        />
      )}
      {cancelling && (
        <CancelModal
          followUp={cancelling}
          onClose={() => setCancelling(null)}
          onDone={(reason) => {
            const f = cancelling;
            setCancelling(null);
            void act(f, { action: "cancel", cancel_reason: reason });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------

function CompleteModal({
  followUp,
  onClose,
  onDone,
}: {
  followUp: CrmFollowUp;
  onClose: () => void;
  onDone: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Modal open onClose={onClose} title="Complete follow-up">
      <p className="text-sm text-ink-700 mb-3">{followUp.title}</p>
      <Field label="What happened?" hint="Optional, but it becomes the timeline entry.">
        <textarea
          className="input min-h-[90px]"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Spoke to the patient; booked for Thursday."
        />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => onDone(note)}>
          <Check size={15} /> Mark complete
        </button>
      </div>
    </Modal>
  );
}

function RescheduleModal({
  followUp,
  onClose,
  onDone,
}: {
  followUp: CrmFollowUp;
  onClose: () => void;
  onDone: (dueIso: string) => void;
}) {
  const [due, setDue] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    d.setHours(11, 0, 0, 0);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  return (
    <Modal open onClose={onClose} title="Reschedule follow-up">
      <p className="text-sm text-ink-700 mb-1">{followUp.title}</p>
      <p className="caption mb-3">Currently due {dateTime(followUp.due_at)}</p>
      <Field label="New date and time">
        <input
          className="input"
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={!due}
          onClick={() => onDone(new Date(due).toISOString())}
        >
          <CalendarPlus size={15} /> Reschedule
        </button>
      </div>
    </Modal>
  );
}

function CancelModal({
  followUp,
  onClose,
  onDone,
}: {
  followUp: CrmFollowUp;
  onClose: () => void;
  onDone: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal open onClose={onClose} title="Cancel follow-up">
      <p className="text-sm text-ink-700 mb-3">{followUp.title}</p>
      <Field label="Reason">
        <textarea
          className="input min-h-[70px]"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this no longer needed?"
        />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-ghost" onClick={onClose}>
          Keep it
        </button>
        <button className="btn btn-danger" onClick={() => onDone(reason)}>
          <CircleSlash size={15} /> Cancel follow-up
        </button>
      </div>
    </Modal>
  );
}
