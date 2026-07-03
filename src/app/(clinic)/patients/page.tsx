"use client";

import Link from "next/link";
import { useState } from "react";
import { Search, UserPlus, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { relativeDay, SOURCE_LABELS } from "@/lib/format";
import { getTemplate } from "@/lib/templates";
import { GlassCard, EmptyState, StatusChip } from "@/components/ui";
import { PatientAvatar } from "@/components/PatientAvatar";

export default function PatientsPage() {
  const patients = useStore((s) => s.patients);
  const consultations = useStore((s) => s.consultations);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, "");
  const filtered = patients.filter((p) => {
    if (!q) return true;
    const phoneDigits = p.phone.replace(/\D/g, "");
    return (
      p.name.toLowerCase().includes(q) ||
      (digits.length >= 3 && phoneDigits.includes(digits)) ||
      p.city.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="fade-up flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="h1 text-ink-900">Patients</h1>
          <p className="caption mt-0.5">
            {patients.length} on record · search by name or phone
          </p>
        </div>
        <Link href="/patients/new" className="btn btn-primary">
          <UserPlus size={17} />
          Register patient
        </Link>
      </div>

      <div className="relative fade-up-1 max-w-xl">
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

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={28} />}
          title={q ? "No patients match that search" : "No patients yet"}
          body={
            q
              ? "Check the spelling or register them as a new patient."
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
