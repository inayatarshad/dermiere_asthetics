"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  CalendarClock,
  ClipboardCheck,
  UserPlus,
  ArrowRight,
  Play,
  ReceiptText,
  LineChart,
} from "lucide-react";
import { useStore, useSessionUser, can } from "@/lib/store";
import { firstName, formatDateTime, isToday, SOURCE_LABELS } from "@/lib/format";
import { getTemplate } from "@/lib/templates";
import { GlassCard, SectionTitle, StatCard, EmptyState, StatusChip } from "@/components/ui";
import { PatientAvatar } from "@/components/PatientAvatar";

export default function DashboardPage() {
  const router = useRouter();
  const user = useSessionUser();
  const patients = useStore((s) => s.patients);
  const consultations = useStore((s) => s.consultations);
  const plans = useStore((s) => s.plans);
  const invoices = useStore((s) => s.invoices);
  const createConsultation = useStore((s) => s.createConsultation);
  const users = useStore((s) => s.users);
  const newArrivals = useStore((s) => s.newArrivals);

  const revenueToday = invoices
    .filter((i) => isToday(i.created_at) && i.status === "paid")
    .reduce((s, i) => s + i.total, 0);

  const openConsults = consultations.filter((c) => c.status === "open");
  const waiting = patients.filter(
    (p) =>
      isToday(p.created_at) &&
      !consultations.some((c) => c.patient_id === p.id)
  );
  const inProgressPlans = plans.filter((p) => p.status === "in_progress");

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const startConsultation = (patientId: string) => {
    if (!user || !can.runConsultation(user.role)) return;
    const c = createConsultation(patientId, user.id);
    router.push(`/consultations/${c.id}`);
  };

  const doctorFor = (id: string) => users.find((u) => u.id === id)?.name ?? "";

  return (
    <div className="space-y-8">
      <div className="fade-up flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl sm:text-4xl text-ink-900">
            {greeting},{" "}
            <span className="font-normal">{firstName(user?.name ?? "")}</span>
          </h1>
          <p className="caption mt-1.5">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Investment & configuration sheet (admin-only, incl. Ryan) —
              a self-contained static doc, opened in its own tab */}
          {can.manageUsers(user?.role) && (
            <a
              href="/financials.html"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              <LineChart size={17} />
              Financials
            </a>
          )}
          <Link href="/patients/new" className="btn btn-primary">
            <UserPlus size={17} />
            Register patient
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 fade-up-1">
        <StatCard
          label="Patients"
          value={patients.length}
          icon={<Users size={20} />}
        />
        <StatCard
          label="In today's queue"
          value={waiting.length + openConsults.length}
          icon={<CalendarClock size={20} />}
          accent
        />
        <StatCard
          label="Revenue today"
          value={`Rs. ${revenueToday.toLocaleString("en-PK")}`}
          icon={<ReceiptText size={20} />}
        />
        <StatCard
          label="Plans in progress"
          value={inProgressPlans.length}
          icon={<ClipboardCheck size={20} />}
        />
      </div>

      <section className="fade-up-2">
        <SectionTitle
          title="Today's queue"
          sub="Front desk prepares, doctor decides"
          className="mb-4"
        />
        {waiting.length === 0 && openConsults.length === 0 ? (
          <EmptyState
            icon={<CalendarClock size={28} />}
            title="The queue is clear"
            body="Newly registered patients and open consultations appear here for the doctor to pick up."
            action={
              <Link href="/patients/new" className="btn btn-secondary btn-sm">
                Register a patient
              </Link>
            }
          />
        ) : (
          <div className="space-y-2.5">
            {openConsults.map((c) => {
              const patient = patients.find((p) => p.id === c.patient_id);
              if (!patient) return null;
              const template = getTemplate(c.brief.primary_interest);
              return (
                <GlassCard
                  key={c.id}
                  className="flex items-center gap-4 px-5 py-3.5"
                >
                  <PatientAvatar patient={patient} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-ink-900">
                        {patient.name}
                      </span>
                      <StatusChip status="open" />
                      {template && (
                        <span className="chip chip-static text-xs">
                          {template.name}
                        </span>
                      )}
                    </div>
                    <div className="caption mt-0.5 truncate">
                      Started {formatDateTime(c.date)} · {doctorFor(c.doctor_id)}
                      {c.brief.goal_text ? ` · "${c.brief.goal_text}"` : ""}
                    </div>
                  </div>
                  {can.runConsultation(user?.role) ? (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => router.push(`/consultations/${c.id}`)}
                    >
                      <Play size={14} />
                      Resume
                    </button>
                  ) : (
                    <Link
                      href={`/patients/${patient.id}`}
                      className="btn btn-secondary btn-sm"
                    >
                      View
                    </Link>
                  )}
                </GlassCard>
              );
            })}

            {waiting.map((p) => (
              <GlassCard key={p.id} className="flex items-center gap-4 px-5 py-3.5">
                <PatientAvatar patient={p} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-ink-900">{p.name}</span>
                    {newArrivals.includes(p.id) && (
                      <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold bg-mint-500 text-white pulse-mint">
                        NEW
                      </span>
                    )}
                    <span className="chip chip-static text-xs">Waiting</span>
                    <span className="chip chip-static text-xs">
                      {SOURCE_LABELS[p.source]}
                    </span>
                  </div>
                  <div className="caption mt-0.5">
                    Registered {formatDateTime(p.created_at)} · {p.city}
                  </div>
                </div>
                {can.runConsultation(user?.role) ? (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => startConsultation(p.id)}
                  >
                    <Play size={14} />
                    Start consultation
                  </button>
                ) : (
                  <Link
                    href={`/patients/${p.id}`}
                    className="btn btn-secondary btn-sm"
                  >
                    View profile
                  </Link>
                )}
              </GlassCard>
            ))}
          </div>
        )}
      </section>

      <section className="fade-up-3">
        <SectionTitle
          title="Recent patients"
          action={
            <Link
              href="/patients"
              className="btn btn-ghost btn-sm"
            >
              All patients
              <ArrowRight size={14} />
            </Link>
          }
          className="mb-4"
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {patients.slice(0, 6).map((p) => {
            const latest = latestConsultFor(consultations, p.id);
            const template = getTemplate(latest?.brief.primary_interest);
            return (
              <Link key={p.id} href={`/patients/${p.id}`}>
                <GlassCard hover className="p-5 h-full">
                  <div className="flex items-center gap-3.5">
                    <PatientAvatar patient={p} />
                    <div className="min-w-0">
                      <div className="font-medium text-ink-900 truncate">
                        {p.name}
                      </div>
                      <div className="caption">
                        {p.age ? `${p.age} · ` : ""}
                        {p.city}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3.5 flex gap-1.5 flex-wrap">
                    {template && (
                      <span className="chip chip-static text-xs">
                        {template.name}
                      </span>
                    )}
                    {latest && <StatusChip status={latest.status} />}
                    {!latest && (
                      <span className="chip chip-static text-xs">New</span>
                    )}
                  </div>
                </GlassCard>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function latestConsultFor(
  consultations: { patient_id: string; date: string; brief: { primary_interest: string | null }; status: string }[],
  patientId: string
) {
  return consultations
    .filter((c) => c.patient_id === patientId)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}
