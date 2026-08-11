"use client";

/**
 * Contacts - one searchable list of everyone the clinic knows, leads and
 * converted patients alike.
 *
 * This is deliberately NOT a second patients screen: a converted contact
 * links straight through to the existing patient record rather than
 * reproducing it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, Search, UserCheck } from "lucide-react";
import { LEAD_SOURCE_LABELS, type CrmContact } from "@/lib/crm/types";
import {
  fetchContacts,
  money,
  relativeTime,
  titleize,
  type StaffLite,
} from "@/lib/crm/client";
import { formatPhone, phoneMatchesQuery } from "@/lib/crm/phone";
import { EmptyState, SectionTitle, Spinner } from "@/components/ui";
import { Pill, ScrollX, StageBadge } from "@/components/crm/CrmUi";
import type { ClinicLocation } from "@/lib/types";

type Filter = "all" | "leads" | "patients";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [branches, setBranches] = useState<ClinicLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [branch, setBranch] = useState("");

  const apply = useCallback((res: Awaited<ReturnType<typeof fetchContacts>>) => {
    if (res) {
      setContacts(res.contacts);
      setStaff(res.staff);
      setBranches(res.branches ?? []);
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

  const refresh = () => {
    setLoading(true);
    void (async () => apply(await fetchContacts()))();
  };

  const staffName = (id?: string) =>
    staff.find((s) => s.id === id)?.name ?? "Unassigned";
  const branchShort = (id?: string) =>
    branches.find((b) => b.id === id)?.short ?? "-";

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      if (filter === "leads" && c.patient_id) return false;
      if (filter === "patients" && !c.patient_id) return false;
      if (branch && c.branch_id !== branch) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        phoneMatchesQuery(c.phone_norm, q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [contacts, query, filter, branch]);

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
        title="Contacts"
        sub={`${rows.length} of ${contacts.length}`}
        action={
          <button
            className="btn btn-ghost btn-sm"
            onClick={refresh}
            aria-label="Refresh"
          >
            <RefreshCw size={15} />
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            className="input input-sm input-icon !w-64"
            placeholder="Search name, phone, email, tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search contacts"
          />
        </div>
        {(["all", "leads", "patients"] as Filter[]).map((f) => (
          <button
            key={f}
            className={`chip ${filter === f ? "chip-active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "Everyone" : f === "leads" ? "Leads only" : "Patients only"}
          </button>
        ))}
        {/* .input is width:100%, so the size lives on a wrapper. */}
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

      {rows.length === 0 ? (
        <EmptyState
          title="No contacts match"
          body="Try a different search, or clear the filters."
        />
      ) : (
        <div className="glass p-1">
          <ScrollX>
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-left text-ink-400 text-xs">
                  <th className="py-2.5 px-3 font-medium">Name</th>
                  <th className="py-2.5 px-3 font-medium">Phone</th>
                  <th className="py-2.5 px-3 font-medium">Stage</th>
                  <th className="py-2.5 px-3 font-medium">Source</th>
                  <th className="py-2.5 px-3 font-medium">Branch</th>
                  <th className="py-2.5 px-3 font-medium">Owner</th>
                  <th className="py-2.5 px-3 font-medium text-right">Value</th>
                  <th className="py-2.5 px-3 font-medium text-right">Added</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-white/60 hover:bg-mint-50/50"
                  >
                    <td className="py-2.5 px-3">
                      <Link
                        href={`/crm/patients/${c.id}`}
                        className="font-medium text-ink-900 hover:text-mint-600 inline-flex items-center gap-1.5"
                      >
                        {c.name}
                        {c.patient_id && (
                          <UserCheck
                            size={13}
                            className="text-emerald-600"
                            aria-label="Converted to patient"
                          />
                        )}
                      </Link>
                      {c.treatment_interest.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.treatment_interest.slice(0, 2).map((t) => (
                            <Pill key={t} tone="teal">
                              {titleize(t)}
                            </Pill>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-ink-700">
                      {formatPhone(c.phone)}
                    </td>
                    <td className="py-2.5 px-3">
                      <StageBadge stage={c.stage} />
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
                    <td className="py-2.5 px-3 text-right tabular-nums text-ink-700 whitespace-nowrap">
                      {c.estimated_value ? money(c.estimated_value) : "-"}
                    </td>
                    <td className="py-2.5 px-3 text-right text-ink-400 whitespace-nowrap">
                      {relativeTime(c.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollX>
        </div>
      )}
    </div>
  );
}
