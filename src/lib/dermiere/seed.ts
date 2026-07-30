/**
 * Fictional Dermiere development data.
 *
 * Everything here is invented - names, numbers, messages, ratings. No real
 * patient information, and nothing from the CAPTURE demo clinic.
 *
 * The generator is deterministic given a seed and anchored to "now", so the
 * demo always has a today, an overdue follow-up and a recent conversation
 * whichever day it is shown. It writes through crmStore, so the same code
 * fills either backend.
 */

import type {
  Appointment,
  Asset,
  ClinicLocation,
  Consultation,
  Invoice,
  Patient,
  PlanItem,
  Report,
  TreatmentPlan,
} from "@/lib/types";
import { getTemplate } from "@/lib/templates";
import type {
  ContactStage,
  CrmContact,
  CrmConversation,
  CrmFeedback,
  CrmFollowUp,
  CrmMessage,
  LeadSource,
  MessageTemplate,
} from "@/lib/crm/types";
import { normalizePhone } from "@/lib/crm/phone";
import { DERMIERE_TREATMENTS } from "./clinic";

// ---------------------------------------------------------------------
// Deterministic pseudo-randomness (mulberry32) - same demo every run
// ---------------------------------------------------------------------

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86400000;

export interface DermiereSeed {
  patients: Patient[];
  /** Front portraits, so the 3D canvas and AI studio have a face to work on. */
  assets: Asset[];
  /** Worked-up consultations: brief, canvas morphs and the doctor's note. */
  consultations: Consultation[];
  plans: TreatmentPlan[];
  planItems: PlanItem[];
  reports: Report[];
  appointments: Appointment[];
  invoices: Invoice[];
  contacts: CrmContact[];
  followUps: CrmFollowUp[];
  conversations: CrmConversation[];
  messages: CrmMessage[];
  feedback: CrmFeedback[];
  templates: MessageTemplate[];
}

const FIRST_F = [
  "Ayesha", "Zainab", "Hira", "Mahnoor", "Sana", "Fatima", "Nimra", "Areeba",
  "Maryam", "Iqra", "Rabia", "Komal", "Anum", "Laiba", "Emaan", "Sadia",
  "Noor", "Amna", "Kiran", "Mehak", "Zoya", "Hafsa", "Rida", "Eman",
];
const FIRST_M = [
  "Hamza", "Usman", "Bilal", "Ahmed", "Faizan", "Talha", "Saad", "Zain",
  "Danish", "Hassan", "Umair", "Shayan", "Arsalan", "Fahad",
];
const LAST = [
  "Khan", "Malik", "Butt", "Sheikh", "Chaudhry", "Qureshi", "Siddiqui",
  "Raza", "Javed", "Iqbal", "Nawaz", "Farooq", "Aslam", "Hussain", "Baig",
  "Tariq", "Rehman", "Zafar", "Akhtar", "Mirza",
];

const SOURCES: LeadSource[] = [
  "instagram", "whatsapp", "walk_in", "referral", "google",
  "facebook", "phone", "website",
];

/** Weighted so the pipeline looks like a real funnel, not a flat spread. */
const STAGE_WEIGHTS: Array<[ContactStage, number]> = [
  ["new", 14],
  ["contacted", 12],
  ["consult_booked", 10],
  ["visited", 8],
  ["treatment_planned", 6],
  ["won", 16],
  ["lost", 9],
  ["archived", 3],
];

const LEAD_NOTES = [
  "Asked about pricing and downtime. Wants a package for two sessions.",
  "Saw the before/after reel on Instagram. Interested in the same protocol.",
  "Referred by an existing patient. Prefers weekend appointments.",
  "Has sensitive skin; wants a patch test before booking anything.",
  "Wedding in three months - asked what a full plan would look like.",
  "Comparing us with another clinic. Price-sensitive but keen.",
  "Called about a consultation slot. Works late, evenings only.",
  "Follow-up from the F-11 launch event. Collected details at the desk.",
];

const INBOUND_OPENERS = [
  "Assalam o alaikum, I wanted to ask about hydrafacial pricing please",
  "Hi! Do you have any appointment available this Saturday?",
  "Hello, I saw your page. How much for laser hair reduction full legs?",
  "Salam, is Dr. Hina available next week for a consultation?",
  "Hi, I did a peel last month. Skin is a bit dry, is that normal?",
  "Do you have a branch in Islamabad? I'm in F-11.",
];

function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

function weighted<T>(r: () => number, pairs: Array<[T, number]>): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of pairs) {
    if ((x -= w) <= 0) return v;
  }
  return pairs[pairs.length - 1][0];
}

function phoneFor(r: () => number): string {
  const prefixes = ["300", "301", "321", "322", "331", "333", "345"];
  const p = pick(r, prefixes);
  const rest = String(Math.floor(r() * 10_000_000)).padStart(7, "0");
  return `0${p}${rest}`;
}

function nameFor(r: () => number): { name: string; gender: "female" | "male" } {
  // Aesthetics clinics skew female; the demo should look plausible.
  const female = r() < 0.78;
  const first = female ? pick(r, FIRST_F) : pick(r, FIRST_M);
  return { name: `${first} ${pick(r, LAST)}`, gender: female ? "female" : "male" };
}

/**
 * Builds the whole fictional dataset.
 *
 * @param clinicId  the provisioned Dermiere clinic
 * @param branches  clinic locations, read from the clinic config (never hardcoded)
 * @param staff     staff ids by role so assignment looks realistic
 */
export function buildDermiereSeed(
  clinicId: string,
  branches: ClinicLocation[],
  staff: {
    ownerId: string;
    doctorByBranch: Record<string, string>;
    frontDeskByBranch: Record<string, string>;
    allFrontDesk: string[];
  },
  opts: { leads?: number; seed?: number } = {}
): DermiereSeed {
  const r = rng(opts.seed ?? 20260729);
  const leadCount = opts.leads ?? 64;
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();

  const branchIds = branches.map((b) => b.id);
  const bid = () => pick(r, branchIds);
  const deskFor = (b: string) =>
    staff.frontDeskByBranch[b] ?? staff.allFrontDesk[0] ?? staff.ownerId;
  const docFor = (b: string) => staff.doctorByBranch[b] ?? staff.ownerId;

  const patients: Patient[] = [];
  const appointments: Appointment[] = [];
  const invoices: Invoice[] = [];
  const contacts: CrmContact[] = [];
  const followUps: CrmFollowUp[] = [];
  const conversations: CrmConversation[] = [];
  const messages: CrmMessage[] = [];
  const feedback: CrmFeedback[] = [];

  const assets: Asset[] = [];
  const consultations: Consultation[] = [];
  const plans: TreatmentPlan[] = [];
  const planItems: PlanItem[] = [];
  const reports: Report[] = [];
  const converted: Array<{ patient: Patient; branch: string; interest: string }> =
    [];

  const usedPhones = new Set<string>();
  let invoiceSeq = 1;

  for (let i = 0; i < leadCount; i++) {
    const { name, gender } = nameFor(r);
    let phone = phoneFor(r);
    while (usedPhones.has(normalizePhone(phone))) phone = phoneFor(r);
    usedPhones.add(normalizePhone(phone));

    const branch = bid();
    const stage = weighted(r, STAGE_WEIGHTS);
    // Leads arrive across the last 90 days, denser recently.
    const ageDays = Math.floor(Math.pow(r(), 1.6) * 90);
    const createdMs = now - ageDays * DAY - Math.floor(r() * DAY);
    const contactId = `derm_contact_${i}`;
    const interest = [pick(r, DERMIERE_TREATMENTS).id];
    if (r() < 0.25) interest.push(pick(r, DERMIERE_TREATMENTS).id);

    const isWon = stage === "won";
    const patientId = isWon ? `derm_patient_${i}` : undefined;
    const assigned = r() < 0.85 ? deskFor(branch) : undefined;

    // First response: most leads get one, some (the interesting ones) don't.
    const responded = stage !== "new" || r() < 0.35;
    const firstResponseMs = responded
      ? createdMs + Math.floor((0.2 + r() * 20) * 3600_000)
      : undefined;

    const contact: CrmContact = {
      id: contactId,
      clinic_id: clinicId,
      patient_id: patientId,
      name,
      phone,
      phone_norm: normalizePhone(phone),
      email:
        r() < 0.45
          ? `${name.toLowerCase().replace(/[^a-z]/g, ".")}@example.com`
          : undefined,
      city: branch === branchIds[0] ? "Lahore" : "Islamabad",
      gender,
      stage,
      source: pick(r, SOURCES),
      treatment_interest: [...new Set(interest)],
      assigned_to: assigned,
      branch_id: branch,
      tags: r() < 0.3 ? [pick(r, ["vip", "price-sensitive", "referral", "repeat"])] : [],
      notes: r() < 0.6 ? pick(r, LEAD_NOTES) : undefined,
      estimated_value:
        interest.reduce(
          (s, id) => s + (DERMIERE_TREATMENTS.find((t) => t.id === id)?.price ?? 0),
          0
        ) || undefined,
      lost_reason:
        stage === "lost"
          ? pick(r, ["price", "went_elsewhere", "not_ready", "unreachable", "distance"] as const)
          : undefined,
      lost_note: stage === "lost" ? "Noted at the desk during the callback." : undefined,
      marketing_opt_in: r() < 0.72,
      created_at: iso(createdMs),
      updated_at: iso(createdMs + Math.floor(r() * 5 * DAY)),
      first_response_at: firstResponseMs ? iso(firstResponseMs) : undefined,
    };
    contacts.push(contact);

    // --- converted leads become patients with visits and invoices --------
    if (isWon && patientId) {
      const patient: Patient = {
        id: patientId,
        clinic_id: clinicId,
        name,
        phone,
        email: contact.email,
        gender,
        city: contact.city ?? "Lahore",
        language: r() < 0.5 ? "urdu" : "english",
        source: contact.source === "walk_in" ? "walk_in" : "social",
        clinical_flags: {},
        created_at: contact.created_at,
      };
      patients.push(patient);
      // Remembered so the clinical records below can pick a doctor at the
      // branch the patient actually attends.
      converted.push({ patient, branch, interest: interest[0] });

      // 1-3 completed visits; "returning" means 2+ completed visits.
      //
      // Every random draw for the visits happens HERE, before any date
      // comparison. Drawing inside a loop that breaks on "is this visit in
      // the past?" would make the number of draws depend on the wall clock,
      // which silently desynchronises the whole sequence from one day to the
      // next - and then ids stop being stable and re-seeding orphans rows.
      const visitCount = 1 + Math.floor(r() * 3);
      const visitPlans = Array.from({ length: visitCount }, (_, v) => ({
        offsetDays: (v + 1) * (7 + Math.floor(r() * 20)),
        treatment: pick(r, DERMIERE_TREATMENTS),
        paidByCard: r() < 0.5,
      }));

      for (const [v, plan] of visitPlans.entries()) {
        const visitMs = createdMs + plan.offsetDays * DAY;
        // `continue`, not `break`: the draws are already made, and skipping
        // a future visit must not change anything for the later ones.
        if (visitMs > now) continue;
        const treatment = plan.treatment;
        const apptId = `derm_appt_${i}_${v}`;
        appointments.push({
          id: apptId,
          patient_id: patientId,
          patient_name: name,
          phone,
          start: iso(visitMs),
          duration_min: 45,
          type: v === 0 ? "consultation" : "treatment",
          procedure_interest: treatment.id,
          source: "front_desk",
          status: "completed",
          location_id: branch,
          created_at: iso(visitMs - 3 * DAY),
          updated_at: iso(visitMs),
        });

        const qty = 1;
        const unit = treatment.price;
        const subtotal = unit * qty;
        const taxRate = 16;
        const taxAmount = Math.round((subtotal * taxRate) / 100);
        const prefix =
          branches.find((b) => b.id === branch)?.invoicePrefix ?? "INV";
        invoices.push({
          id: `derm_inv_${i}_${v}`,
          number: `${prefix}-${new Date(visitMs)
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, "")}-${String(invoiceSeq++).padStart(3, "0")}`,
          patient_id: patientId,
          patient_name: name,
          location_id: branch,
          items: [
            {
              id: `it_${i}_${v}`,
              ref: treatment.id,
              kind: "treatment",
              name: treatment.name,
              qty,
              unitPrice: unit,
              total: subtotal,
            },
          ],
          subtotal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          discount_amount: 0,
          total: subtotal + taxAmount,
          payment_method: plan.paidByCard ? "card" : "cash",
          status: "paid",
          cashier_id: deskFor(branch),
          created_at: iso(visitMs),
        });
      }
    }

    // --- upcoming appointments for booked consultations ------------------
    if (stage === "consult_booked") {
      const whenMs = now + Math.floor(r() * 10 * DAY);
      appointments.push({
        id: `derm_appt_up_${i}`,
        patient_name: name,
        phone,
        start: iso(whenMs),
        duration_min: 30,
        type: "consultation",
        procedure_interest: interest[0],
        source: "front_desk",
        status: "booked",
        location_id: branch,
        created_at: contact.created_at,
        updated_at: contact.updated_at,
      });
    }

    // --- no-shows, so branch comparison has a real no-show rate ----------
    if (r() < 0.08) {
      const missedMs = now - Math.floor(r() * 40 * DAY);
      appointments.push({
        id: `derm_appt_ns_${i}`,
        patient_id: patientId,
        patient_name: name,
        phone,
        start: iso(missedMs),
        duration_min: 30,
        type: "consultation",
        procedure_interest: interest[0],
        source: "front_desk",
        status: "no_show",
        location_id: branch,
        created_at: iso(missedMs - 4 * DAY),
        updated_at: iso(missedMs),
      });
    }

    // --- follow-ups -------------------------------------------------------
    // Deliberate mix: some due today, some overdue, plenty completed.
    if (!["archived"].includes(stage) && r() < 0.72) {
      const roll = r();
      let dueMs: number;
      let status: CrmFollowUp["status"] = "pending";
      let completedMs: number | undefined;

      if (roll < 0.18) {
        // due today
        dueMs = now + Math.floor((r() * 8 - 2) * 3600_000);
      } else if (roll < 0.36) {
        // overdue
        dueMs = now - (1 + Math.floor(r() * 9)) * DAY;
      } else if (roll < 0.62) {
        // upcoming
        dueMs = now + (1 + Math.floor(r() * 12)) * DAY;
      } else {
        // completed in the past
        dueMs = now - (2 + Math.floor(r() * 45)) * DAY;
        status = "completed";
        completedMs = dueMs + Math.floor(r() * 2 * DAY);
      }
      if (r() < 0.05) status = "cancelled";

      const type = pick(r, ["call", "whatsapp", "consultation", "post_treatment", "review_request"] as const);
      followUps.push({
        id: `derm_fu_${i}`,
        clinic_id: clinicId,
        contact_id: contactId,
        patient_id: patientId,
        title:
          type === "call"
            ? `Call ${name.split(" ")[0]} about the consultation`
            : type === "whatsapp"
            ? `WhatsApp the quote to ${name.split(" ")[0]}`
            : type === "post_treatment"
            ? `Post-treatment check - ${name.split(" ")[0]}`
            : type === "review_request"
            ? `Ask ${name.split(" ")[0]} for feedback`
            : `Confirm consultation slot - ${name.split(" ")[0]}`,
        description:
          r() < 0.5
            ? "Confirm they are still interested and offer the next available slot."
            : undefined,
        type,
        priority: weighted(r, [
          ["normal", 6],
          ["high", 3],
          ["low", 2],
        ] as Array<[CrmFollowUp["priority"], number]>),
        status,
        assigned_to: assigned ?? deskFor(branch),
        branch_id: branch,
        due_at: iso(dueMs),
        completed_at: completedMs ? iso(completedMs) : undefined,
        completion_note: completedMs ? "Spoke to the patient; noted on file." : undefined,
        cancelled_at: status === "cancelled" ? iso(dueMs) : undefined,
        cancel_reason: status === "cancelled" ? "Patient asked to be removed from callbacks." : undefined,
        rescheduled_from: r() < 0.15 ? [iso(dueMs - 3 * DAY)] : [],
        created_at: contact.created_at,
        created_by: deskFor(branch),
        updated_at: iso(Math.min(now, dueMs)),
      });
    }

    // --- conversations ----------------------------------------------------
    if (r() < 0.42) {
      const convId = `derm_conv_${i}`;
      const startMs = createdMs + Math.floor(r() * DAY);
      const thread: CrmMessage[] = [];
      const openerMs = startMs;

      thread.push({
        id: `derm_msg_${i}_0`,
        clinic_id: clinicId,
        conversation_id: convId,
        direction: "inbound",
        internal: false,
        body: pick(r, INBOUND_OPENERS),
        attachments: [],
        state: "read",
        provider: "mock",
        provider_message_id: `mock_in_${i}_0`,
        created_at: iso(openerMs),
        read_at: iso(openerMs + 600_000),
      });

      if (responded) {
        const replyMs = openerMs + Math.floor((0.3 + r() * 6) * 3600_000);
        thread.push({
          id: `derm_msg_${i}_1`,
          clinic_id: clinicId,
          conversation_id: convId,
          direction: "outbound",
          internal: false,
          body:
            "Walaikum assalam! Thank you for reaching out to Dermiere. " +
            "I've shared our current pricing below - would you like me to hold a slot for you this week?",
          attachments: [],
          state: pick(r, ["delivered", "read", "read", "sent"] as const),
          provider: "mock",
          provider_message_id: `mock_out_${i}_1`,
          author_id: assigned ?? deskFor(branch),
          created_at: iso(replyMs),
          sent_at: iso(replyMs),
          delivered_at: iso(replyMs + 30_000),
          read_at: r() < 0.7 ? iso(replyMs + 900_000) : undefined,
        });

        if (r() < 0.35) {
          const noteMs = replyMs + 300_000;
          thread.push({
            id: `derm_msg_${i}_2`,
            clinic_id: clinicId,
            conversation_id: convId,
            direction: "outbound",
            internal: true,
            body: "Internal: price-sensitive, offered the two-session package. Passing to Dr. for suitability.",
            attachments: [],
            state: "sent",
            provider: "mock",
            author_id: assigned ?? deskFor(branch),
            created_at: iso(noteMs),
            sent_at: iso(noteMs),
          });
        }
      }

      const last = thread[thread.length - 1];
      const unread = responded ? 0 : 1;
      conversations.push({
        id: convId,
        clinic_id: clinicId,
        contact_id: contactId,
        channel: "whatsapp",
        status: unread ? "open" : pick(r, ["open", "pending", "closed"] as const),
        assigned_to: assigned,
        branch_id: branch,
        last_message_at: last.created_at,
        last_message_preview: last.internal ? "Internal note" : last.body.slice(0, 90),
        unread_count: unread,
        created_at: iso(startMs),
        updated_at: last.created_at,
      });
      messages.push(...thread);
    }

    // --- feedback ---------------------------------------------------------
    // Only converted patients are asked for feedback - they are the ones
    // with completed visits, which keeps the response rate honest.
    if (isWon && r() < 0.85) {
      const fbMs = now - Math.floor(r() * 60 * DAY);
      // Mostly happy, with enough low scores for service recovery to matter.
      const overall = weighted(r, [
        [5, 46],
        [4, 26],
        [3, 12],
        [2, 8],
        [1, 5],
      ] as Array<[number, number]>);
      const low = overall <= 3;
      const resolved = low && r() < 0.55;
      feedback.push({
        id: `derm_fb_${i}`,
        clinic_id: clinicId,
        contact_id: contactId,
        patient_id: patientId,
        branch_id: branch,
        doctor_id: docFor(branch),
        overall_rating: overall,
        branch_rating: Math.max(1, Math.min(5, overall + (r() < 0.3 ? 1 : 0))),
        doctor_rating: Math.max(1, Math.min(5, overall + (r() < 0.4 ? 1 : 0))),
        treatment_rating: Math.max(1, Math.min(5, overall - (r() < 0.2 ? 1 : 0))),
        treatment_id: interest[0],
        comment: low
          ? pick(r, [
              "Waiting time was long even though I had an appointment.",
              "Treatment was fine but the results were not what I expected.",
              "Front desk was hard to reach on the phone for two days.",
            ])
          : pick(r, [
              "Lovely experience, the team explained everything clearly.",
              "Skin looks noticeably better. Dr. was very reassuring.",
              "Clean, calm and professional. Will be coming back.",
              "Booking was easy and the treatment was comfortable.",
            ]),
        recovery_status: low ? (resolved ? "resolved" : "open") : "none",
        assigned_to: low ? staff.ownerId : undefined,
        resolution_note: resolved
          ? "Called the patient, apologised for the wait and offered a complimentary review session. Accepted."
          : undefined,
        resolved_at: resolved ? iso(fbMs + 2 * DAY) : undefined,
        resolved_by: resolved ? staff.ownerId : undefined,
        created_at: iso(fbMs),
      });
    }
  }

  // --- guarantee some service-recovery cases ----------------------------
  // Low ratings are rare by design (see the weighting above), so a small
  // sample can easily produce none - and then the recovery workflow has
  // nothing to show. Rather than skew the ratings distribution, convert a
  // few existing rows so there is always at least one open case and one
  // resolved case to look at.
  const LOW_CASES = [
    {
      rating: 2,
      comment: "Waiting time was over an hour even though I had an appointment.",
      recovery: "open" as const,
    },
    {
      rating: 3,
      comment: "Treatment was fine but nobody explained the aftercare properly.",
      recovery: "in_progress" as const,
    },
    {
      rating: 1,
      comment: "Front desk did not answer my calls for two days after my session.",
      recovery: "resolved" as const,
    },
  ];

  const alreadyLow = feedback.filter(
    (f) => f.overall_rating <= 3
  ).length;
  if (alreadyLow < LOW_CASES.length) {
    // Take the most recent rows so the cases look current.
    const targets = feedback
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, LOW_CASES.length);
    targets.forEach((f, i) => {
      const c = LOW_CASES[i];
      if (!c) return;
      f.overall_rating = c.rating;
      f.branch_rating = Math.min(5, c.rating + 1);
      f.doctor_rating = Math.min(5, c.rating + 1);
      f.treatment_rating = c.rating;
      f.comment = c.comment;
      f.recovery_status = c.recovery;
      f.assigned_to = staff.ownerId;
      if (c.recovery === "resolved") {
        f.resolution_note =
          "Called the patient, apologised and booked a complimentary review session. Accepted.";
        f.resolved_at = iso(new Date(f.created_at).getTime() + 2 * DAY);
        f.resolved_by = staff.ownerId;
      } else {
        f.resolution_note = undefined;
        f.resolved_at = undefined;
        f.resolved_by = undefined;
      }
    });
  }

  // --- message templates (mirrors the Meta approval lifecycle) -----------
  const templates: MessageTemplate[] = [
    {
      id: "tpl_appointment_reminder",
      clinic_id: clinicId,
      name: "appointment_reminder",
      status: "approved",
      language: "en",
      category: "utility",
      body: "Hello {{1}}, this is a reminder of your appointment at Dermiere {{2}} on {{3}}. Reply STOP to opt out.",
      variables: ["patient_name", "branch", "datetime"],
      created_at: new Date(now - 40 * DAY).toISOString(),
    },
    {
      id: "tpl_consult_followup",
      clinic_id: clinicId,
      name: "consultation_followup",
      status: "approved",
      language: "en",
      category: "utility",
      body: "Hi {{1}}, thank you for visiting Dermiere. Would you like us to hold a slot for your {{2}}?",
      variables: ["patient_name", "treatment"],
      created_at: new Date(now - 30 * DAY).toISOString(),
    },
    {
      id: "tpl_feedback_request",
      clinic_id: clinicId,
      name: "feedback_request",
      status: "pending",
      language: "en",
      category: "utility",
      body: "Hi {{1}}, how was your visit to Dermiere {{2}}? Your feedback helps us improve: {{3}}",
      variables: ["patient_name", "branch", "link"],
      created_at: new Date(now - 6 * DAY).toISOString(),
    },
  ];

  // -------------------------------------------------------------------
  // Worked-up clinical records
  //
  // A demo is only convincing if some patients are already part-way through
  // the workflow: a face on file, a brief the doctor filled in, morphs
  // pushed around on the canvas, a plan and a generated report. These are
  // the patients to open when showing the consult journey.
  //
  // The portraits are the three bundled demo faces, matched on gender so
  // the record reads as one person. More portraits in /public/seed means
  // more worked-up patients: the list below is the only thing to extend.
  // -------------------------------------------------------------------

  const PORTRAITS: Array<{
    url: string;
    gender: "female" | "male";
    /** a procedure id from templates.ts, so canvas + AI sliders populate */
    procedure: string;
    concerns: string[];
    goal: string;
    note: string;
    morphs: Record<string, number>;
  }> = [
    {
      url: "/seed/mahnoor_front.jpg",
      gender: "female",
      procedure: "lip_filler",
      concerns: ["lips", "skin"],
      goal: "I want my lips a little fuller but still natural, and my skin looks tired in photographs.",
      note: "Discussed 1 ml hyaluronic filler across upper and lower lip, lower-weighted to keep the balance natural. Skin texture to be addressed separately with a HydraFacial course.",
      morphs: { lip_upper_volume: 34, lip_lower_volume: 46, lip_ratio: 18, cupids_bow: 22 },
    },
    {
      url: "/seed/zainab_front.jpg",
      gender: "female",
      procedure: "pigmentation",
      concerns: ["skin", "cheeks"],
      goal: "The dark patches on my cheeks have got worse since summer and makeup does not cover them any more.",
      note: "Melasma pattern across both cheeks, moderate. Starting a pigmentation correction course with strict photoprotection; reassess at week six before considering any resurfacing.",
      morphs: { pigment_evenness: 52, tone_clarity: 40 },
    },
    {
      url: "/seed/hassan_front.jpg",
      gender: "male",
      procedure: "chin_jaw",
      concerns: ["jaw", "chin"],
      goal: "I would like a stronger jawline. I do not want anything that looks obvious.",
      note: "Good skeletal base, mild soft-tissue laxity along the jawline. Conservative filler to the chin and jaw angles, staged over two sessions.",
      morphs: { scale_jaw: 28, chin_projection: 24 },
    },
  ];

  const usedForPortrait = new Set<string>();
  for (const portrait of PORTRAITS) {
    const match = converted.find(
      (c) => c.patient.gender === portrait.gender && !usedForPortrait.has(c.patient.id)
    );
    if (!match) continue;
    usedForPortrait.add(match.patient.id);

    const { patient, branch } = match;
    const doctorId = docFor(branch);
    // Dated a few days after registration: the consult follows the enquiry.
    const consultMs = Date.parse(patient.created_at) + 3 * DAY;
    const suffix = patient.id.replace(/^derm_patient_/, "");

    assets.push({
      id: `derm_asset_front_${suffix}`,
      patient_id: patient.id,
      kind: "photo_front",
      storage_url: portrait.url,
      visit_date: iso(consultMs).slice(0, 10),
      meta: { label: "Front photo" },
      created_at: iso(consultMs),
    });

    const consultId = `derm_consult_${suffix}`;
    consultations.push({
      id: consultId,
      patient_id: patient.id,
      doctor_id: doctorId,
      clinic_id: clinicId,
      date: iso(consultMs),
      brief: {
        primary_interest: portrait.procedure,
        interests: [portrait.procedure],
        concerns: portrait.concerns,
        goal_text: portrait.goal,
        flags: {
          first_treatment: true,
          budget_sensitive: false,
          timeline: "ready_now",
          medical_tourism: false,
        },
      },
      canvas_state: { morphs: portrait.morphs, annotations: [] },
      doctor_note: portrait.note,
      status: "completed",
    });

    // Plan built from the procedure's own template, exactly as the app
    // does when a doctor accepts a template during the consult.
    const template = getTemplate(portrait.procedure);
    const planId = `derm_plan_${suffix}`;
    plans.push({
      id: planId,
      consultation_id: consultId,
      template_id: template?.id,
      summary: template
        ? `${template.name} as visualized and agreed during consultation.`
        : "Plan agreed during consultation.",
      status: "accepted",
      created_at: iso(consultMs),
    });
    (template?.plan_template ?? []).forEach((item, i) => {
      planItems.push({
        id: `derm_planitem_${suffix}_${i}`,
        plan_id: planId,
        kind: item.kind,
        label: item.label,
        detail: item.detail,
        due:
          item.offset_days !== undefined
            ? iso(consultMs + item.offset_days * DAY).slice(0, 10)
            : undefined,
        // Anything already due in the past has been done.
        done:
          item.offset_days !== undefined &&
          consultMs + item.offset_days * DAY < now,
        order: i,
      });
    });

    reports.push({
      id: `derm_report_${suffix}`,
      consultation_id: consultId,
      generated_at: iso(consultMs + 2 * 3600000),
    });
  }

  return {
    patients,
    assets,
    consultations,
    plans,
    planItems,
    reports,
    appointments,
    invoices,
    contacts,
    followUps,
    conversations,
    messages,
    feedback,
    templates,
  };
}
