"use client";

/**
 * Leads pipeline.
 *
 * A sortable, filterable list rather than a card board: columns of cards
 * clipped the detail and got unreadable past a couple of dozen leads. The
 * stage chips carry what the columns used to say, and every row opens the
 * contact.
 *
 * Stages come from PIPELINE_STAGES in crm/types.ts, so adding a stage adds a
 * chip here and a filter everywhere else without touching this file.
 *
 * Changing a row's stage PATCHes it; the server records the transition on
 * the contact's timeline and, for "consultation booked", puts a real
 * appointment on the clinic calendar. Terminal stages (lost, archived) are
 * hidden unless asked for, because they are not work in progress.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import {
  PIPELINE_STAGES,
  TERMINAL_STAGES,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  LOST_REASONS,
  LOST_REASON_LABELS,
  type ContactStage,
  type CrmContact,
} from "@/lib/crm/types";
import {
  createContact,
  fetchContacts,
  money,
  relativeTime,
  titleize,
  updateContact,
  type StaffLite,
} from "@/lib/crm/client";
import { formatPhone, phoneMatchesQuery } from "@/lib/crm/phone";
import {
  EmptyState,
  Field,
  Modal,
  SectionTitle,
  Spinner,
} from "@/components/ui";
import { Pill, ScrollX } from "@/components/crm/CrmUi";
import type { ClinicLocation } from "@/lib/types";

type SortCol = "name" | "value" | "updated";
interface SortState {
  col: SortCol;
  dir: "asc" | "desc";
}

export default function LeadsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [branches, setBranches] = useState<ClinicLocation[]>([]);
  const [treatments, setTreatments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("");
  const [owner, setOwner] = useState("");
  const [source, setSource] = useState("");
  const [stage, setStage] = useState("");
  const [sort, setSort] = useState<SortState>({ col: "updated", dir: "desc" });
  const [showTerminal, setShowTerminal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [lostFor, setLostFor] = useState<CrmContact | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof fetchContacts>>) => {
    if (res) {
      setContacts(res.contacts);
      setStaff(res.staff);
      setBranches(res.branches ?? []);
      setTreatments(res.treatments ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchContacts();
      if (!cancelled) apply(res);
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  /** Re-fetch from an event handler (refresh button, after a mutation). */
  const load = useCallback(async () => {
    apply(await fetchContacts());
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      if (branch && c.branch_id !== branch) return false;
      if (owner && c.assigned_to !== owner) return false;
      if (source && c.source !== source) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        phoneMatchesQuery(c.phone_norm, q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)) ||
        c.treatment_interest.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [contacts, query, branch, owner, source]);

  /** Counts per stage, for the stage filter chips. */
  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of filtered) m.set(c.stage, (m.get(c.stage) ?? 0) + 1);
    return m;
  }, [filtered]);

  const rows = useMemo(() => {
    const terminal = new Set<string>(TERMINAL_STAGES.map((s) => s.id));
    const out = filtered.filter((c) => {
      if (stage) return c.stage === stage;
      // Lost and archived are not work in progress: they stay out of the
      // list unless asked for, exactly as they were off the board.
      return showTerminal || !terminal.has(c.stage);
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      switch (sort.col) {
        case "name":
          return dir * a.name.localeCompare(b.name);
        case "value":
          return dir * ((a.estimated_value ?? 0) - (b.estimated_value ?? 0));
        default:
          return dir * a.updated_at.localeCompare(b.updated_at);
      }
    });
  }, [filtered, stage, showTerminal, sort]);

  const move = async (contact: CrmContact, stage: ContactStage) => {
    if (stage === "lost") {
      setLostFor(contact);
      return;
    }
    setBusyId(contact.id);
    // Optimistic: the board should feel immediate. A failure reloads truth.
    setContacts((prev) =>
      prev.map((c) => (c.id === contact.id ? { ...c, stage } : c))
    );
    const res = await updateContact(contact.id, { stage });
    if (!res.ok) await load();
    setBusyId(null);
  };

  if (loading && contacts.length === 0) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Leads pipeline"
        sub={`${filtered.length} of ${contacts.length} leads`}
        action={
          <div className="flex items-center gap-2">
            <button
              className="btn btn-ghost btn-sm"
              onClick={refresh}
              aria-label="Refresh"
            >
              <RefreshCw size={15} />
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
              <Plus size={15} /> New lead
            </button>
          </div>
        }
      />

      {/* --- filters --- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            className="input input-sm input-icon !w-56"
            placeholder="Name, phone, tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search leads"
          />
        </div>
        {/* .input is width:100%, so the size lives on a wrapper. */}
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
        <div className="w-44">
          <select
            className="input input-sm"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            aria-label="Filter by assignee"
          >
            <option value="">Anyone</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-44">
          <select
            className="input input-sm"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-label="Filter by source"
          >
            <option value="">Any source</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {LEAD_SOURCE_LABELS[s] ?? s}
              </option>
            ))}
          </select>
        </div>
        <button
          className={`chip ${showTerminal ? "chip-active" : ""}`}
          onClick={() => setShowTerminal((v) => !v)}
          disabled={!!stage}
        >
          Lost &amp; archived
        </button>
        {(query || branch || owner || source || stage) && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setQuery("");
              setBranch("");
              setOwner("");
              setSource("");
              setStage("");
            }}
          >
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {/* Stage filter: what the board's columns used to say, as one row
          that also works when a stage holds sixty leads. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          className={`chip ${stage === "" ? "chip-active" : ""}`}
          onClick={() => setStage("")}
        >
          All stages
          <span className="text-ink-400 ml-1 tabular-nums">{rows.length}</span>
        </button>
        {[...PIPELINE_STAGES, ...TERMINAL_STAGES].map((st) => (
          <button
            key={st.id}
            className={`chip ${stage === st.id ? "chip-active" : ""}`}
            onClick={() => setStage(stage === st.id ? "" : st.id)}
          >
            {st.label}
            <span className="text-ink-400 ml-1 tabular-nums">
              {stageCounts.get(st.id) ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* --- pipeline rows --------------------------------------------
          A board of cards forced every lead into a 260px column and cut
          the detail off. Rows show the whole record at a glance, sort,
          and stay readable however many leads there are. */}
      {rows.length === 0 ? (
        <EmptyState
          title="No leads match"
          body="Try a different search, or clear the filters."
        />
      ) : (
        <div className="glass p-1">
          <ScrollX>
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left text-ink-400 text-xs">
                  <SortHeader label="Lead" col="name" sort={sort} onSort={setSort} />
                  <th className="py-2.5 px-3 font-medium">Stage</th>
                  <th className="py-2.5 px-3 font-medium">Interest</th>
                  <th className="py-2.5 px-3 font-medium">Source</th>
                  <th className="py-2.5 px-3 font-medium">Branch</th>
                  <th className="py-2.5 px-3 font-medium">Owner</th>
                  <SortHeader label="Value" col="value" sort={sort} onSort={setSort} align="right" />
                  <SortHeader label="Updated" col="updated" sort={sort} onSort={setSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/crm/contacts/${c.id}`)}
                    className="border-t border-white/60 hover:bg-mint-50/50 cursor-pointer"
                  >
                    <td className="py-2.5 px-3">
                      <Link
                        href={`/crm/contacts/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-ink-900 hover:text-mint-600"
                      >
                        {c.name}
                      </Link>
                      <div className="text-xs text-ink-400">{formatPhone(c.phone)}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      {/* Stage stays editable inline: moving a lead was the
                          one thing the board did well. */}
                      <select
                        className="input input-xs !w-auto"
                        value={c.stage}
                        disabled={busyId === c.id}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => void move(c, e.target.value as ContactStage)}
                        aria-label={`Stage for ${c.name}`}
                      >
                        {[...PIPELINE_STAGES, ...TERMINAL_STAGES].map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {c.treatment_interest.slice(0, 2).map((t) => (
                          <Pill key={t} tone="teal">
                            {titleize(t)}
                          </Pill>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-ink-700 whitespace-nowrap">
                      {LEAD_SOURCE_LABELS[c.source] ?? c.source}
                    </td>
                    <td className="py-2.5 px-3 text-ink-700 whitespace-nowrap">
                      {branchShort(c.branch_id)}
                    </td>
                    <td className="py-2.5 px-3 text-ink-700 whitespace-nowrap">
                      {staffName(c.assigned_to)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                      {c.estimated_value ? money(c.estimated_value) : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-right text-ink-400 whitespace-nowrap">
                      {relativeTime(c.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        </div>
      )}

      {/* Mounted only while open, so each one opens with fresh state and
          needs no reset effect. */}
      {creating && (
        <NewLeadModal
          onClose={() => setCreating(false)}
          staff={staff}
          branches={branches}
          treatments={treatments}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      )}

      {lostFor && (
        <LostModal
          contact={lostFor}
          onClose={() => setLostFor(null)}
          onDone={() => {
            setLostFor(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------

/**
 * A sortable column heading.
 *
 * Clicking the active column flips direction; clicking another switches to
 * it. Kept here rather than in CrmUi because only this table sorts so far.
 */
function SortHeader({
  label,
  col,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  col: SortCol;
  sort: SortState;
  onSort: (s: SortState) => void;
  align?: "left" | "right";
}) {
  const active = sort.col === col;
  return (
    <th
      className={`py-2.5 px-3 font-medium ${align === "right" ? "text-right" : ""}`}
    >
      <button
        className={`inline-flex items-center gap-1 hover:text-ink-700 ${
          active ? "text-ink-900" : ""
        }`}
        onClick={() =>
          onSort({
            col,
            dir: active && sort.dir === "desc" ? "asc" : "desc",
          })
        }
        aria-label={`Sort by ${label}`}
      >
        {label}
        {active && (sort.dir === "desc" ? "↓" : "↑")}
      </button>
    </th>
  );
}

function NewLeadModal({
  onClose,
  staff,
  branches,
  treatments,
  onCreated,
}: {
  onClose: () => void;
  staff: StaffLite[];
  branches: ClinicLocation[];
  treatments: string[];
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    source: "walk_in",
    branch_id: branches[0]?.id ?? "",
    assigned_to: "",
    treatment: "",
    notes: "",
    estimated_value: "",
    marketing_opt_in: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<CrmContact | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError(null);
    setDuplicate(null);
    const res = await createContact({
      name: form.name,
      phone: form.phone,
      email: form.email || undefined,
      source: form.source,
      branch_id: form.branch_id || undefined,
      assigned_to: form.assigned_to || undefined,
      treatment_interest: form.treatment ? [form.treatment] : [],
      notes: form.notes || undefined,
      estimated_value: form.estimated_value ? Number(form.estimated_value) : undefined,
      marketing_opt_in: form.marketing_opt_in,
    });
    setSaving(false);
    if (res.ok) {
      onCreated();
      return;
    }
    // 409 = this number is already in the CRM. Offer the existing lead
    // rather than letting the user create a second one.
    if (res.status === 409) {
      const dup = (res.data as { contact?: CrmContact } | undefined)?.contact;
      setDuplicate(dup ?? null);
    }
    setError(res.error ?? "Could not create the lead.");
  };

  return (
    <Modal open onClose={onClose} title="New lead">
      <div className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name">
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Full name"
            />
          </Field>
          <Field label="Phone" hint="Any format - 0300…, +92 300…, 92300…">
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="0300 1234567"
            />
          </Field>
          <Field label="Email">
            <input
              className="input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="Optional"
            />
          </Field>
          <Field label="Source">
            <select
              className="input"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            >
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Branch">
            <select
              className="input"
              value={form.branch_id}
              onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
            >
              <option value="">No branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assign to">
            <select
              className="input"
              value={form.assigned_to}
              onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
            >
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Treatment interest">
            <select
              className="input"
              value={form.treatment}
              onChange={(e) => setForm({ ...form, treatment: e.target.value })}
            >
              <option value="">Not specified</option>
              {treatments.map((t) => (
                <option key={t} value={t}>
                  {titleize(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estimated value (PKR)">
            <input
              className="input"
              inputMode="numeric"
              value={form.estimated_value}
              onChange={(e) =>
                setForm({ ...form, estimated_value: e.target.value.replace(/\D/g, "") })
              }
              placeholder="Optional"
            />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            className="input min-h-[70px]"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="What did they ask about?"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={form.marketing_opt_in}
            onChange={(e) => setForm({ ...form, marketing_opt_in: e.target.checked })}
          />
          Consented to marketing messages
        </label>

        {error && (
          <div className="glass-subtle p-3 text-sm text-rose-700">
            {error}
            {duplicate && (
              <Link
                href={`/crm/contacts/${duplicate.id}`}
                className="block mt-2 text-mint-600 font-medium"
              >
                Open {duplicate.name}&apos;s existing record →
              </Link>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void submit()}
            disabled={saving || !form.name.trim() || !form.phone.trim()}
          >
            {saving ? <Spinner className="w-4 h-4" /> : <Plus size={15} />}
            Create lead
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------

function LostModal({
  contact,
  onClose,
  onDone,
}: {
  contact: CrmContact;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<string>("price");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    await updateContact(contact.id, {
      stage: "lost",
      lost_reason: reason,
      lost_note: note || undefined,
    });
    setSaving(false);
    onDone();
  };

  return (
    <Modal open onClose={onClose} title={`Mark ${contact.name} as lost`}>
      <div className="space-y-3">
        <Field label="Reason">
          <select
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {LOST_REASONS.map((r) => (
              <option key={r} value={r}>
                {LOST_REASON_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note">
          <textarea
            className="input min-h-[70px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything worth remembering if they come back."
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-danger"
            onClick={() => void submit()}
            disabled={saving}
          >
            {saving ? <Spinner className="w-4 h-4" /> : <X size={15} />}
            Mark lost
          </button>
        </div>
      </div>
    </Modal>
  );
}
