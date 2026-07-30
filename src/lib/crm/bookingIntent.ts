/**
 * Reading a booking request out of a WhatsApp message.
 *
 * Patients do not write dates the way a form does. They write "can I come
 * Tuesday 28", "saturday please", "tomorrow at 3", "28th July". This module
 * turns that into a date and, when they gave one, a time.
 *
 * The rule that shapes everything here: NEVER book on a guess. A wrong
 * booking costs the clinic the slot AND the patient, which is worse than
 * not booking at all. So the parser reports how sure it is, and anything
 * short of sure comes back as `ambiguous` with the candidates, for the
 * caller to ask about rather than assume.
 *
 * Deliberately no AI call: this runs on every inbound message, must be
 * instant, must work with no API key, and must be testable. A regex that
 * admits when it is unsure beats a model that is confidently wrong.
 */

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5, jumma: 5,
  saturday: 6, sat: 6,
};

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
  apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Words that mean "I want to come in". */
const BOOKING_WORDS =
  /\b(book|booking|appointment|appt|slot|available|availability|schedule|come in|visit|consult|consultation)\b/i;

/**
 * Words that mean "yes".
 *
 * Includes the Roman Urdu people actually type here. Kept tight on purpose:
 * a loose affirmative list would confirm bookings off "ok thanks" replying
 * to something else entirely.
 */
const AFFIRMATIVE =
  /^(y|ya|yes+|yeah|yep|yup|ok|okay|k|sure|confirm(ed)?|done|perfect|great|haa?n|ji|jee|theek|thik|thk|bilkul)(\s+(hai|h|hy|please|pls|thanks|thank you|shukriya|ji|jee|haa?n|done|great))*[\s.!]*$/i;

/** Words that mean "no" / "change it". */
const NEGATIVE = /\b(no|nope|nahi|nahin|cancel|different|another|change|reschedule)\b/i;

export interface BookingIntent {
  /** Does this message ask to be seen at all? */
  wantsBooking: boolean;
  /** Resolved local date, when one could be read confidently. */
  date?: Date;
  /** Minutes into the day, when a time was given (e.g. 15:00 -> 900). */
  minutes?: number;
  /**
   * Set when a date was mentioned but could mean more than one thing, e.g.
   * "Tuesday 28" in a month whose 28th is a Wednesday. The caller must ask
   * rather than pick.
   */
  ambiguous?: { reason: string; candidates: Date[] };
}

/** Is this message just "yes"? */
export function isAffirmative(body: string): boolean {
  return AFFIRMATIVE.test(body.trim());
}

/** Is this message a refusal or a request to change? */
export function isNegative(body: string): boolean {
  return NEGATIVE.test(body);
}

/**
 * Parse a clock time, returning the minutes into the day AND the span of
 * text it consumed.
 *
 * The span matters: "friday 15:30" must not later read the 15 as the 15th
 * of the month. Whatever the clock took, the date parser must not see.
 */
function parseTime(
  text: string
): { minutes: number; from: number; to: number } | undefined {
  // Only shapes that are unmistakably a clock:
  //   1. an am/pm suffix   -> "3pm", "3.30pm"
  //   2. a colon           -> "15:30"
  //   3. the word "at"     -> "at 3"
  // A bare number with none of these belongs to the date parser, so "4
  // august" stays the 4th rather than becoming 4 o'clock.
  const re =
    /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b|\b(\d{1,2})[:.](\d{2})\b|\bat\s+(\d{1,2})\b/gi;
  const m = re.exec(text);
  if (!m) return undefined;

  const hasSuffix = m[3] !== undefined;
  const isBareAt = m[6] !== undefined;
  let hour = Number(hasSuffix ? m[1] : isBareAt ? m[6] : m[4]);
  const mins = Number((hasSuffix ? m[2] : isBareAt ? undefined : m[5]) ?? 0);
  const suffix = m[3]?.toLowerCase();

  if (hour > 23 || mins > 59) return undefined;
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  // No am/pm on a 1-8: this clinic opens 11-20, so "at 3" is the afternoon.
  if (!suffix && hour >= 1 && hour <= 8) hour += 12;

  return { minutes: hour * 60 + mins, from: m.index, to: m.index + m[0].length };
}

function atMidnight(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** The next date (today onwards) whose day-of-month is `dom`. */
function nextWithDayOfMonth(dom: number, from: Date): Date | undefined {
  for (let i = 0; i < 62; i++) {
    const c = new Date(from);
    c.setDate(c.getDate() + i);
    if (c.getDate() === dom) return atMidnight(c);
  }
  return undefined;
}

/** The next date (today onwards, excluding today) on the given weekday. */
function nextWeekday(dow: number, from: Date): Date {
  const c = new Date(from);
  for (let i = 1; i <= 7; i++) {
    c.setDate(c.getDate() + 1);
    if (c.getDay() === dow) break;
  }
  return atMidnight(c);
}

/**
 * Read a booking request from a message.
 *
 * `now` is injectable so this is testable and so "tomorrow" resolves
 * against the clinic's clock rather than the server's assumptions.
 */
export function parseBookingIntent(
  body: string,
  now: Date = new Date()
): BookingIntent {
  const text = body.toLowerCase();
  const wantsBooking = BOOKING_WORDS.test(text);
  const clock = parseTime(text);
  const minutes = clock?.minutes;
  // Blank out whatever the clock consumed so "friday 15:30" cannot also be
  // read as the 15th of the month.
  const dateText = clock
    ? text.slice(0, clock.from) + " ".repeat(clock.to - clock.from) + text.slice(clock.to)
    : text;
  const today = atMidnight(now);

  // --- relative days ---------------------------------------------------
  if (/\btoday\b|\baj\b|\baaj\b/.test(text)) {
    return { wantsBooking: true, date: today, minutes };
  }
  if (/\btomorrow\b|\bkal\b/.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return { wantsBooking: true, date: d, minutes };
  }

  // --- explicit day of month, optionally with a month ------------------
  const domMatch = dateText.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\b(?:\s+(?:of\s+)?([a-z]+))?/
  );
  const monthName =
    domMatch?.[2] && MONTHS[domMatch[2]] !== undefined
      ? MONTHS[domMatch[2]]
      : undefined;

  // A weekday name anywhere in the message.
  const weekdayKey = Object.keys(WEEKDAYS).find((k) =>
    new RegExp(`\\b${k}\\b`).test(dateText)
  );
  const dow = weekdayKey !== undefined ? WEEKDAYS[weekdayKey] : undefined;

  const domRaw = domMatch ? Number(domMatch[1]) : undefined;
  const dom = domRaw && domRaw >= 1 && domRaw <= 31 ? domRaw : undefined;

  let byDom: Date | undefined;
  if (dom !== undefined) {
    if (monthName !== undefined) {
      const c = new Date(today.getFullYear(), monthName, dom);
      // A date already past this year would roll to next year, which nobody
      // means when booking a facial. Treat it as a mistake worth asking about.
      if (c < today) {
        return {
          wantsBooking: true,
          minutes,
          ambiguous: {
            reason: `${dom} ${MONTH_LABELS[monthName]} has already passed this year`,
            candidates: [],
          },
        };
      }
      byDom = atMidnight(c);
    } else {
      byDom = nextWithDayOfMonth(dom, today);
    }
  }

  // Anything more than two months out is more likely a misread than a plan.
  if (byDom && byDom.getTime() - today.getTime() > 62 * 86_400_000) {
    return {
      wantsBooking: true,
      minutes,
      ambiguous: { reason: "that date is a long way off", candidates: [byDom] },
    };
  }

  // --- reconcile weekday and day-of-month ------------------------------
  if (byDom && dow !== undefined) {
    if (byDom.getDay() === dow) {
      // They agree: this is the confident case ("Tuesday 28" and the 28th
      // really is a Tuesday).
      return { wantsBooking: true, date: byDom, minutes };
    }
    // They disagree. Someone has misread a calendar, and we must not pick.
    return {
      wantsBooking: true,
      minutes,
      ambiguous: {
        reason: `the ${dom}${ordinal(dom!)} is a ${dayName(byDom.getDay())}, not a ${dayName(dow)}`,
        candidates: [byDom, nextWeekday(dow, today)],
      },
    };
  }

  if (byDom) return { wantsBooking: true, date: byDom, minutes };
  if (dow !== undefined) {
    return { wantsBooking: true, date: nextWeekday(dow, today), minutes };
  }

  // Asked to be seen, but said nothing about when.
  return { wantsBooking, minutes };
}

function ordinal(n: number): string {
  if (n % 10 === 1 && n !== 11) return "st";
  if (n % 10 === 2 && n !== 12) return "nd";
  if (n % 10 === 3 && n !== 13) return "rd";
  return "th";
}

export function dayName(dow: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dow];
}

/** "Tue 28 Jul at 3:00pm" - how a slot is written back to the patient. */
export function describeSlot(startIso: string): string {
  const d = new Date(startIso);
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
