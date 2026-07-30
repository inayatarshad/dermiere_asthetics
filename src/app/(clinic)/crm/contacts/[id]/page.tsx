"use client";

/**
 * One contact - profile, unified timeline, follow-ups, conversations,
 * feedback.
 *
 * The timeline mixes CRM activity with the clinical record the app already
 * holds (appointments, invoices, treatment plans), assembled server-side.
 * That is the point of the "unified" requirement: this is the history of a
 * person, not a CRM-only shadow of them.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  CalendarPlus,
  FileText,
  Inbox,
  MessageSquare,
  Star,
  StickyNote,
  UserCheck,
} from "lucide-react";
import {
  ALL_STAGES,
  LEAD_SOURCE_LABELS,
  LOST_REASON_LABELS,
  followUpState,
  type ContactStage,
  type CrmActivity,
} from "@/lib/crm/types";
import {
  convertContact,
  createFollowUp,
  dateTime,
  fetchContact,
  money,
  relativeTime,
  titleize,
  updateContact,
  type ContactDetailResponse,
} from "@/lib/crm/client";
import { formatPhone } from "@/lib/crm/phone";
import { useSessionUser, useStore } from "@/lib/store";
import { crmCan } from "@/lib/crm/permissions";
import type { Patient } from "@/lib/types";
import { EmptyState, Field, GlassCard, Modal, Spinner } from "@/components/ui";
import { Pill, StageBadge, SubHeading } from "@/components/crm/CrmUi";

const KIND_ICON: Record<string, typeof StickyNote> = {
  lead_created: UserCheck,
  note: StickyNote,
  assignment: UserCheck,
  stage_change: BadgeCheck,
  followup_created: CalendarPlus,
  followup_completed: BadgeCheck,
  followup_rescheduled: CalendarPlus,
  followup_cancelled: CalendarPlus,
  message_in: Inbox,
  message_out: MessageSquare,
  conversation_assigned: Inbox,
  feedback: Star,
  appointment: CalendarPlus,
  visit: BadgeCheck,
  treatment_plan: FileText,
  invoice: FileText,
  converted: BadgeCheck,
};

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useSessionUser();
  const users = useStore((s) => s.users);
  const locations = useStore((s) => s.locations);

  const [data, setData] = useState<ContactDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteOpen, setNoteOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchContact(id);
      if (cancelled) return;
      setData(res);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  /** Re-fetch after a mutation (event-handler path, not an effect). */
  const load = useCallback(async () => {
    setData(await fetchContact(id));
  }, [id]);

  const staffName = (sid?: string) =>
    users.find((u) => u.id === sid)?.name ?? (sid ? "Unknown" : "Unassigned");
  const branchName = (bid?: string) =>
    locations?.find((l) => l.id === bid)?.short ?? (bid ? titleize(bid) : "-");

  if (loading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="Contact not found"
        body="This lead may have been removed."
        action={
          <Link href="/crm/leads" className="btn btn-secondary btn-sm">
            Back to pipeline
          </Link>
        }
      />
    );
  }

  const { contact, patient, patientSummary, timeline, followUps, conversations, feedback } =
    data;
  // A CRM account has no Clinic OS navigation, so the full patient screen is
  // not reachable for them - their patient detail is rendered here instead.
  const isCrmWorkspace = user?.workspace === "crm";

  const changeStage = async (stage: ContactStage) => {
    setBusy(true);
    await updateContact(contact.id, { stage });
    await load();
    setBusy(false);
  };

  const convert = async () => {
    setBusy(true);
    const res = await convertContact(contact.id);
    setBusy(false);
    if (res.ok) await load();
  };

  const canConvert = crmCan(user?.role, "convert_lead");

  return (
    <div className="space-y-5">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-ink-700 hover:text-ink-900"
      >
        <ArrowLeft size={15} /> Back
      </button>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* --- profile --- */}
        <div className="lg:col-span-1 space-y-4">
          <GlassCard className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="h2 text-ink-900">{contact.name}</h1>
                <a
                  href={`tel:${contact.phone_norm}`}
                  className="text-sm text-mint-600 font-medium"
                >
                  {formatPhone(contact.phone)}
                </a>
                {contact.email && (
                  <div className="caption mt-0.5 break-all">{contact.email}</div>
                )}
              </div>
              <StageBadge stage={contact.stage} />
            </div>

            <div className="flex flex-wrap gap-1.5 mt-3">
              <Pill tone="sky">
                {LEAD_SOURCE_LABELS[contact.source] ?? contact.source}
              </Pill>
              {contact.branch_id && <Pill>{branchName(contact.branch_id)}</Pill>}
              {contact.treatment_interest.map((t) => (
                <Pill key={t} tone="teal">
                  {titleize(t)}
                </Pill>
              ))}
              {contact.tags.map((t) => (
                <Pill key={t} tone="amber">
                  {t}
                </Pill>
              ))}
              {contact.opted_out_at && <Pill tone="rose">Opted out</Pill>}
            </div>

            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Assigned to" value={staffName(contact.assigned_to)} />
              <Row label="Created" value={dateTime(contact.created_at)} />
              <Row
                label="First response"
                value={
                  contact.first_response_at
                    ? relativeTime(contact.first_response_at)
                    : "Not yet responded"
                }
              />
              {contact.estimated_value ? (
                <Row label="Estimated value" value={money(contact.estimated_value)} />
              ) : null}
              <Row
                label="Marketing consent"
                value={contact.marketing_opt_in ? "Given" : "Not given"}
              />
              {contact.lost_reason && (
                <Row
                  label="Lost reason"
                  value={LOST_REASON_LABELS[contact.lost_reason] ?? contact.lost_reason}
                />
              )}
            </dl>

            {contact.notes && (
              <p className="mt-3 text-sm text-ink-700 leading-relaxed border-t border-white/60 pt-3">
                {contact.notes}
              </p>
            )}

            <div className="mt-4 space-y-2">
              <Field label="Pipeline stage">
                <select
                  className="input"
                  value={contact.stage}
                  disabled={busy}
                  onChange={(e) => void changeStage(e.target.value as ContactStage)}
                >
                  {ALL_STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setNoteOpen(true)}
                >
                  <StickyNote size={14} /> Add note
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setFollowUpOpen(true)}
                >
                  <CalendarPlus size={14} /> Follow-up
                </button>
              </div>

              {/* Conversion never re-enters the person: it links to an
                  existing patient when the number already matches one. */}
              {contact.patient_id ? (
                // Only offer the Clinic OS screen to accounts that can
                // actually open it; a CRM account would be redirected.
                !isCrmWorkspace ? (
                  <Link
                    href={`/patients/${contact.patient_id}`}
                    className="btn btn-primary btn-sm w-full"
                  >
                    <BadgeCheck size={14} /> Open full patient record
                  </Link>
                ) : null
              ) : canConvert ? (
                <button
                  className="btn btn-primary btn-sm w-full"
                  onClick={() => void convert()}
                  disabled={busy}
                >
                  {busy ? <Spinner className="w-4 h-4" /> : <BadgeCheck size={14} />}
                  Convert to patient
                </button>
              ) : null}
            </div>
          </GlassCard>

          {/* --- the registry record, shown in place --- */}
          {patient && (
            <GlassCard className="p-5">
              <SubHeading
                action={
                  <span className="text-[10px] text-ink-400">
                    Patient registry
                  </span>
                }
              >
                Patient record
              </SubHeading>

              {patientSummary && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <MiniStat label="Visits" value={patientSummary.visits} />
                  <MiniStat label="Upcoming" value={patientSummary.upcoming} />
                  <MiniStat
                    label="No-shows"
                    value={patientSummary.noShows}
                    tone={patientSummary.noShows > 0 ? "bad" : undefined}
                  />
                  <MiniStat
                    label="Billed"
                    value={
                      patientSummary.invoiceCount > 0
                        ? money(patientSummary.totalBilled)
                        : "-"
                    }
                  />
                </div>
              )}

              <dl className="space-y-2 text-sm">
                {patient.age != null && (
                  <Row label="Age" value={String(patient.age)} />
                )}
                {patient.dob && <Row label="Date of birth" value={patient.dob} />}
                <Row label="Gender" value={titleize(patient.gender)} />
                {patient.city && <Row label="City" value={patient.city} />}
                <Row label="Language" value={titleize(patient.language)} />
                <Row label="Registered" value={dateTime(patient.created_at)} />
                {patientSummary?.lastVisit && (
                  <Row
                    label="Last visit"
                    value={relativeTime(patientSummary.lastVisit)}
                  />
                )}
              </dl>

              <ClinicalFlagList flags={patient.clinical_flags} />
            </GlassCard>
          )}

          {/* --- related --- */}
          {conversations.length > 0 && (
            <GlassCard className="p-5">
              <SubHeading>Conversations</SubHeading>
              <div className="space-y-2">
                {conversations.map((c) => (
                  <Link
                    key={c.id}
                    href={`/crm/inbox?c=${c.id}`}
                    className="block glass-subtle p-3 hover:bg-mint-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-ink-900 capitalize">
                        {c.channel} · {c.status}
                      </span>
                      <span className="text-[10px] text-ink-400">
                        {relativeTime(c.last_message_at)}
                      </span>
                    </div>
                    {c.last_message_preview && (
                      <p className="text-xs text-ink-700 mt-1 line-clamp-2">
                        {c.last_message_preview}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </GlassCard>
          )}

          {followUps.length > 0 && (
            <GlassCard className="p-5">
              <SubHeading>Follow-ups</SubHeading>
              <div className="space-y-2">
                {followUps.map((f) => {
                  const state = followUpState(f);
                  return (
                    <div key={f.id} className="glass-subtle p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium text-ink-900">
                          {f.title}
                        </span>
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
                      </div>
                      <div className="text-[10px] text-ink-400 mt-1">
                        {dateTime(f.due_at)} · {staffName(f.assigned_to)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          )}

          {feedback.length > 0 && (
            <GlassCard className="p-5">
              <SubHeading>Feedback</SubHeading>
              <div className="space-y-2">
                {feedback.map((f) => (
                  <div key={f.id} className="glass-subtle p-3">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          size={12}
                          className={
                            i <= f.overall_rating
                              ? "text-amber-500 fill-amber-500"
                              : "text-ink-200"
                          }
                        />
                      ))}
                      <span className="text-[10px] text-ink-400 ml-1">
                        {relativeTime(f.created_at)}
                      </span>
                    </div>
                    {f.comment && (
                      <p className="text-xs text-ink-700 mt-1">{f.comment}</p>
                    )}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>

        {/* --- timeline --- */}
        <GlassCard className="lg:col-span-2 p-5">
          <SubHeading>Timeline</SubHeading>
          {timeline.length === 0 ? (
            <EmptyState
              title="Nothing recorded yet"
              body="Notes, messages, follow-ups, visits and invoices all appear here."
            />
          ) : (
            <ol className="relative space-y-4 pl-6">
              <div
                className="absolute left-[9px] top-2 bottom-2 w-px bg-mint-200"
                aria-hidden
              />
              {timeline.map((a) => (
                <TimelineItem key={a.id} activity={a} staffName={staffName} />
              ))}
            </ol>
          )}
        </GlassCard>
      </div>

      {/* Mounted only while open, so they open with fresh state. */}
      {noteOpen && (
        <NoteModal
          onClose={() => setNoteOpen(false)}
          contactId={contact.id}
          onSaved={() => {
            setNoteOpen(false);
            void load();
          }}
        />
      )}
      {followUpOpen && (
        <FollowUpModal
          onClose={() => setFollowUpOpen(false)}
          contactId={contact.id}
          branchId={contact.branch_id}
          contactName={contact.name}
          onSaved={() => {
            setFollowUpOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "bad";
}) {
  return (
    <div className="glass-subtle px-3 py-2">
      <div className="caption">{label}</div>
      <div
        className={`text-base font-medium ${
          tone === "bad" ? "text-rose-700" : "text-ink-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Clinical flags worth seeing next to a phone number - the things that
 * change how you speak to someone before a treatment. Rendered only when the
 * registry actually holds them; an empty record says so plainly.
 */
function ClinicalFlagList({ flags }: { flags: Patient["clinical_flags"] }) {
  if (!flags) return null;
  const notes: Array<[string, string]> = [];
  if (flags.allergies) notes.push(["Allergies", flags.allergies]);
  if (flags.medications) notes.push(["Medications", flags.medications]);
  if (flags.prior_treatments) notes.push(["Prior treatments", flags.prior_treatments]);
  if (flags.notes) notes.push(["Notes", flags.notes]);

  const badges: string[] = [];
  if (flags.blood_thinners) badges.push("Blood thinners");
  if (flags.prior_surgery) badges.push("Prior surgery");
  if (flags.keloid_tendency) badges.push("Keloid tendency");
  if (flags.pregnancy_breastfeeding) badges.push("Pregnant / breastfeeding");
  if (flags.fitzpatrick) badges.push(`Fitzpatrick ${flags.fitzpatrick}`);

  if (notes.length === 0 && badges.length === 0) {
    return (
      <p className="caption mt-3 pt-3 border-t border-white/60">
        No clinical flags recorded.
      </p>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-white/60">
      <div className="caption mb-1.5">Clinical flags</div>
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {badges.map((b) => (
            <Pill key={b} tone="rose">
              {b}
            </Pill>
          ))}
        </div>
      )}
      {notes.map(([k, v]) => (
        <p key={k} className="text-xs text-ink-700 mb-1">
          <span className="text-ink-400">{k}: </span>
          {v}
        </p>
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="caption shrink-0">{label}</dt>
      <dd className="text-sm text-ink-900 text-right">{value}</dd>
    </div>
  );
}

function TimelineItem({
  activity,
  staffName,
}: {
  activity: CrmActivity;
  staffName: (id?: string) => string;
}) {
  const Icon = KIND_ICON[activity.kind] ?? StickyNote;
  return (
    <li className="relative">
      <span className="absolute -left-6 top-0.5 w-[18px] h-[18px] rounded-full bg-mint-100 border border-white flex items-center justify-center">
        <Icon size={10} className="text-ink-700" />
      </span>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink-900">{activity.summary}</span>
        <span
          className="text-[10px] text-ink-400 shrink-0"
          title={dateTime(activity.created_at)}
        >
          {relativeTime(activity.created_at)}
        </span>
      </div>
      {activity.detail && (
        <p className="text-sm text-ink-700 mt-0.5 leading-relaxed">
          {activity.detail}
        </p>
      )}
      {activity.actor_id && (
        <span className="text-[10px] text-ink-400">
          {staffName(activity.actor_id)}
        </span>
      )}
    </li>
  );
}

function NoteModal({
  onClose,
  contactId,
  onSaved,
}: {
  onClose: () => void;
  contactId: string;
  onSaved: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <Modal open onClose={onClose} title="Add a note">
      <Field label="Note">
        <textarea
          className="input min-h-[100px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What happened?"
        />
      </Field>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={!text.trim() || saving}
          onClick={() => {
            void (async () => {
              setSaving(true);
              await updateContact(contactId, { note_append: text.trim() });
              setSaving(false);
              onSaved();
            })();
          }}
        >
          {saving ? <Spinner className="w-4 h-4" /> : <StickyNote size={15} />}
          Save note
        </button>
      </div>
    </Modal>
  );
}

/** Tomorrow at 11:00, in the datetime-local format. */
function defaultDue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(11, 0, 0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function FollowUpModal({
  onClose,
  contactId,
  contactName,
  branchId,
  onSaved,
}: {
  onClose: () => void;
  contactId: string;
  contactName: string;
  branchId?: string;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(`Call ${contactName.split(" ")[0]}`);
  const [due, setDue] = useState(defaultDue);
  const [type, setType] = useState("call");
  const [priority, setPriority] = useState("normal");
  const [saving, setSaving] = useState(false);

  return (
    <Modal open onClose={onClose} title="Schedule a follow-up">
      <div className="space-y-3">
        <Field label="Title">
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Due">
            <input
              className="input"
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </Field>
          <Field label="Type">
            <select
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="call">Call</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="consultation">Consultation</option>
              <option value="post_treatment">Post-treatment</option>
              <option value="review_request">Review request</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Priority">
            <select
              className="input"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!title.trim() || !due || saving}
            onClick={() => {
              void (async () => {
                setSaving(true);
                await createFollowUp({
                  contact_id: contactId,
                  title,
                  due_at: new Date(due).toISOString(),
                  type,
                  priority,
                  branch_id: branchId,
                });
                setSaving(false);
                onSaved();
              })();
            }}
          >
            {saving ? <Spinner className="w-4 h-4" /> : <CalendarPlus size={15} />}
            Schedule
          </button>
        </div>
      </div>
    </Modal>
  );
}
