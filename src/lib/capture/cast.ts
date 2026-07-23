/**
 * CAPTURE demo cast — the deterministic story the demo clinic wakes up
 * with. One place builds every record (patients, consents, photos, open
 * consultation, appointments, VYBERO calls, invoices, reviews, Capture
 * Circle rewards, MARK-VU scans) so the server seed (clinicStore) and the
 * client fallback seed (seed.ts) can never drift apart.
 *
 * Isomorphic: no browser APIs, no fs — safe on server and client.
 * Deterministic RNG (mulberry32) so every reseed tells the same story.
 */

import type {
  Appointment,
  Asset,
  CallOutcome,
  ClinicReview,
  Consent,
  Consultation,
  Invoice,
  InvoiceItem,
  Patient,
  Reward,
  ReviewInvite,
  SkinAnalysis,
  User,
  VyberoCall,
  Role,
} from "@/lib/types";
import { CONSENT_TEXT_VERSION } from "@/lib/types";
import {
  CAPTURE_LOCATIONS,
  CAPTURE_TREATMENTS,
  CAPTURE_PRODUCTS,
  findTreatment,
} from "./kb";

export const CAPTURE_DEMO_PASSWORD = "capture";

// ---------------------------------------------------------------------
// Deterministic utilities
// ---------------------------------------------------------------------

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic ids (uuid-shaped, seeded) so reseeds are stable. */
function makeIdFactory(rnd: () => number) {
  const hex = "0123456789abcdef";
  return () => {
    let s = "";
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) s += "-";
      else if (i === 14) s += "4";
      else s += hex[Math.floor(rnd() * 16)];
    }
    return s;
  };
}

// ---------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------

export interface CastStaff {
  key: "doctor" | "ops" | "marketing" | "creative" | "frontdesk";
  name: string;
  email: string;
  role: Role;
  title: string;
}

/** The CAPTURE team from the client meeting (roles mapped to app roles). */
export const CAPTURE_STAFF: CastStaff[] = [
  { key: "doctor", name: "Dr. Sadia Khan", email: "dr.sadia@capture.cc", role: "doctor", title: "Medical Director" },
  { key: "ops", name: "Shah Rukh Ahmed", email: "shahrukh@capture.cc", role: "admin", title: "Head of Operations" },
  { key: "marketing", name: "Rameez Hasan", email: "rameez@capture.cc", role: "admin", title: "Marketing Lead" },
  // Ryan leads the CAPTURE project — full workspace access (owner 2026-07-23)
  { key: "creative", name: "Ryan Hikmat", email: "ryan@capture.cc", role: "admin", title: "Creative Director" },
  { key: "frontdesk", name: "Amal Fatima", email: "frontdesk@capture.cc", role: "front_desk", title: "Front Desk · Experience Centre" },
];

// ---------------------------------------------------------------------
// The cast
// ---------------------------------------------------------------------

export interface CaptureCast {
  patients: Patient[];
  consents: Consent[];
  assets: Asset[];
  consultations: Consultation[];
  appointments: Appointment[];
  vyberoCalls: VyberoCall[];
  invoices: Invoice[];
  reviews: ClinicReview[];
  reviewInvites: ReviewInvite[];
  rewards: Reward[];
  skinAnalyses: SkinAnalysis[];
}

interface StaffIds {
  doctorId: string;
  doctorName: string;
  frontDeskId: string;
}

const EC = "experience-centre";
const SC = "skin-clinic-haroon";
const AD = "alta-derm-nazia";
const EX = "experts-ashba";

/** Build the whole demo story around "now". */
export function buildCaptureCast(
  clinicId: string,
  staff: StaffIds,
  taxRate = 16
): CaptureCast {
  const rnd = mulberry32(20260718);
  const uid = makeIdFactory(rnd);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

  const now = new Date();
  const at = (dayOffset: number, hour: number, minute = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  const iso = (d: Date) => d.toISOString();
  const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

  // -------------------------------------------------------------------
  // Patients
  // -------------------------------------------------------------------

  const mkPatient = (
    p: Omit<Patient, "id" | "clinic_id" | "created_at"> & { createdDaysAgo: number }
  ): Patient => ({
    ...p,
    id: uid(),
    clinic_id: clinicId,
    created_at: iso(at(-p.createdDaysAgo, 11)),
  });

  const mahnoor = mkPatient({
    name: "Mahnoor Baig",
    phone: "0300 8471234",
    email: "mahnoor.b@gmail.com",
    age: 27,
    gender: "female",
    city: "Lahore",
    language: "english",
    source: "social",
    clinical_flags: {
      allergies: "None known",
      fitzpatrick: 3,
      prior_treatments: "Regular facials; first regenerative programme",
      notes: "Wedding on the 14th of next month — glow programme timed to it.",
    },
    createdDaysAgo: 24,
  });

  const zainab = mkPatient({
    name: "Zainab Qureshi",
    phone: "0333 2218765",
    email: "zainabq@outlook.com",
    age: 24,
    gender: "female",
    city: "Islamabad",
    language: "english",
    source: "social",
    clinical_flags: {
      allergies: "None known",
      fitzpatrick: 2,
      prior_treatments: "Topical acne treatment (2024)",
      notes: "Post-acne texture; on EXOMERE Skin Implant course.",
    },
    createdDaysAgo: 38,
  });

  const hassan = mkPatient({
    name: "Hassan Raza",
    phone: "0321 5540987",
    age: 32,
    gender: "male",
    city: "Karachi",
    language: "urdu",
    source: "vibro",
    clinical_flags: {
      allergies: "Penicillin",
      fitzpatrick: 4,
      notes: "Booked via VYBERO; training recovery + sleep quality goals.",
    },
    createdDaysAgo: 16,
  });

  const amina = mkPatient({
    name: "Amina Shahid",
    phone: "0345 7761120",
    email: "amina.shahid@gmail.com",
    age: 34,
    gender: "female",
    city: "Lahore",
    language: "urdu",
    source: "referral",
    clinical_flags: {
      allergies: "None known",
      fitzpatrick: 3,
      pregnancy_breastfeeding: false,
      prior_treatments: "None",
      notes: "Post-partum abdomen focus; two Body Contour sessions completed.",
    },
    createdDaysAgo: 31,
  });

  const zara = mkPatient({
    name: "Zara Iqbal",
    phone: "0301 9985532",
    email: "zara.iqbal@hotmail.com",
    age: 41,
    gender: "female",
    city: "Lahore",
    language: "english",
    source: "walk_in",
    clinical_flags: {
      allergies: "Aspirin (mild)",
      fitzpatrick: 3,
      prior_treatments: "HydraFacial course (2025)",
      notes: "Jawline definition + pigmentation; MARK-VU baseline taken.",
    },
    createdDaysAgo: 9,
  });

  const bilal = mkPatient({
    name: "Bilal Chaudhry",
    phone: "0322 4478810",
    age: 38,
    gender: "male",
    city: "Lahore",
    language: "urdu",
    source: "vibro",
    clinical_flags: {
      fitzpatrick: 4,
      notes: "Regeneration session for dull, tired skin; frequent traveller.",
    },
    createdDaysAgo: 12,
  });

  const patients = [mahnoor, zainab, hassan, amina, zara, bilal];

  // -------------------------------------------------------------------
  // Consents (all treatment+photography; marketing varies)
  // -------------------------------------------------------------------

  const consents: Consent[] = [];
  const grant = (p: Patient, type: Consent["type"], granted: boolean) =>
    consents.push({
      id: uid(),
      patient_id: p.id,
      type,
      granted,
      granted_at: p.created_at,
      captured_by: staff.frontDeskId,
      text_version: CONSENT_TEXT_VERSION,
    });
  for (const p of patients) {
    grant(p, "treatment", true);
    grant(p, "photography", true);
  }
  grant(mahnoor, "marketing", true);
  grant(zainab, "marketing", true);
  grant(amina, "marketing", false);
  grant(zara, "marketing", true);

  // -------------------------------------------------------------------
  // Photo assets (bundled demo portraits)
  // -------------------------------------------------------------------

  const assets: Asset[] = [];
  const addPhoto = (p: Patient, url: string) => {
    assets.push({
      id: uid(),
      patient_id: p.id,
      kind: "photo_front",
      storage_url: url,
      visit_date: dateOnly(new Date(p.created_at)),
      created_at: p.created_at,
    });
  };
  addPhoto(mahnoor, "/seed/mahnoor_front.jpg");
  addPhoto(hassan, "/seed/hassan_front.jpg");
  addPhoto(zainab, "/seed/zainab_front.jpg");

  // -------------------------------------------------------------------
  // Zara's open consultation (doctor demo of the consult workflow)
  // -------------------------------------------------------------------

  const zaraConsult: Consultation = {
    id: uid(),
    patient_id: zara.id,
    doctor_id: staff.doctorId,
    clinic_id: clinicId,
    date: iso(at(0, 10, 30)),
    brief: {
      primary_interest: "skin_tightening",
      interests: ["skin_tightening", "pigmentation"],
      concerns: ["jaw", "skin"],
      goal_text:
        "My jawline has softened and the sun spots are getting harder to cover. I want to look fresher without needles.",
      flags: {
        first_treatment: false,
        budget_sensitive: false,
        timeline: "ready_now",
        medical_tourism: false,
      },
    },
    canvas_state: { morphs: {}, annotations: [] },
    doctor_note: "",
    status: "open",
  };

  // -------------------------------------------------------------------
  // MARK-VU skin analyses (progress deltas sell the tracking story)
  // -------------------------------------------------------------------

  const skinAnalyses: SkinAnalysis[] = [
    {
      id: uid(),
      patient_id: mahnoor.id,
      taken_at: iso(at(-24, 11, 20)),
      metrics: { pigmentation: 62, pores: 48, wrinkles: 22, sebum: 55, uv_damage: 58, moisture: 41 },
      notes: "Intake scan. Pigmentation + dehydration primary.",
      created_at: iso(at(-24, 11, 25)),
    },
    {
      id: uid(),
      patient_id: mahnoor.id,
      taken_at: iso(at(-3, 17, 10)),
      metrics: { pigmentation: 48, pores: 42, wrinkles: 20, sebum: 49, uv_damage: 55, moisture: 58 },
      notes: "After session 2 — pigmentation −14, moisture +17.",
      created_at: iso(at(-3, 17, 15)),
    },
    {
      id: uid(),
      patient_id: zainab.id,
      taken_at: iso(at(-38, 12, 0)),
      metrics: { pigmentation: 44, pores: 66, wrinkles: 18, sebum: 61, uv_damage: 39, moisture: 45 },
      notes: "Intake scan. Post-acne texture, enlarged pores.",
      created_at: iso(at(-38, 12, 5)),
    },
    {
      id: uid(),
      patient_id: zainab.id,
      taken_at: iso(at(-6, 16, 40)),
      metrics: { pigmentation: 38, pores: 52, wrinkles: 17, sebum: 50, uv_damage: 37, moisture: 56 },
      notes: "After session 3 of the Implant course — pores −14.",
      created_at: iso(at(-6, 16, 45)),
    },
    {
      id: uid(),
      patient_id: zara.id,
      taken_at: iso(at(-9, 13, 30)),
      metrics: { pigmentation: 71, pores: 44, wrinkles: 47, sebum: 38, uv_damage: 66, moisture: 39 },
      notes: "Baseline. UV damage and pigmentation lead; laxity visible on jawline.",
      created_at: iso(at(-9, 13, 35)),
    },
  ];

  // -------------------------------------------------------------------
  // Invoices — ~3 weeks of billing across the four locations
  // -------------------------------------------------------------------

  const invoices: Invoice[] = [];
  const invoiceSeq: Record<string, number> = {};

  const price = (ref: string): { name: string; price: number; kind: InvoiceItem["kind"] } => {
    const t = findTreatment(ref);
    if (t) return { name: t.name, price: t.pricePkr, kind: "treatment" };
    const p = CAPTURE_PRODUCTS.find((x) => x.id === ref);
    if (p) return { name: p.name, price: p.pricePkr, kind: p.kind === "regimen" ? "regimen" : "product" };
    return { name: ref, price: 0, kind: "product" };
  };

  const mkInvoice = (opts: {
    daysAgo: number;
    hour: number;
    patient?: Patient;
    patientName?: string;
    locationId: string;
    items: Array<{ ref: string; qty?: number }>;
    method?: Invoice["payment_method"];
    rewardCode?: string;
    discount?: number;
  }): Invoice => {
    const when = at(-opts.daysAgo, opts.hour, Math.floor(rnd() * 50));
    const loc = CAPTURE_LOCATIONS.find((l) => l.id === opts.locationId)!;
    const dayKey = `${loc.invoicePrefix}-${dateOnly(when).replace(/-/g, "")}`;
    invoiceSeq[dayKey] = (invoiceSeq[dayKey] ?? 0) + 1;
    const items: InvoiceItem[] = opts.items.map((it) => {
      const info = price(it.ref);
      const qty = it.qty ?? 1;
      return {
        id: uid(),
        ref: it.ref,
        kind: info.kind,
        name: info.name,
        qty,
        unitPrice: info.price,
        total: info.price * qty,
      };
    });
    const subtotal = items.reduce((s, x) => s + x.total, 0);
    const discount = opts.discount ?? 0;
    const taxable = Math.max(0, subtotal - discount);
    const tax = Math.round((taxable * taxRate) / 100);
    const inv: Invoice = {
      id: uid(),
      number: `${dayKey}-${String(invoiceSeq[dayKey]).padStart(3, "0")}`,
      patient_id: opts.patient?.id,
      patient_name: opts.patient?.name ?? opts.patientName ?? "Walk-in client",
      location_id: opts.locationId,
      items,
      subtotal,
      tax_rate: taxRate,
      tax_amount: tax,
      discount_amount: discount,
      reward_code: opts.rewardCode,
      total: taxable + tax,
      payment_method: opts.method ?? (rnd() < 0.55 ? "card" : "cash"),
      cashier_id: staff.frontDeskId,
      cashier_name: "Amal Fatima",
      status: "paid",
      created_at: iso(when),
    };
    invoices.push(inv);
    return inv;
  };

  // Mahnoor: glow course sessions 1 + 2 (products attached)
  mkInvoice({ daysAgo: 24, hour: 13, patient: mahnoor, locationId: EC, items: [{ ref: "mito-regenerative-glow" }, { ref: "recovery-balm-21" }] });
  const mahnoorInv2 = mkInvoice({ daysAgo: 10, hour: 17, patient: mahnoor, locationId: EC, items: [{ ref: "mito-regenerative-glow" }, { ref: "aroma-mist" }], method: "card" });
  // Zainab: implant course sessions
  mkInvoice({ daysAgo: 31, hour: 15, patient: zainab, locationId: EC, items: [{ ref: "exomere-face-implant" }] });
  mkInvoice({ daysAgo: 20, hour: 15, patient: zainab, locationId: EC, items: [{ ref: "exomere-face-implant" }, { ref: "pdrn-spicus" }] });
  const zainabInv3 = mkInvoice({ daysAgo: 6, hour: 16, patient: zainab, locationId: EC, items: [{ ref: "exomere-face-implant" }, { ref: "regimen-post-care" }], method: "card" });
  // Hassan: two full body resets
  mkInvoice({ daysAgo: 14, hour: 19, patient: hassan, locationId: EC, items: [{ ref: "mito-full-body-reset" }] });
  const hassanInv2 = mkInvoice({ daysAgo: 4, hour: 19, patient: hassan, locationId: EC, items: [{ ref: "mito-full-body-reset" }, { ref: "s-body-concentrator" }] });
  // Amina: body contour sessions
  mkInvoice({ daysAgo: 26, hour: 12, patient: amina, locationId: EC, items: [{ ref: "exomere-body-contour" }] });
  const aminaInv2 = mkInvoice({ daysAgo: 12, hour: 12, patient: amina, locationId: EC, items: [{ ref: "exomere-body-contour" }, { ref: "s-body-concentrator" }], method: "cash" });
  // Bilal: regeneration
  const bilalInv = mkInvoice({ daysAgo: 8, hour: 18, patient: bilal, locationId: EC, items: [{ ref: "exomere-regeneration" }] });
  // Partner-clinic billing
  mkInvoice({ daysAgo: 17, hour: 14, patientName: "Sana Javed", locationId: SC, items: [{ ref: "exomere-face-implant" }, { ref: "ceramide-recell" }] });
  mkInvoice({ daysAgo: 15, hour: 16, patientName: "Maha Aslam", locationId: AD, items: [{ ref: "exomere-regeneration" }] });
  mkInvoice({ daysAgo: 11, hour: 13, patientName: "Kiran Baig", locationId: EX, items: [{ ref: "exomere-body-contour" }] });
  mkInvoice({ daysAgo: 7, hour: 15, patientName: "Rabia Anwar", locationId: SC, items: [{ ref: "exomere-face-contour" }, { ref: "botani-v-serum" }] });
  mkInvoice({ daysAgo: 5, hour: 12, patientName: "Mehreen Shah", locationId: AD, items: [{ ref: "exomere-face-implant" }] });
  // Retail-only tickets
  mkInvoice({ daysAgo: 9, hour: 16, patientName: "Walk-in client", locationId: EC, items: [{ ref: "tea-tree-cleanser" }, { ref: "rose-garden-mask", qty: 2 }] });
  mkInvoice({ daysAgo: 3, hour: 13, patientName: "Walk-in client", locationId: EC, items: [{ ref: "regimen-daily-care" }] });
  mkInvoice({ daysAgo: 2, hour: 17, patientName: "Hina Tariq", locationId: EC, items: [{ ref: "glutathione-melashot" }, { ref: "eyeron-shot" }] });
  // Today's tickets (dashboard "revenue today")
  mkInvoice({ daysAgo: 0, hour: 11, patientName: "Walk-in client", locationId: EC, items: [{ ref: "recovery-balm-25" }] });
  mkInvoice({ daysAgo: 0, hour: 12, patient: zara, locationId: EC, items: [{ ref: "exomere-face-contour" }], method: "card" });

  // -------------------------------------------------------------------
  // Reviews + Capture Circle rewards
  // -------------------------------------------------------------------

  const reviews: ClinicReview[] = [];
  const rewards: Reward[] = [];
  const reviewInvites: ReviewInvite[] = [];

  const tokenChars = "abcdefghjkmnpqrstuvwxyz23456789";
  const mkToken = () => {
    let s = "";
    for (let i = 0; i < 16; i++) s += tokenChars[Math.floor(rnd() * tokenChars.length)];
    return s;
  };
  const mkCode = () => {
    const c = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 4; i++) s += c[Math.floor(rnd() * c.length)];
    return `CIRCLE-${s}`;
  };

  const mkReview = (opts: {
    daysAgo: number;
    patient?: Patient;
    patientName?: string;
    locationId: string;
    treatments: string[];
    rating: number;
    comment: string;
    highlights?: string[];
    invoice?: Invoice;
    reward?: "issued" | "redeemed" | "redeemed-on" | "expired" | "none";
    redeemInvoice?: Invoice;
  }) => {
    const when = at(-opts.daysAgo, 20, Math.floor(rnd() * 50));
    const inviteId = uid();
    const reviewId = uid();
    const review: ClinicReview = {
      id: reviewId,
      invite_id: inviteId,
      patient_id: opts.patient?.id,
      patient_name: opts.patient?.name ?? opts.patientName ?? "CAPTURE client",
      location_id: opts.locationId,
      treatments: opts.treatments,
      staff_name: staff.doctorName,
      rating: opts.rating,
      comment: opts.comment,
      highlights: opts.highlights ?? [],
      invoice_id: opts.invoice?.id,
      created_at: iso(when),
    };
    reviews.push(review);
    reviewInvites.push({
      id: inviteId,
      token: mkToken(),
      patient_id: opts.patient?.id,
      patient_name: review.patient_name,
      location_id: opts.locationId,
      treatments: opts.treatments,
      staff_name: staff.doctorName,
      invoice_id: opts.invoice?.id,
      status: "COMPLETED",
      created_at: iso(at(-opts.daysAgo, 19)),
      opened_at: iso(at(-opts.daysAgo, 19, 40)),
      completed_at: iso(when),
      review_id: reviewId,
    });
    const rewardKind = opts.reward ?? "issued";
    if (rewardKind !== "none") {
      const issued = new Date(when.getTime() + 60_000);
      const reward: Reward = {
        id: uid(),
        code: mkCode(),
        patient_id: opts.patient?.id,
        patient_name: review.patient_name,
        review_id: reviewId,
        kind: "discount",
        value: 10,
        status: rewardKind === "expired" ? "expired" : rewardKind.startsWith("redeemed") ? "redeemed" : "issued",
        issued_at: iso(issued),
        expires_at: iso(new Date(issued.getTime() + 60 * 86_400_000)),
        redeemed_at:
          rewardKind === "redeemed-on" && opts.redeemInvoice
            ? opts.redeemInvoice.created_at
            : rewardKind === "redeemed"
              ? iso(at(-Math.max(0, opts.daysAgo - 4), 15))
              : undefined,
        redeemed_invoice_id: opts.redeemInvoice?.id,
      };
      rewards.push(reward);
      return reward;
    }
    return undefined;
  };

  // The named cast's reviews
  mkReview({
    daysAgo: 22, patient: mahnoor, locationId: EC, treatments: ["mito-regenerative-glow"], rating: 5,
    comment: "The glow after one session was unreal. My skin looked lit from within for my dholki shoot.",
    highlights: ["visible results", "clean & luxurious"], reward: "redeemed-on", redeemInvoice: mahnoorInv2,
  });
  mkReview({
    daysAgo: 9, patient: mahnoor, locationId: EC, treatments: ["mito-regenerative-glow"], rating: 5,
    comment: "Session two and my MARK-VU numbers actually improved. Seeing the pigmentation score drop is so motivating.",
    highlights: ["visible results", "staff care"], reward: "issued",
  });
  mkReview({
    daysAgo: 19, patient: zainab, locationId: EC, treatments: ["exomere-face-implant"], rating: 5,
    comment: "Two sessions in and my acne marks are visibly lighter. Painless, exactly as promised.",
    highlights: ["no pain at all", "visible results"], reward: "redeemed-on", redeemInvoice: zainabInv3,
  });
  mkReview({
    daysAgo: 5, patient: zainab, locationId: EC, treatments: ["exomere-face-implant"], rating: 5,
    comment: "The team tracks everything. Dr. Sadia showed me my pore score falling scan by scan.",
    highlights: ["staff care", "visible results"], reward: "issued",
  });
  mkReview({
    daysAgo: 13, patient: hassan, locationId: EC, treatments: ["mito-full-body-reset"], rating: 4,
    comment: "Slept better than I have in months after the red light session. Recovery day after leg day is real.",
    highlights: ["worth the price"], reward: "redeemed-on", redeemInvoice: hassanInv2,
  });
  mkReview({
    daysAgo: 11, patient: amina, locationId: EC, treatments: ["exomere-body-contour"], rating: 5,
    comment: "After two sessions my stomach skin feels firmer than it has since my baby. The team never made me feel judged, only cared for.",
    highlights: ["staff care", "visible results"], reward: "issued", // live redemption demo at POS
  });
  mkReview({
    daysAgo: 7, patient: bilal, locationId: EC, treatments: ["exomere-regeneration"], rating: 3,
    comment: "Facial itself was excellent but I waited 40 minutes past my slot. Please respect appointment times.",
    highlights: ["booking was easy"], reward: "issued",
  });

  // Anonymous / partner-clinic reviews to fill the dashboard story
  const fillerFive = [
    "Beautiful space, zero pressure, real results. The intimate science of beauty is not just a line.",
    "My skin drank the Exomere ampoules. Booking on WhatsApp took two minutes.",
    "Finally a clinic that shows you the numbers instead of just promising.",
    "The MitoRedLight pod is the most relaxing 30 minutes in Lahore.",
    "Came for the glow, stayed for the aftercare routine they built me.",
    "Jawline looks sculpted and I never touched a needle.",
    "The team remembered my skin history from last visit. Premium in every detail.",
    "Post-treatment balm saved my honeymoon photos. Thank you team CAPTURE.",
  ];
  const fillerFour = [
    "Great results, slightly warm room during the session.",
    "Loved the facial; retail counter was busy at checkout.",
    "Very professional. Wish there were evening slots on Saturdays.",
    "Solid experience overall, parking takes a few minutes at Vogue Towers.",
  ];
  const fillerNames = [
    "Sana Javed", "Maha Aslam", "Kiran Baig", "Rabia Anwar", "Mehreen Shah",
    "Hina Tariq", "Nida Farooq", "Sarah Aziz", "Faiza Malik", "Amber Riaz",
    "Iqra Sheikh", "Momina Zafar", "Dua Chaudhry", "Laiba Hassan", "Areeba Nasir",
    "Tania Gill",
  ];
  const locPool = [EC, EC, EC, EC, EC, SC, SC, AD, AD, EX];
  const treatPool = CAPTURE_TREATMENTS.map((t) => t.id);
  for (let i = 0; i < 16; i++) {
    const five = rnd() < 0.68;
    const daysAgo = 2 + Math.floor(rnd() * 42);
    mkReview({
      daysAgo,
      patientName: fillerNames[i],
      locationId: pick(locPool),
      treatments: [pick(treatPool)],
      rating: five ? 5 : 4,
      comment: five ? pick(fillerFive) : pick(fillerFour),
      highlights: five
        ? [pick(["visible results", "staff care", "clean & luxurious", "no pain at all"])]
        : [pick(["worth the price", "booking was easy"])],
      reward: rnd() < 0.35 ? (daysAgo > 30 ? "expired" : "issued") : "none",
    });
  }
  // one recent low score for the follow-up flag demo
  mkReview({
    daysAgo: 2, patientName: "Anonymous client", locationId: SC, treatments: ["exomere-regeneration"], rating: 2,
    comment: "Product was fine but the partner clinic felt rushed and nobody explained the aftercare steps.",
    highlights: [], reward: "none",
  });

  // two pending invites (front desk sent, client has not opened yet)
  reviewInvites.push({
    id: uid(), token: mkToken(), patient_id: zara.id, patient_name: zara.name,
    location_id: EC, treatments: ["exomere-face-contour"], staff_name: staff.doctorName,
    invoice_id: invoices[invoices.length - 1]?.id, status: "PENDING", created_at: iso(at(0, 13)),
  });
  reviewInvites.push({
    id: uid(), token: mkToken(), patient_name: "Hina Tariq",
    location_id: EC, treatments: ["exomere-regeneration"], staff_name: staff.doctorName,
    status: "PENDING", created_at: iso(at(-2, 18)),
  });

  // -------------------------------------------------------------------
  // Appointments — past two weeks + coming week across locations
  // -------------------------------------------------------------------

  const appointments: Appointment[] = [];
  const mkAppt = (opts: {
    dayOffset: number;
    hour: number;
    minute?: number;
    patient?: Patient;
    patientName?: string;
    phone?: string;
    treatment: string;
    locationId?: string;
    source?: Appointment["source"];
    status?: Appointment["status"];
    duration?: number;
    type?: Appointment["type"];
    callId?: string;
    notes?: string;
  }) => {
    const start = at(opts.dayOffset, opts.hour, opts.minute ?? 0);
    const past = start.getTime() < now.getTime();
    const t = findTreatment(opts.treatment);
    appointments.push({
      id: uid(),
      patient_id: opts.patient?.id,
      patient_name: opts.patient?.name ?? opts.patientName ?? "Client",
      phone: opts.phone ?? opts.patient?.phone,
      start: iso(start),
      duration_min: opts.duration ?? t?.durationMin ?? 60,
      type: opts.type ?? "treatment",
      procedure_interest: opts.treatment,
      source: opts.source ?? "front_desk",
      status: opts.status ?? (past ? "completed" : "booked"),
      notes: opts.notes,
      vybero_call_id: opts.callId,
      location_id: opts.locationId ?? EC,
      created_at: iso(new Date(start.getTime() - 86_400_000 * (1 + rnd() * 3))),
      updated_at: iso(now),
    });
    return appointments[appointments.length - 1];
  };

  // Today's queue at the Experience Centre — the demo opens on this
  mkAppt({ dayOffset: 0, hour: 11, patient: mahnoor, treatment: "mito-regenerative-glow", status: "confirmed", notes: "Session 3 of 6 — glow programme, wedding timeline", type: "treatment" });
  mkAppt({ dayOffset: 0, hour: 12, minute: 30, patient: zara, treatment: "exomere-face-contour", status: "confirmed", type: "consultation", notes: "MARK-VU review + contour plan" });
  mkAppt({ dayOffset: 0, hour: 15, patient: amina, treatment: "exomere-body-contour", status: "booked", notes: "Session 3 — abdomen + hips", type: "treatment" });
  mkAppt({ dayOffset: 0, hour: 17, minute: 30, patientName: "Nida Farooq", phone: "0333 8891245", treatment: "exomere-regeneration", source: "vybero", status: "booked", type: "consultation" });
  // Tomorrow + this week
  mkAppt({ dayOffset: 1, hour: 11, patient: hassan, treatment: "mito-full-body-reset", status: "booked", notes: "Session 3" });
  mkAppt({ dayOffset: 1, hour: 14, patientName: "Sarah Aziz", phone: "0345 1200876", treatment: "exomere-face-implant", source: "vybero", status: "booked", type: "consultation" });
  mkAppt({ dayOffset: 2, hour: 12, patient: zainab, treatment: "exomere-face-implant", status: "booked", notes: "Session 4 of 6" });
  mkAppt({ dayOffset: 2, hour: 16, patientName: "Faiza Malik", phone: "0300 7712349", treatment: "mito-regenerative-glow", status: "booked", type: "consultation" });
  mkAppt({ dayOffset: 3, hour: 13, patientName: "Amber Riaz", phone: "0321 6600438", treatment: "exomere-body-contour", source: "vybero", status: "booked" });
  mkAppt({ dayOffset: 4, hour: 11, patientName: "Iqra Sheikh", phone: "0301 5523980", treatment: "exomere-regeneration", locationId: AD, status: "booked" });
  mkAppt({ dayOffset: 5, hour: 15, patientName: "Momina Zafar", phone: "0322 9081127", treatment: "exomere-face-implant", locationId: SC, status: "booked" });
  // Past two weeks (completed sessions matching the invoices)
  mkAppt({ dayOffset: -24, hour: 13, patient: mahnoor, treatment: "mito-regenerative-glow", notes: "Session 1" });
  mkAppt({ dayOffset: -10, hour: 17, patient: mahnoor, treatment: "mito-regenerative-glow", notes: "Session 2" });
  mkAppt({ dayOffset: -31, hour: 15, patient: zainab, treatment: "exomere-face-implant", notes: "Session 1" });
  mkAppt({ dayOffset: -20, hour: 15, patient: zainab, treatment: "exomere-face-implant", notes: "Session 2" });
  mkAppt({ dayOffset: -6, hour: 16, patient: zainab, treatment: "exomere-face-implant", notes: "Session 3" });
  mkAppt({ dayOffset: -14, hour: 19, patient: hassan, treatment: "mito-full-body-reset", source: "vybero", notes: "Session 1" });
  mkAppt({ dayOffset: -4, hour: 19, patient: hassan, treatment: "mito-full-body-reset", notes: "Session 2" });
  mkAppt({ dayOffset: -26, hour: 12, patient: amina, treatment: "exomere-body-contour", notes: "Session 1" });
  mkAppt({ dayOffset: -12, hour: 12, patient: amina, treatment: "exomere-body-contour", notes: "Session 2" });
  mkAppt({ dayOffset: -8, hour: 18, patient: bilal, treatment: "exomere-regeneration", source: "vybero" });
  mkAppt({ dayOffset: -17, hour: 14, patientName: "Sana Javed", treatment: "exomere-face-implant", locationId: SC });
  mkAppt({ dayOffset: -15, hour: 16, patientName: "Maha Aslam", treatment: "exomere-regeneration", locationId: AD });
  mkAppt({ dayOffset: -11, hour: 13, patientName: "Kiran Baig", treatment: "exomere-body-contour", locationId: EX });
  mkAppt({ dayOffset: -7, hour: 15, patientName: "Rabia Anwar", treatment: "exomere-face-contour", locationId: SC });
  mkAppt({ dayOffset: -1, hour: 12, patientName: "Dua Chaudhry", treatment: "mito-regenerative-glow", status: "no_show" });

  // -------------------------------------------------------------------
  // VYBERO call story — two weeks, CAPTURE topics
  // -------------------------------------------------------------------

  const CALLER_NAMES = [
    "Fatima Sheikh", "Ali Nawaz", "Hira Butt", "Usman Tariq", "Sana Iqbal",
    "Mehwish Khan", "Danish Raza", "Ayesha Siddiqui", "Hamza Malik",
    "Rabia Aslam", "Zara Hussain", "Noor Fatima", "Kashif Javed",
    "Amna Riaz", "Taimur Shah", "Saba Anwar", "Adeel Akhtar", "Junaid Aziz",
  ];

  const TOPIC_QUESTIONS: Record<string, string[]> = {
    "mito-regenerative-glow": [
      "How many sessions until I see the glow?",
      "Is the red light safe for my skin tone?",
      "Can I book the glow package before my wedding?",
    ],
    "exomere-body-contour": [
      "Does body contouring work on post-pregnancy skin?",
      "How much is a body contour session?",
      "Which two areas can I choose?",
    ],
    "exomere-face-contour": [
      "Can you tighten the jawline without fillers?",
      "How long does the face contour result last?",
    ],
    "exomere-face-implant": [
      "Is the skin implant treatment painful?",
      "Will it help with old acne scars?",
      "How much does the implant regimen cost?",
    ],
    "exomere-regeneration": [
      "My skin is very sensitive, is the facial safe?",
      "What is in the regeneration facial?",
    ],
    "mito-full-body-reset": [
      "Does red light help with muscle recovery?",
      "Can it improve my sleep?",
    ],
    products: [
      "Do you deliver the home care products?",
      "Which serum is right for pigmentation?",
      "Is the Recovery Balm a sunscreen too?",
    ],
    pricing: ["Do you have packages for six sessions?", "Is the consultation free?"],
    availability: ["Are you open on Saturday?", "Any slot this evening?"],
    location: ["Where is the Experience Centre exactly?", "Is there parking at Vogue Towers?"],
    aftercare: ["What should I avoid after the facial?", "When can I wear makeup again?"],
    markvu: ["What is the MARK-VU scan?", "Does the scan cost extra?"],
  };

  const PROC_TOPICS = [
    "mito-regenerative-glow", "mito-regenerative-glow", "exomere-face-implant",
    "exomere-face-implant", "exomere-body-contour", "exomere-body-contour",
    "exomere-face-contour", "exomere-regeneration", "mito-full-body-reset",
    "products",
  ];
  const SIDE_TOPICS = [
    "pricing", "pricing", "pricing", "availability", "availability",
    "aftercare", "location", "markvu",
  ];

  const vyberoCalls: VyberoCall[] = [];
  const HOURS = [10, 11, 11, 12, 12, 13, 14, 15, 16, 17, 17, 18, 18];
  for (let day = -13; day <= 0; day++) {
    const weekday = at(day, 12, 0).getDay();
    if (weekday === 0) continue;
    const n = 3 + Math.floor(rnd() * (weekday === 6 ? 6 : 5));
    for (let i = 0; i < n; i++) {
      const started = at(day, pick(HOURS), Math.floor(rnd() * 60));
      if (started.getTime() > now.getTime()) continue;
      const roll = rnd();
      const outcome: CallOutcome =
        roll < 0.4 ? "booked" : roll < 0.72 ? "info" : roll < 0.84 ? "callback" : roll < 0.9 ? "transferred" : "missed";
      const missed = outcome === "missed";
      const topic = pick(PROC_TOPICS);
      const side = pick(SIDE_TOPICS);
      const topics = missed ? [] : rnd() < 0.75 ? [topic, side] : [topic];
      const questions = missed
        ? []
        : topics.flatMap((t) =>
            rnd() < 0.85 ? [pick(TOPIC_QUESTIONS[t] ?? [])].filter(Boolean) : []
          );
      vyberoCalls.push({
        id: uid(),
        started_at: iso(started),
        duration_secs: missed ? 0 : 45 + Math.floor(rnd() * 320),
        direction: "inbound",
        caller_name: missed ? undefined : pick(CALLER_NAMES),
        caller_phone: missed
          ? undefined
          : `+92 3${Math.floor(rnd() * 90 + 10)} ${Math.floor(rnd() * 9_000_000 + 1_000_000)}`,
        language: rnd() < 0.5 ? "Urdu" : rnd() < 0.85 ? "English" : "Punjabi",
        outcome,
        topics,
        questions,
        summary: missed
          ? "Missed call, no answer."
          : `Caller asked about ${topics
              .map((t) => findTreatment(t)?.short?.toLowerCase() ?? t.replace(/-/g, " "))
              .join(" and ")}${outcome === "booked" ? "; booked at the Experience Centre." : "."}`,
        rating: !missed && rnd() < 0.4 ? 4 + Math.round(rnd()) : undefined,
      });
    }
  }
  vyberoCalls.sort((a, b) => b.started_at.localeCompare(a.started_at));

  // link the VYBERO-sourced appointments to real calls
  const bookedCalls = vyberoCalls.filter((c) => c.outcome === "booked");
  let bi = 0;
  for (const a of appointments) {
    if (a.source === "vybero" && bookedCalls[bi]) {
      a.vybero_call_id = bookedCalls[bi].id;
      bookedCalls[bi].appointment_id = a.id;
      bi++;
    }
  }

  appointments.sort((a, b) => a.start.localeCompare(b.start));
  invoices.sort((a, b) => a.created_at.localeCompare(b.created_at));
  reviews.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return {
    patients,
    consents,
    assets,
    consultations: [zaraConsult],
    appointments,
    vyberoCalls,
    invoices,
    reviews,
    reviewInvites,
    rewards,
    skinAnalyses,
  };
}

/** Client-fallback users (plain password field, matches the User type). */
export function buildCaptureUsers(clinicId: string): User[] {
  return CAPTURE_STAFF.map((s, i) => ({
    id: `capture_user_${i}_${s.key}`,
    clinic_id: clinicId,
    name: s.name,
    email: s.email,
    role: s.role,
    password: CAPTURE_DEMO_PASSWORD,
    title: s.title,
    active: true,
  }));
}
