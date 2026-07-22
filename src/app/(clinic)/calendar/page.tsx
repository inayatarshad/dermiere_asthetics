"use client";

/**
 * Calendar — the clinic's appointment book. Week grid on desktop, single
 * day on mobile. Slots derive from clinic hours; free cells book on tap.
 * VYBERO's phone bookings arrive via the shared server book (VyberoAgent
 * pull) and are badged; local bookings push up so the agent's
 * availability stays truthful.
 */

import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Phone,
  RadioTower,
  User as UserIcon,
  Plus,
  Check,
  X,
  MapPin,
} from "lucide-react";
import { useStore, useSessionUser } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import type { Appointment, AppointmentStatus } from "@/lib/types";
import { TEMPLATES, getTemplate } from "@/lib/templates";
import { findTreatment, CAPTURE_TREATMENTS } from "@/lib/capture/kb";
import {
  addDays,
  appointmentsOn,
  dateKey,
  freeSlotCount,
  minutesIntoDay,
  openMinutes,
  slotIsFree,
  slotLabel,
  slotOffsets,
  slotToISO,
  startOfWeek,
} from "@/lib/calendar";
import { GlassCard, Chip, Field, Modal, SectionTitle } from "@/components/ui";

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  booked: "bg-mint-100 border-mint-400 text-ink-900",
  confirmed: "bg-mint-500/90 border-mint-500 text-white",
  completed: "bg-white/70 border-ink-400/40 text-ink-400",
  cancelled: "bg-white/40 border-ink-400/20 text-ink-400 line-through",
  no_show: "bg-amber-100 border-amber-400 text-amber-900",
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  booked: "Booked",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

function SourceIcon({ source }: { source: Appointment["source"] }) {
  if (source === "vybero") return <Phone size={11} className="shrink-0" />;
  if (source === "booth") return <RadioTower size={11} className="shrink-0" />;
  return <UserIcon size={11} className="shrink-0" />;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Push a local create/update to the shared server book (best effort). */
function pushToServer(appt: Appointment) {
  void fetch("/api/vybero/book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(appt),
  }).catch(() => {});
}

export default function CalendarPage() {
  const mounted = useMounted();
  const user = useSessionUser();
  const allAppointments = useStore((s) => s.appointments);
  const patients = useStore((s) => s.patients);
  const clinicHours = useStore((s) => s.clinicHours);
  const locations = useStore((s) => s.locations);
  const addAppointment = useStore((s) => s.addAppointment);
  const updateAppointment = useStore((s) => s.updateAppointment);

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [dayIdx, setDayIdx] = useState(() => (new Date().getDay() + 6) % 7);
  const [booking, setBooking] = useState<{ key: string; offset: number } | null>(null);
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [locFilter, setLocFilter] = useState<string>("experience-centre");

  // per-location diary: slots and blocks belong to the selected site
  const appointments = useMemo(
    () =>
      locFilter === "all"
        ? allAppointments
        : allAppointments.filter(
            (a) => (a.location_id ?? "experience-centre") === locFilter
          ),
    [allAppointments, locFilter]
  );

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d) =>
        clinicHours.days.includes(d.getDay())
      ),
    [weekStart, clinicHours.days]
  );
  const offsets = useMemo(() => slotOffsets(clinicHours), [clinicHours]);
  const totalMin = openMinutes(clinicHours);
  const todayKey = dateKey(new Date());

  if (!mounted || !user) return null;

  const weekLabel = `${days[0]?.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${days[days.length - 1]?.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

  const dayColumn = (d: Date) => {
    const key = dateKey(d);
    const dayAppts = appointmentsOn(appointments, key);
    return (
      // absolute-fill so the %-height slot cells and %-top appointment
      // blocks resolve against the column's definite height
      <div key={key} className="absolute inset-0">
        {/* slot grid (click to book) */}
        {offsets.map((o) => {
          const free = slotIsFree(appointments, key, o, clinicHours);
          return (
            <button
              key={o}
              className={`block w-full border-b border-white/50 transition-colors ${
                free ? "hover:bg-mint-100/70 cursor-pointer" : "cursor-default"
              }`}
              style={{ height: `${(clinicHours.slot_min / totalMin) * 100}%` }}
              onClick={() => free && setBooking({ key, offset: o })}
              aria-label={free ? `Book ${slotLabel(o, clinicHours)}` : undefined}
              tabIndex={free ? 0 : -1}
            />
          );
        })}
        {/* appointment blocks */}
        {dayAppts.map((a) => {
          const top = (minutesIntoDay(a.start, clinicHours) / totalMin) * 100;
          const height = (a.duration_min / totalMin) * 100;
          if (top < 0 || top >= 100) return null;
          return (
            <button
              key={a.id}
              onClick={() => setDetail(a)}
              className={`absolute left-0.5 right-0.5 rounded-lg border-l-4 px-1.5 py-0.5 text-left shadow-sm overflow-hidden ${STATUS_STYLES[a.status]}`}
              style={{ top: `${top}%`, height: `calc(${height}% - 2px)` }}
              title={`${a.patient_name} · ${timeLabel(a.start)} · ${STATUS_LABELS[a.status]}`}
            >
              <span className="flex items-center gap-1 text-[11px] font-semibold leading-tight truncate">
                <SourceIcon source={a.source} />
                {a.patient_name}
              </span>
              <span className="block text-[10px] opacity-80 leading-tight truncate">
                {timeLabel(a.start)}
                {a.procedure_interest
                  ? ` · ${
                      a.procedure_interest === "consultation"
                        ? "Consultation"
                        : (getTemplate(a.procedure_interest)?.name ??
                          findTreatment(a.procedure_interest)?.short ??
                          a.procedure_interest)
                    }`
                  : ""}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fade-up">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <SectionTitle
          title="Calendar"
          sub={`Open ${clinicHours.open}–${clinicHours.close} · ${freeSlotCount(appointments, todayKey, clinicHours)} free slots today · VYBERO books into the same diary`}
        />
        <div className="flex items-center gap-1.5">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Previous week"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setWeekStart(startOfWeek(new Date()));
              setDayIdx((new Date().getDay() + 6) % 7);
            }}
          >
            Today
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Next week"
          >
            <ChevronRight size={16} />
          </button>
          <button
            className="btn btn-primary btn-sm ml-2"
            onClick={() =>
              setBooking({ key: todayKey, offset: offsets[0] ?? 0 })
            }
          >
            <Plus size={15} />
            New booking
          </button>
        </div>
      </div>

      {/* location filter — each CAPTURE site keeps its own diary */}
      {locations.length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          {locations.map((l) => (
            <Chip
              key={l.id}
              active={locFilter === l.id}
              onClick={() => setLocFilter(l.id)}
            >
              <MapPin size={12} /> {l.short}
            </Chip>
          ))}
          <Chip active={locFilter === "all"} onClick={() => setLocFilter("all")}>
            All locations
          </Chip>
        </div>
      )}

      {/* mobile day picker */}
      <div className="flex gap-1.5 flex-wrap mb-3 lg:hidden">
        {days.map((d, i) => (
          <Chip key={dateKey(d)} active={i === dayIdx} onClick={() => setDayIdx(i)}>
            {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
          </Chip>
        ))}
      </div>

      <GlassCard strong className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-ink-900 inline-flex items-center gap-1.5">
            <CalendarDays size={15} className="text-mint-500" />
            {weekLabel}
          </span>
          <span className="caption hidden sm:flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><Phone size={11} /> VYBERO</span>
            <span className="inline-flex items-center gap-1"><UserIcon size={11} /> Front desk</span>
            <span className="inline-flex items-center gap-1"><RadioTower size={11} /> Booth</span>
          </span>
        </div>

        <div className="flex gap-1">
          {/* time gutter */}
          <div className="w-14 shrink-0" style={{ height: "560px" }}>
            <div className="relative h-full">
              {offsets.map((o) => (
                <span
                  key={o}
                  className="absolute right-2 -translate-y-1/2 text-[10px] text-ink-400"
                  style={{ top: `${(o / totalMin) * 100}%` }}
                >
                  {slotLabel(o, clinicHours)}
                </span>
              ))}
            </div>
          </div>

          {/* desktop: full week */}
          <div className="hidden lg:flex flex-1 gap-1" style={{ height: "560px" }}>
            {days.map((d) => (
              <div key={dateKey(d)} className="flex-1 min-w-0 flex flex-col">
                <div
                  className={`text-center text-xs font-medium pb-1.5 ${
                    dateKey(d) === todayKey ? "text-mint-500" : "text-ink-700"
                  }`}
                >
                  {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}
                </div>
                <div
                  className={`relative flex-1 rounded-xl overflow-hidden ${
                    dateKey(d) === todayKey ? "bg-mint-100/40" : "bg-white/40"
                  }`}
                >
                  {dayColumn(d)}
                </div>
              </div>
            ))}
          </div>

          {/* mobile: one day (clamped: closed days shrink the array) */}
          <div className="lg:hidden flex-1" style={{ height: "560px" }}>
            {days.length > 0 && (
              <div className="relative h-full rounded-xl overflow-hidden bg-white/40">
                {dayColumn(days[Math.min(dayIdx, days.length - 1)])}
              </div>
            )}
          </div>
        </div>
      </GlassCard>

      {booking && (
        <BookingModal
          slot={booking}
          onClose={() => setBooking(null)}
          onCreate={(data) => {
            // bookings land in the diary currently on screen
            const appt = addAppointment({
              ...data,
              location_id:
                locFilter === "all" ? "experience-centre" : locFilter,
            });
            pushToServer(appt);
            setBooking(null);
          }}
          patients={patients.map((p) => ({ id: p.id, name: p.name }))}
          appointments={appointments}
        />
      )}

      {detail && (
        <DetailModal
          appt={appointments.find((a) => a.id === detail.id) ?? detail}
          onClose={() => setDetail(null)}
          onStatus={(status) => {
            updateAppointment(detail.id, { status });
            const current = useStore
              .getState()
              .appointments.find((a) => a.id === detail.id);
            if (current) pushToServer(current);
            setDetail(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Booking modal
// ---------------------------------------------------------------------

function BookingModal({
  slot,
  onClose,
  onCreate,
  patients,
  appointments,
}: {
  slot: { key: string; offset: number };
  onClose: () => void;
  onCreate: (
    a: Omit<Appointment, "id" | "created_at" | "updated_at" | "status">
  ) => void;
  patients: { id: string; name: string }[];
  appointments: Appointment[];
}) {
  const clinicHours = useStore((s) => s.clinicHours);
  const freeOffsets = slotOffsets(clinicHours).filter((o) =>
    slotIsFree(appointments, slot.key, o, clinicHours)
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // the tapped slot when it is genuinely free, else the first free slot —
  // never let a taken time be pre-selected and silently double-booked
  const [offset, setOffset] = useState(() =>
    freeOffsets.includes(slot.offset) ? slot.offset : (freeOffsets[0] ?? 0)
  );
  const [duration, setDuration] = useState(clinicHours.slot_min);
  const [type, setType] = useState<Appointment["type"]>("consultation");
  const [procedure, setProcedure] = useState("");
  const [notes, setNotes] = useState("");
  const linked = patients.find(
    (p) => p.name.toLowerCase() === name.trim().toLowerCase()
  );

  const dayLabel = new Date(`${slot.key}T00:00:00`).toLocaleDateString(
    "en-GB",
    { weekday: "long", day: "numeric", month: "long" }
  );

  return (
    <Modal open onClose={onClose} title={`New booking · ${dayLabel}`}>
      <div className="space-y-3">
        <Field label="Patient name">
          <input
            className="input"
            list="cal-patients"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Type a name, or pick an existing patient"
            autoFocus
          />
          <datalist id="cal-patients">
            {patients.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone (optional)">
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+92 3xx xxxxxxx"
            />
          </Field>
          <Field label="Time">
            <select
              className="input"
              value={offset}
              onChange={(e) => setOffset(Number(e.target.value))}
            >
              {freeOffsets.map((o) => (
                <option key={o} value={o}>
                  {slotLabel(o, clinicHours)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Duration">
            <select
              className="input"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              {[30, 45, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value as Appointment["type"])}
            >
              <option value="consultation">Consultation</option>
              <option value="treatment">Treatment</option>
              <option value="follow_up">Follow-up</option>
            </select>
          </Field>
        </div>
        <Field label="Procedure interest (optional)">
          <select
            className="input"
            value={procedure}
            onChange={(e) => setProcedure(e.target.value)}
          >
            <option value="">Not specified</option>
            <optgroup label="CAPTURE signature treatments">
              {CAPTURE_TREATMENTS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Aesthetic procedures (partner clinics)">
              {TEMPLATES.filter((t) => t.available).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        <Field label="Notes (optional)">
          <input
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. referred by Dr. Imran"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!name.trim() || freeOffsets.length === 0}
            onClick={() =>
              onCreate({
                patient_id: linked?.id,
                patient_name: name.trim(),
                phone: phone.trim() || undefined,
                start: slotToISO(slot.key, offset, clinicHours),
                duration_min: duration,
                type,
                procedure_interest: procedure || undefined,
                source: "front_desk",
                notes: notes.trim() || undefined,
              })
            }
          >
            <Check size={15} />
            Book {slotLabel(offset, clinicHours)}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Appointment detail / status modal
// ---------------------------------------------------------------------

function DetailModal({
  appt,
  onClose,
  onStatus,
}: {
  appt: Appointment;
  onClose: () => void;
  onStatus: (s: AppointmentStatus) => void;
}) {
  const procedureName =
    appt.procedure_interest === "consultation"
      ? "Consultation"
      : (getTemplate(appt.procedure_interest)?.name ??
        (appt.procedure_interest
          ? findTreatment(appt.procedure_interest)?.name
          : undefined));
  const when = new Date(appt.start);
  return (
    <Modal open onClose={onClose} title={appt.patient_name}>
      <div className="space-y-2 text-sm text-ink-700">
        <p className="flex items-center gap-2">
          <CalendarDays size={14} className="text-mint-500 shrink-0" />
          {when.toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}{" "}
          · {timeLabel(appt.start)} · {appt.duration_min} min
        </p>
        <p className="flex items-center gap-2">
          <SourceIcon source={appt.source} />
          {appt.source === "vybero"
            ? "Booked by VYBERO (phone agent)"
            : appt.source === "booth"
              ? "Booked at the booth"
              : "Booked by front desk"}
          <span className="chip chip-static text-[11px] ml-1">
            {STATUS_LABELS[appt.status]}
          </span>
        </p>
        {appt.phone && <p>Phone: {appt.phone}</p>}
        {procedureName && <p>Interest: {procedureName}</p>}
        {appt.notes && <p className="caption">{appt.notes}</p>}
      </div>
      <div className="flex flex-wrap gap-2 justify-end mt-5">
        {appt.patient_id && (
          <a
            className="btn btn-secondary"
            href={`/assessment/${appt.patient_id}`}
            title="Generate the free one-page aesthetic assessment from the front photo"
          >
            Assessment Report
          </a>
        )}
        {appt.status === "booked" && (
          <button className="btn btn-secondary" onClick={() => onStatus("confirmed")}>
            <Check size={15} />
            Confirm
          </button>
        )}
        {(appt.status === "booked" || appt.status === "confirmed") && (
          <>
            <button className="btn btn-secondary" onClick={() => onStatus("completed")}>
              Completed
            </button>
            <button className="btn btn-ghost" onClick={() => onStatus("no_show")}>
              No-show
            </button>
            <button className="btn btn-ghost" onClick={() => onStatus("cancelled")}>
              <X size={15} />
              Cancel booking
            </button>
          </>
        )}
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
