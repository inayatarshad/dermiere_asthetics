/**
 * VYBERO web concierge — CAPTURE's inbound support + booking agent.
 *
 * Deterministic by design: every answer is composed from the CAPTURE
 * knowledge base (lib/capture/kb.ts) and the booking flow is a typed
 * slot-filling machine over the real availability grid. No API key can
 * fail on demo day; an LLM can later rewrite replies in place without
 * touching the logic.
 *
 * The server stays stateless — the client echoes ConciergeState back on
 * every turn (the token pattern, conversation edition).
 */

import type { ClinicHours } from "@/lib/types";
import {
  CAPTURE_BRAND,
  CAPTURE_FAQS,
  CAPTURE_LOCATIONS,
  CAPTURE_TREATMENTS,
  CAPTURE_TECH,
  findTreatment,
  formatPkr,
  type CaptureTreatment,
} from "@/lib/capture/kb";

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface BookingDraft {
  step: "treatment" | "location" | "date" | "time" | "name" | "phone" | "confirm";
  treatment?: string;
  location?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:MM (24h)
  name?: string;
  phone?: string;
}

export interface ConciergeState {
  booking?: BookingDraft;
  /** topics touched this conversation (feeds the call log on booking) */
  topics?: string[];
  questions?: string[];
  turns?: number;
}

export interface ConciergeTurn {
  reply: string;
  chips?: string[];
  state: ConciergeState;
  /** set when this turn completed a booking */
  booked?: {
    reference: string;
    treatment: string;
    location: string;
    date: string;
    time: string;
    name: string;
  };
  /** the engine wants the route to create this appointment */
  createBooking?: {
    treatment: string;
    location: string;
    startISO: string;
    durationMin: number;
    name: string;
    phone: string;
  };
}

/** What the route supplies so the engine can ground itself in real data. */
export interface ConciergeContext {
  hours: ClinicHours;
  /** free slot start times (ISO) for a date */
  availability: (date: string) => Promise<{ start: string; end: string }[]>;
}

// ---------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^\w\s:+-]/g, " ").replace(/\s+/g, " ").trim();

const TREATMENT_ALIASES: Array<{ id: string; words: string[] }> = [
  { id: "mito-regenerative-glow", words: ["glow", "red light", "redlight", "infrared", "radiance", "bridal", "wedding", "pre event", "pre-event"] },
  { id: "exomere-body-contour", words: ["body contour", "body contouring", "stomach", "tummy", "abdomen", "belly", "arms", "thighs", "hips", "cellulite", "slimming", "fat", "mass reduction", "loose skin"] },
  { id: "exomere-face-contour", words: ["face contour", "jawline", "jaw line", "neck", "sagging", "lift", "decolletage", "crepey", "double chin"] },
  { id: "exomere-face-implant", words: ["implant", "spicus", "skin renewal", "acne", "scars", "pigmentation", "pores", "texture", "brightening", "dark spots", "melasma"] },
  { id: "exomere-regeneration", words: ["regeneration", "sensitive", "barrier", "dry", "dryness", "facial", "calming", "restore", "dull"] },
  { id: "mito-full-body-reset", words: ["full body", "reset", "sleep", "recovery", "muscle", "fatigue", "wellness", "energy", "hair", "scalp"] },
];

function matchTreatment(text: string): CaptureTreatment | undefined {
  const t = norm(text);
  // exact/short-name matches first
  for (const tr of CAPTURE_TREATMENTS) {
    if (t.includes(tr.name.toLowerCase()) || t.includes(tr.short.toLowerCase())) {
      return tr;
    }
  }
  let best: { id: string; score: number } | null = null;
  for (const alias of TREATMENT_ALIASES) {
    const score = alias.words.reduce((s, w) => (t.includes(w) ? s + (w.length > 5 ? 2 : 1) : s), 0);
    if (score > 0 && (!best || score > best.score)) best = { id: alias.id, score };
  }
  return best ? findTreatment(best.id) : undefined;
}

function matchLocation(text: string): string | undefined {
  const t = norm(text);
  if (/(experience|vogue|mm alam|m m alam|main center|main centre|capture centre|capture center|gulberg)/.test(t))
    return "experience-centre";
  if (/(haroon|skin clinic|ghalib)/.test(t)) return "skin-clinic-haroon";
  if (/(nazia|alta ?derm)/.test(t)) return "alta-derm-nazia";
  if (/(ashba|experts|dha|broadway)/.test(t)) return "experts-ashba";
  return undefined;
}

/** "today" / "tomorrow" / weekday / "18 july" → YYYY-MM-DD (local). */
function parseDate(text: string, hours: ClinicHours): { date?: string; note?: string } {
  const t = norm(text);
  const now = new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const shift = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return d;
  };

  let candidate: Date | undefined;
  if (/\btoday\b|\baj\b|\baaj\b/.test(t)) candidate = shift(0);
  else if (/\btomorrow\b|\bkal\b/.test(t)) candidate = shift(1);
  else if (/day after/.test(t)) candidate = shift(2);
  else {
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    for (let i = 0; i < 7; i++) {
      if (t.includes(weekdays[i])) {
        const delta = (i - now.getDay() + 7) % 7 || 7; // next occurrence
        candidate = shift(delta);
        break;
      }
    }
    if (!candidate) {
      // "18 july" / "july 18" / "18/07" / "2026-07-19"
      const isoM = t.match(/(\d{4})-(\d{2})-(\d{2})/);
      const dmM = t.match(/\b(\d{1,2})[\/\-](\d{1,2})\b/);
      const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
      const nameM = months.findIndex((m) => t.includes(m));
      const dayNum = t.match(/\b([0-3]?\d)(st|nd|rd|th)?\b/);
      if (isoM) candidate = new Date(`${isoM[1]}-${isoM[2]}-${isoM[3]}T00:00:00`);
      else if (nameM >= 0 && dayNum) {
        candidate = new Date(now.getFullYear(), nameM, parseInt(dayNum[1], 10));
        if (candidate.getTime() < now.getTime() - 86_400_000) candidate.setFullYear(candidate.getFullYear() + 1);
      } else if (dmM) {
        candidate = new Date(now.getFullYear(), parseInt(dmM[2], 10) - 1, parseInt(dmM[1], 10));
        if (candidate.getTime() < now.getTime() - 86_400_000) candidate.setFullYear(candidate.getFullYear() + 1);
      }
    }
  }
  if (!candidate || isNaN(candidate.getTime())) return {};
  if (!hours.days.includes(candidate.getDay())) {
    return { note: "closed_day" };
  }
  return { date: fmt(candidate) };
}

/** "3pm" / "15:30" / "11 30 am" → "HH:MM". */
function parseTime(text: string): string | undefined {
  const t = norm(text).replace(/\./g, ":");
  let m = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm)?\b/);
  if (!m) {
    m = t.match(/\b([01]?\d|2[0-3])\s*(am|pm)\b/);
    if (m) m = [m[0], m[1], "00", m[2]] as unknown as RegExpMatchArray;
  }
  if (!m) return undefined;
  let h = parseInt(m[1], 10);
  const min = m[2] ?? "00";
  const mer = m[3];
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  // Clinic context: a bare 1-8 with no meridiem almost always means afternoon/evening
  if (!mer && h >= 1 && h <= 8) h += 12;
  return `${String(h).padStart(2, "0")}:${min}`;
}

const fmtTime = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  const mer = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${mer}`;
};

const fmtDate = (ymd: string) => {
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
};

function locName(id: string): string {
  return CAPTURE_LOCATIONS.find((l) => l.id === id)?.name ?? "CAPTURE Experience Centre";
}

// ---------------------------------------------------------------------
// Reply composition (the CAPTURE voice)
// ---------------------------------------------------------------------

const DEFAULT_CHIPS = ["Book a session", "Treatments", "Prices", "Where are you?"];

function treatmentCard(t: CaptureTreatment): string {
  const course = t.courseSessions
    ? ` A course of ${t.courseSessions} is ${formatPkr(t.coursePricePkr ?? 0)}.`
    : "";
  return (
    `${t.name} — ${t.pitch}\n\n` +
    `Best for: ${t.bestFor.slice(0, 5).join(", ")}.\n` +
    `Session: about ${t.durationMin} minutes · ${formatPkr(t.pricePkr)}.${course}\n\n` +
    `Shall I book you a session, or would you like the aftercare and preparation details first?`
  );
}

function treatmentsList(): string {
  return (
    `Our six signature treatments at the Experience Centre:\n\n` +
    CAPTURE_TREATMENTS.map((t) => `· ${t.name} — from ${formatPkr(t.pricePkr)}`).join("\n") +
    `\n\nEvery programme opens with a complimentary MARK-VU skin analysis so your specialist can personalise the plan. Which one shall I tell you more about?`
  );
}

function faqAnswer(text: string): string | undefined {
  const t = norm(text);
  let best: { a: string; score: number } | null = null;
  for (const f of CAPTURE_FAQS) {
    const score = f.q.reduce((s, kw) => (t.includes(kw) ? s + kw.length : s), 0);
    if (score > 0 && (!best || score > best.score)) best = { a: f.a, score };
  }
  return best?.a;
}

// ---------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------

export async function conciergeRespond(
  rawMessage: string,
  state: ConciergeState,
  ctx: ConciergeContext
): Promise<ConciergeTurn> {
  const message = rawMessage.slice(0, 500);
  const t = norm(message);
  const next: ConciergeState = {
    ...state,
    topics: [...(state.topics ?? [])],
    questions: [...(state.questions ?? [])],
    turns: (state.turns ?? 0) + 1,
  };
  if (message.trim().endsWith("?") && next.questions!.length < 8) {
    next.questions!.push(message.trim().slice(0, 140));
  }
  const touch = (topic: string) => {
    if (!next.topics!.includes(topic)) next.topics!.push(topic);
  };

  // ---- escape hatches -------------------------------------------------
  if (next.booking && /\b(cancel|stop|never ?mind|forget it|start over)\b/.test(t)) {
    delete next.booking;
    return {
      reply:
        "Of course, no booking has been made. Whenever you are ready I am here — is there anything else I can help you with?",
      chips: DEFAULT_CHIPS,
      state: next,
    };
  }

  // ---- human handoff --------------------------------------------------
  if (/\b(human|agent|person|someone real|speak to|talk to|call me|manager)\b/.test(t)) {
    touch("handoff");
    return {
      reply:
        `Certainly. Our client care team is available Monday to Saturday, 9 AM to 6 PM on WhatsApp at ${CAPTURE_BRAND.whatsapp} — or share your number here and the team will call you back within the hour.`,
      chips: ["Book a session", "Treatments"],
      state: next,
    };
  }

  // ---- inside the booking flow ---------------------------------------
  if (next.booking) {
    return bookingStep(message, t, next, ctx);
  }

  // ---- booking intent -------------------------------------------------
  if (/\b(book|appointment|appoint|schedule|slot|reserve|booking|session)\b/.test(t) && !/\bcancel|reschedul/.test(t)) {
    touch("booking");
    const pre = matchTreatment(message);
    next.booking = { step: pre ? "location" : "treatment", treatment: pre?.id };
    if (pre) touch(pre.id);
    return pre
      ? {
          reply: `Wonderful choice — ${pre.name}. Which location suits you best?`,
          chips: CAPTURE_LOCATIONS.map((l) => l.short),
          state: next,
        }
      : {
          reply: "With pleasure. Which treatment would you like to book?",
          chips: CAPTURE_TREATMENTS.map((tr) => tr.short),
          state: next,
        };
  }

  // ---- reschedule / cancel an existing booking ------------------------
  if (/\b(reschedul|cancel|move my|change my)\b/.test(t)) {
    touch("reschedule");
    return {
      reply:
        `Of course. Share the name and time your booking is under and our team will adjust it right away — or message us on WhatsApp at ${CAPTURE_BRAND.whatsapp}. We appreciate 24 hours' notice where possible.`,
      chips: ["Book a new session", "Treatments"],
      state: next,
    };
  }

  // ---- greeting --------------------------------------------------------
  if (next.turns === 1 && /\b(hi|hello|salam|salaam|assalam|hey|good (morning|afternoon|evening))\b/.test(t)) {
    return {
      reply:
        "Welcome to CAPTURE — the intimate science of beauty. I am VYBERO, your concierge. I can tell you about our EXOMERE and MitoRedLight treatments, share prices and aftercare, or book your visit at any of our four Lahore locations. How may I help?",
      chips: DEFAULT_CHIPS,
      state: next,
    };
  }

  // ---- safety concerns outrank everything (medical credibility) --------
  if (/\b(needle|needles|painful|hurt|downtime|is it safe|side effect|pregnan|breastfeed)\b/.test(t)) {
    touch("safety");
    const reply = /\bpregnan|breastfeed\b/.test(t)
      ? faqAnswer("pregnant safe")
      : faqAnswer("needles pain downtime");
    if (reply) {
      return {
        reply,
        chips: ["Book a session", "Treatments", "Aftercare"],
        state: next,
      };
    }
  }

  // ---- treatments list -------------------------------------------------
  if (/\b(treatments?|services|menu|what do you (do|offer)|offerings)\b/.test(t)) {
    touch("treatments");
    return { reply: treatmentsList(), chips: CAPTURE_TREATMENTS.map((tr) => tr.short), state: next };
  }

  // ---- specific treatment ----------------------------------------------
  const tr = matchTreatment(message);
  if (tr && !/\bprice|cost|charge|how much\b/.test(t)) {
    touch(tr.id);
    // aftercare question about a treatment
    if (/\baftercare|after care|post|downtime|recovery|avoid\b/.test(t)) {
      touch("aftercare");
      return {
        reply:
          `Aftercare for ${tr.name}:\n\n` +
          tr.aftercare.map((a) => `· ${a}`).join("\n") +
          `\n\nYour specialist walks you through all of this at the visit, and it is printed on your plan.`,
        chips: [`Book ${tr.short}`, "Prices", "Treatments"],
        state: next,
      };
    }
    return { reply: treatmentCard(tr), chips: [`Book ${tr.short}`, "Aftercare", "Prices"], state: next };
  }

  // ---- price with treatment context -------------------------------------
  if (/\bprice|cost|charge|how much|rates?|fee\b/.test(t)) {
    touch("pricing");
    if (tr) {
      touch(tr.id);
      const course = tr.courseSessions
        ? ` A course of ${tr.courseSessions} sessions is ${formatPkr(tr.coursePricePkr ?? 0)} — the way most clients experience the full transformation.`
        : "";
      return {
        reply: `${tr.name} is ${formatPkr(tr.pricePkr)} per session (about ${tr.durationMin} minutes).${course} Shall I reserve one for you?`,
        chips: [`Book ${tr.short}`, "Treatments", "Where are you?"],
        state: next,
      };
    }
  }

  // ---- technology / science -------------------------------------------
  if (/\bexomere|exosome|hallabong|telomere|korean|three days love\b/.test(t)) {
    touch("exomere");
    return { reply: CAPTURE_TECH.exomere + " Would you like to see which treatment fits your skin?", chips: ["Treatments", "Book a session"], state: next };
  }
  if (/\bmito|red light|redlight|infrared|led|wavelength\b/.test(t)) {
    touch("mito-regenerative-glow");
    return { reply: CAPTURE_TECH.mitoRedLight + " The Regenerative Glow and Full Body Reset are built on it — shall I share either?", chips: ["Regenerative Glow", "Full Body Reset", "Book a session"], state: next };
  }
  if (/\bmark-?vu|scan|analysis|analyz|skin test\b/.test(t)) {
    touch("markvu");
    return { reply: CAPTURE_TECH.markVu + " It is complimentary with every first visit.", chips: ["Book a session", "Treatments"], state: next };
  }

  // ---- FAQ fallback ------------------------------------------------------
  const fa = faqAnswer(message);
  if (fa) {
    // classify the topic roughly for analytics
    if (/\bprice|cost\b/.test(t)) touch("pricing");
    else if (/\bwhere|location|address|parking\b/.test(t)) touch("location");
    else if (/\bhours|open|close|timing\b/.test(t)) touch("availability");
    else if (/\bproduct|shop|serum|cleanser|cream|delivery\b/.test(t)) touch("products");
    else if (/\bneedle|pain|safe|downtime\b/.test(t)) touch("safety");
    else if (/\bcircle|loyalty|reward|point\b/.test(t)) touch("capture-circle");
    return { reply: fa, chips: DEFAULT_CHIPS, state: next };
  }

  // ---- graceful fallback --------------------------------------------------
  return {
    reply:
      "I want to make sure I get this exactly right for you. I can help with our treatments, prices, locations and hours, aftercare, the EXOMERE home-care range, or booking a visit. You can also reach our team directly on WhatsApp at " +
      CAPTURE_BRAND.whatsapp +
      ".",
    chips: DEFAULT_CHIPS,
    state: next,
  };
}

// ---------------------------------------------------------------------
// Booking slot machine
// ---------------------------------------------------------------------

async function bookingStep(
  message: string,
  t: string,
  next: ConciergeState,
  ctx: ConciergeContext
): Promise<ConciergeTurn> {
  const b = next.booking!;

  const askTime = async (): Promise<ConciergeTurn> => {
    const free = await ctx.availability(b.date!);
    if (free.length === 0) {
      b.date = undefined;
      b.step = "date";
      return {
        reply: `That day is fully booked at the moment. Which other day works for you? We are open ${CAPTURE_BRAND.hours.supportHours.replace("9:00 AM to 6:00 PM", "10 AM to 7 PM")}.`,
        chips: ["Tomorrow", "Saturday", "Monday"],
        state: next,
      };
    }
    b.step = "time";
    const opts = free.slice(0, 6).map((s) => fmtTime(new Date(s.start).toTimeString().slice(0, 5)));
    return {
      reply: `Lovely — ${fmtDate(b.date!)}. These times are free: ${opts.join(", ")}. Which suits you?`,
      chips: opts.slice(0, 4),
      state: next,
    };
  };

  switch (b.step) {
    case "treatment": {
      const tr = matchTreatment(message);
      if (!tr) {
        return {
          reply: "Which treatment shall I book? These are our signatures:",
          chips: CAPTURE_TREATMENTS.map((x) => x.short),
          state: next,
        };
      }
      b.treatment = tr.id;
      if (!next.topics!.includes(tr.id)) next.topics!.push(tr.id);
      b.step = "location";
      return {
        reply: `${tr.name} — excellent. Which location would you prefer?`,
        chips: CAPTURE_LOCATIONS.map((l) => l.short),
        state: next,
      };
    }

    case "location": {
      const loc = matchLocation(message);
      if (!loc) {
        return {
          reply:
            "We are at four addresses in Lahore: the CAPTURE Experience Centre (Vogue Towers, M.M. Alam Road), The Skin Clinic by Dr. Haroon Nabi (Gulberg III), Alta Derm by Dr. Nazia (M.M. Alam Road) and Experts by Dr. Ashba Cheema (DHA). Which one suits you?",
          chips: CAPTURE_LOCATIONS.map((l) => l.short),
          state: next,
        };
      }
      b.location = loc;
      b.step = "date";
      return {
        reply: "And which day would you like to come in?",
        chips: ["Today", "Tomorrow", "Saturday"],
        state: next,
      };
    }

    case "date": {
      const { date, note } = parseDate(message, ctx.hours);
      if (note === "closed_day") {
        return {
          reply: "We are closed on Sundays. Any other day of the week works — which would you like?",
          chips: ["Monday", "Tomorrow", "Saturday"],
          state: next,
        };
      }
      if (!date) {
        return {
          reply: "Which day shall I look at? You can say today, tomorrow, a weekday, or a date like 21 July.",
          chips: ["Today", "Tomorrow", "Saturday"],
          state: next,
        };
      }
      b.date = date;
      return askTime();
    }

    case "time": {
      const hm = parseTime(message);
      if (!hm) {
        return askTime();
      }
      const free = await ctx.availability(b.date!);
      const hit = free.find((s) => new Date(s.start).toTimeString().slice(0, 5) === hm);
      if (!hit) {
        const opts = free.slice(0, 6).map((s) => fmtTime(new Date(s.start).toTimeString().slice(0, 5)));
        return {
          reply: `That exact time is taken. Closest free times on ${fmtDate(b.date!)}: ${opts.join(", ")}.`,
          chips: opts.slice(0, 4),
          state: next,
        };
      }
      b.time = hm;
      b.step = "name";
      return { reply: "Perfect. May I have your name for the booking?", state: next };
    }

    case "name": {
      const name = message.trim().replace(/^(i am|i'm|my name is|this is)\s+/i, "");
      if (name.length < 2 || name.length > 60) {
        return { reply: "May I have your name for the booking?", state: next };
      }
      b.name = name
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      b.step = "phone";
      return {
        reply: `Thank you, ${b.name.split(" ")[0]}. And the best number to confirm on? (WhatsApp preferred)`,
        state: next,
      };
    }

    case "phone": {
      const digits = message.replace(/[^\d+]/g, "");
      if (digits.replace(/\D/g, "").length < 10) {
        return {
          reply: "Could you share a full number, like 0300 1234567? We only use it to confirm your visit.",
          state: next,
        };
      }
      b.phone = digits;
      b.step = "confirm";
      const tr = findTreatment(b.treatment!)!;
      return {
        reply:
          `Here is your booking:\n\n` +
          `· ${tr.name}\n` +
          `· ${locName(b.location!)}\n` +
          `· ${fmtDate(b.date!)} at ${fmtTime(b.time!)}\n` +
          `· ${b.name} · ${b.phone}\n\n` +
          `Shall I confirm it?`,
        chips: ["Confirm booking", "Change time", "Cancel"],
        state: next,
      };
    }

    case "confirm": {
      if (/\b(change|another|different)\b.*\btime\b|\btime\b.*\bchange\b/.test(t)) {
        b.step = "time";
        return askTime();
      }
      if (!/\b(yes|confirm|sure|ok|okay|book it|go ahead|please do|haan|g|jee)\b/.test(t)) {
        return {
          reply: "Shall I confirm the booking? Say confirm, or tell me what to change.",
          chips: ["Confirm booking", "Change time", "Cancel"],
          state: next,
        };
      }
      const tr = findTreatment(b.treatment!)!;
      const startISO = new Date(`${b.date}T${b.time}:00`).toISOString();
      // The route creates the appointment (checks the slot again) and
      // fills in `booked` on success.
      return {
        reply: "", // composed by the route on success
        state: next,
        createBooking: {
          treatment: b.treatment!,
          location: b.location!,
          startISO,
          durationMin: tr.durationMin,
          name: b.name!,
          phone: b.phone!,
        },
      };
    }
  }
}

/** Success message once the route has written the appointment. */
export function bookingConfirmedReply(booked: {
  treatment: string;
  location: string;
  date: string;
  time: string;
  name: string;
  reference: string;
}): string {
  const tr = findTreatment(booked.treatment);
  return (
    `Confirmed. ${tr?.name ?? booked.treatment} on ${fmtDate(booked.date)} at ${fmtTime(booked.time)}, ` +
    `${locName(booked.location)} — under ${booked.name}, reference ${booked.reference.slice(0, 8).toUpperCase()}.\n\n` +
    `A complimentary MARK-VU skin analysis opens your visit. We will confirm on WhatsApp shortly. ` +
    `Anything else I can arrange for you?`
  );
}
