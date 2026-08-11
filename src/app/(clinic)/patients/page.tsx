"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Search,
  UserPlus,
  Users,
  Stethoscope,
  Megaphone,
  ArrowDownAZ,
  Clock,
  Building2,
} from "lucide-react";
import { useStore, useSessionUser } from "@/lib/store";
import { relativeDay, SOURCE_LABELS } from "@/lib/format";
import { getTemplate } from "@/lib/templates";
import { GlassCard, EmptyState, StatusChip, Chip } from "@/components/ui";
import { PatientAvatar } from "@/components/PatientAvatar";
import type { PatientSource } from "@/lib/types";
import { derivePatientBranches } from "@/lib/patientBranch";

type SortKey = "newest" | "name";

const SOURCE_ORDER: PatientSource[] = [
  "vibro",
  "walk_in",
  "referral",
  "social",
  "tourism",
];

export default function PatientsPage() {
  const patients = useStore((s) => s.patients);
  const consultations = useStore((s) => s.consultations);
  const consents = useStore((s) => s.consents);
  const newArrivals = useStore((s) => s.newArrivals);
  const appointments = useStore((s) => s.appointments);
  const invoices = useStore((s) => s.invoices);
  const locations = useStore((s) => s.locations);
  const me = useSessionUser();

  const [query, setQuery] = useState("");
  const [source, setSource] = useState<PatientSource | "all">("all");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [onlyMarketing, setOnlyMarketing] = useState(false);
  const [sort, setSort] = useState<SortKey>("newest");
  /** Assigned staff are locked to their branch; unassigned leadership may
   * use the branch selector as a whole-clinic reporting lens. */
  const [branch, setBranch] = useState<string>(() => me?.branch_id ?? "all");
  const assignedBranchId = me?.branch_id ?? null;
  const activeBranch = assignedBranchId ?? branch;

  /**
   * A patient's home branch, derived from where they actually go.
   *
   * Deliberately not stored on the patient. A stored branch would be a
   * second source of truth that can disagree with their bookings, and then
   * it needs reconciling; derived, it just follows them when they start
   * attending the other site. Most recent activity wins.
   *
   * Appointments first, then invoices: someone can be billed at a site they
   * walked into without a booking. For a patient with neither, their
   * registration branch is the fallback. Both branches are in Islamabad,
   * so city must never be used to infer a branch.
   */
  const branchOf = useMemo(
    () => derivePatientBranches(patients, appointments, invoices),
    [appointments, invoices, patients]
  );

  // attribute lookups, derived once per data change (stable selectors above)
  const openConsultIds = useMemo(
    () =>
      new Set(
        consultations.filter((c) => c.status === "open").map((c) => c.patient_id)
      ),
    [consultations]
  );
  const marketingIds = useMemo(
    () =>
      new Set(
        consents
          .filter((c) => c.type === "marketing" && c.granted)
          .map((c) => c.patient_id)
      ),
    [consents]
  );
  const presentSources = useMemo(
    () => SOURCE_ORDER.filter((s) => patients.some((p) => p.source === s)),
    [patients]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const list = patients.filter((p) => {
      if (activeBranch !== "all") {
        const home = branchOf.get(p.id);
        if (home !== activeBranch) return false;
      }
      if (source !== "all" && p.source !== source) return false;
      if (onlyOpen && !openConsultIds.has(p.id)) return false;
      if (onlyMarketing && !marketingIds.has(p.id)) return false;
      if (!q) return true;
      const phoneDigits = p.phone.replace(/\D/g, "");
      return (
        p.name.toLowerCase().includes(q) ||
        (digits.length >= 3 && phoneDigits.includes(digits)) ||
        p.city.toLowerCase().includes(q)
      );
    });
    return list.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : b.created_at.localeCompare(a.created_at)
    );
  }, [patients, query, source, onlyOpen, onlyMarketing, sort, openConsultIds, marketingIds, activeBranch, branchOf]);

  const filtersActive =
    source !== "all" || onlyOpen || onlyMarketing || !!query.trim() || activeBranch !== "all";

  return (
    <div className="space-y-5">
      <div className="fade-up flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="h1 text-ink-900">Patients</h1>
          <p className="caption mt-0.5">
            {filtered.length} of {patients.length} on record
            {filtersActive ? " · filters on" : " · search by name, phone or city"}
          </p>
        </div>
        <Link href="/patients/new" className="btn btn-primary">
          <UserPlus size={17} />
          Register patient
        </Link>
      </div>

      {/* search + sort */}
      <div className="fade-up-1 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-xl">
          <Search
            size={17}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            className="input pl-11"
            placeholder="Search name, phone or city..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="inline-flex rounded-xl bg-white/50 border border-white/70 p-1 gap-1">
          <button
            onClick={() => setSort("newest")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              sort === "newest"
                ? "bg-ink-900 text-[#F6EBD3]"
                : "text-ink-700 hover:bg-mint-100"
            }`}
          >
            <Clock size={13} /> Newest
          </button>
          <button
            onClick={() => setSort("name")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              sort === "name"
                ? "bg-ink-900 text-[#F6EBD3]"
                : "text-ink-700 hover:bg-mint-100"
            }`}
          >
            <ArrowDownAZ size={13} /> Name
          </button>
        </div>
      </div>

      {/* filter chips */}
      <div className="fade-up-1 flex flex-wrap items-center gap-1.5">
        {/* Branch leads: it is the widest cut, and for a clinician it is
            the one already applied when the screen opens. Only shown when
            there is more than one site to choose between. */}
        {locations.length > 1 && !assignedBranchId && (
          <>
            <Chip active={branch === "all"} onClick={() => setBranch("all")}>
              <Building2 size={12} /> All branches
            </Chip>
            {locations.map((l) => (
              <Chip
                key={l.id}
                active={branch === l.id}
                onClick={() => setBranch(branch === l.id ? "all" : l.id)}
              >
                {l.short ?? l.name}
              </Chip>
            ))}
            <span className="w-px h-5 bg-[rgba(28,26,22,0.12)] mx-1.5 hidden sm:inline-block" />
          </>
        )}
        <Chip active={source === "all"} onClick={() => setSource("all")}>
          All sources
        </Chip>
        {presentSources.map((s) => (
          <Chip key={s} active={source === s} onClick={() => setSource(source === s ? "all" : s)}>
            {SOURCE_LABELS[s]}
          </Chip>
        ))}
        <span className="w-px h-5 bg-[rgba(28,26,22,0.12)] mx-1.5 hidden sm:inline-block" />
        <Chip active={onlyOpen} onClick={() => setOnlyOpen(!onlyOpen)}>
          <Stethoscope size={12} /> Open consult
        </Chip>
        <Chip active={onlyMarketing} onClick={() => setOnlyMarketing(!onlyMarketing)}>
          <Megaphone size={12} /> Marketing consent
        </Chip>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={28} />}
          title={filtersActive ? "No patients match those filters" : "No patients yet"}
          body={
            filtersActive
              ? "Loosen a filter, check the spelling, or register them as new."
              : "Register the first patient to begin."
          }
          action={
            <Link href="/patients/new" className="btn btn-secondary btn-sm">
              Register patient
            </Link>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 fade-up-2">
          {filtered.map((p) => {
            const consults = consultations
              .filter((c) => c.patient_id === p.id)
              .sort((a, b) => b.date.localeCompare(a.date));
            const latest = consults[0];
            const template = getTemplate(latest?.brief.primary_interest);
            return (
              <Link key={p.id} href={`/patients/${p.id}`}>
                <GlassCard hover className="p-5 h-full">
                  <div className="flex items-center gap-3.5">
                    <PatientAvatar patient={p} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-ink-900 truncate">
                        {p.name}
                      </div>
                      <div className="caption truncate">
                        {p.phone} · {p.city}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 flex-wrap">
                    {newArrivals.includes(p.id) && (
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold bg-mint-500 text-white pulse-mint">
                        NEW
                      </span>
                    )}
                    {template && (
                      <span className="chip chip-static text-xs">
                        {template.name}
                      </span>
                    )}
                    {latest && <StatusChip status={latest.status} />}
                    {consults.length > 1 && (
                      <span className="chip chip-static text-xs">Returning</span>
                    )}
                    <span className="chip chip-static text-xs">
                      {SOURCE_LABELS[p.source]}
                    </span>
                  </div>
                  <div className="caption mt-3">
                    Registered {relativeDay(p.created_at)}
                  </div>
                </GlassCard>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
