"use client";

/**
 * Leads pipeline.
 *
 * Columns come from PIPELINE_STAGES in crm/types.ts — the stage list is
 * defined once, so adding a stage adds a column here and a filter everywhere
 * else without touching this file.
 *
 * Moving a card PATCHes the stage; the server records the transition on the
 * contact's timeline. Terminal stages (lost, archived) live in a drawer
 * rather than the board, because they are not work in progress.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { Field, GlassCard, Modal, SectionTitle, Spinner } from "@/components/ui";
import { Pill, ScrollX } from "@/components/crm/CrmUi";
import type { ClinicLocation } from "@/lib/types";

export default function LeadsPage() {
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [branches, setBranches] = useState<ClinicLocation[]>([]);
  const [treatments, setTreatments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [branch, setBranch] = useState("");
  const [owner, setOwner] = useState("");
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
    (id?: string) => branches.find((b) => b.id === id)?.short ?? "—",
    [branches]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      if (branch && c.branch_id !== branch) return false;
      if (owner && c.assigned_to !== owner) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        phoneMatchesQuery(c.phone_norm, q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)) ||
        c.treatment_interest.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [contacts, query, branch, owner]);

  const byStage = useMemo(() => {
    const m = new Map<string, CrmContact[]>();
    for (const s of [...PIPELINE_STAGES, ...TERMINAL_STAGES]) m.set(s.id, []);
    for (const c of filtered) m.get(c.stage)?.push(c);
    return m;
  }, [filtered]);

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
        <button
          className={`chip ${showTerminal ? "chip-active" : ""}`}
          onClick={() => setShowTerminal((v) => !v)}
        >
          Lost &amp; archived
        </button>
      </div>

      {/* --- board --- */}
      <ScrollX>
        <div className="flex gap-3 min-w-max pb-2">
          {PIPELINE_STAGES.map((stage) => {
            const cards = byStage.get(stage.id) ?? [];
            const value = cards.reduce((s, c) => s + (c.estimated_value ?? 0), 0);
            return (
              <div key={stage.id} className="w-[260px] shrink-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink-900">
                      {stage.label}
                    </span>
                    <span className="text-xs text-ink-400 tabular-nums">
                      {cards.length}
                    </span>
                  </div>
                  {value > 0 && (
                    <span className="text-[10px] text-ink-400 tabular-nums">
                      {money(value)}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {cards.length === 0 && (
                    <div className="glass-subtle text-center py-6 text-xs text-ink-400">
                      Nothing here
                    </div>
                  )}
                  {cards.map((c) => (
                    <LeadCard
                      key={c.id}
                      contact={c}
                      staffName={staffName}
                      branchShort={branchShort}
                      busy={busyId === c.id}
                      onMove={(s) => void move(c, s)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollX>

      {/* --- lost / archived --- */}
      {showTerminal && (
        <GlassCard className="p-5">
          <div className="grid sm:grid-cols-2 gap-5">
            {TERMINAL_STAGES.map((stage) => {
              const cards = byStage.get(stage.id) ?? [];
              return (
                <div key={stage.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-ink-900">
                      {stage.label}
                    </span>
                    <span className="text-xs text-ink-400">{cards.length}</span>
                  </div>
                  {cards.length === 0 ? (
                    <p className="text-sm text-ink-400">None.</p>
                  ) : (
                    <div className="space-y-2">
                      {cards.map((c) => (
                        <LeadCard
                          key={c.id}
                          contact={c}
                          staffName={staffName}
                          branchShort={branchShort}
                          busy={busyId === c.id}
                          onMove={(s) => void move(c, s)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </GlassCard>
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

function LeadCard({
  contact,
  staffName,
  branchShort,
  busy,
  onMove,
}: {
  contact: CrmContact;
  staffName: (id?: string) => string;
  branchShort: (id?: string) => string;
  busy: boolean;
  onMove: (stage: ContactStage) => void;
}) {
  return (
    <div className={`glass p-3 space-y-2 ${busy ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/crm/contacts/${contact.id}`}
          className="font-medium text-ink-900 text-sm leading-tight hover:text-mint-600"
        >
          {contact.name}
        </Link>
        {contact.estimated_value ? (
          <span className="text-[10px] text-ink-400 tabular-nums shrink-0">
            {money(contact.estimated_value)}
          </span>
        ) : null}
      </div>

      <div className="text-[11px] text-ink-400">{formatPhone(contact.phone)}</div>

      <div className="flex flex-wrap gap-1">
        <Pill tone="sky">{LEAD_SOURCE_LABELS[contact.source] ?? contact.source}</Pill>
        {contact.branch_id && <Pill>{branchShort(contact.branch_id)}</Pill>}
        {contact.treatment_interest.slice(0, 2).map((t) => (
          <Pill key={t} tone="teal">
            {titleize(t)}
          </Pill>
        ))}
        {contact.tags.map((t) => (
          <Pill key={t} tone="amber">
            {t}
          </Pill>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 text-[10px] text-ink-400">
        <span className="truncate">{staffName(contact.assigned_to)}</span>
        <span className="shrink-0">{relativeTime(contact.created_at)}</span>
      </div>

      <select
        className="input input-xs"
        value={contact.stage}
        disabled={busy}
        onChange={(e) => onMove(e.target.value as ContactStage)}
        aria-label={`Move ${contact.name} to another stage`}
      >
        {[...PIPELINE_STAGES, ...TERMINAL_STAGES].map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------

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
          <Field label="Phone" hint="Any format — 0300…, +92 300…, 92300…">
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
