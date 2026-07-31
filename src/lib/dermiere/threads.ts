/**
 * The four automations, each shown as a real conversation.
 *
 * These are the first four threads in the inbox, in the order the clinic
 * would meet them: a booking is confirmed, the appointment is reminded, a
 * follow-up consultation is offered, feedback is asked for. Every clinic
 * line is what the automation actually sends, and every patient line is the
 * reply it is designed to invite - so opening them in order walks through
 * the whole system without anyone narrating it.
 *
 * The message bodies here mirror composeMessage() in crmAutomation.ts. They
 * are written out rather than generated so the seeded history reads as a
 * past conversation, with the patient's answer already in it.
 *
 * {{name}} is the contact's first name and {{review_link}} a real minted
 * review URL; both are substituted when the seed is written, so a thread can
 * never end up addressed to somebody else.
 */

export interface ScriptedTurn {
  from: "patient" | "clinic";
  body: string;
  /** Minutes after the previous turn. */
  gapMins: number;
}

export interface DemoThread {
  /** Which automation this thread demonstrates. */
  label: string;
  turns: ScriptedTurn[];
}

export const DEMO_THREADS: DemoThread[] = [
  {
    label: "Booking confirmation",
    turns: [
      {
        from: "clinic",
        body:
          "Assalam o alaikum {{name}},\n\n" +
          "Your appointment at Dermiere Aesthetics is confirmed for Sat 8 Aug, 12:30 pm.\n\n" +
          "Please arrive about ten minutes early so we can settle you in, and come with clean skin if you can - no makeup is best.\n\n" +
          "If anything changes, just reply here and we will move it for you. We are looking forward to seeing you.\n\n" +
          "Warmly,\nDermiere Aesthetics",
        gapMins: 0,
      },
      {
        from: "patient",
        body: "Jazakallah, noted. Is parking available at Gulberg?",
        gapMins: 26,
      },
      {
        from: "clinic",
        body:
          "Yes, there is parking right outside the clinic and our guard will help you with a spot. See you Saturday!",
        gapMins: 5,
      },
    ],
  },

  {
    label: "Appointment reminder",
    turns: [
      {
        from: "clinic",
        body:
          "Assalam o alaikum {{name}},\n\n" +
          "A gentle reminder about your appointment with us tomorrow at 4:00 pm.\n\n" +
          "There is nothing you need to bring. If you have started any new skincare or medication since we last spoke, do mention it when you arrive so we can take it into account.\n\n" +
          "See you soon, and reply here if you need to reschedule.\n\n" +
          "Warmly,\nDermiere Aesthetics",
        gapMins: 0,
      },
      {
        from: "patient",
        body: "Jee I will be there. Can I bring my sister along, she wants to ask about pigmentation?",
        gapMins: 41,
      },
      {
        from: "clinic",
        body:
          "Of course, she is very welcome. If she would like her own consultation we can look at the same afternoon - just tell me and I will check what is free.",
        gapMins: 6,
      },
    ],
  },

  {
    label: "Follow-up consultation",
    turns: [
      {
        from: "clinic",
        body:
          "Assalam o alaikum {{name}},\n\n" +
          "We hope you have been well since your visit. At this point in your treatment it is a good moment to see how your skin has responded, so we can decide together whether to continue as planned or adjust anything.\n\n" +
          "Would you like us to arrange your follow-up consultation? Tell us a day that suits you and we will find you a time.\n\n" +
          "Warmly,\nDermiere Aesthetics",
        gapMins: 0,
      },
      {
        from: "patient",
        body: "Yes please, sometime next week. Thursday would be easiest for me.",
        gapMins: 73,
      },
      {
        from: "clinic",
        body:
          "Perfect - I can offer you Thursday at 5:00 pm with Dr. Hina. Reply YES to confirm and I will book it.",
        gapMins: 4,
      },
      { from: "patient", body: "Yes", gapMins: 12 },
      {
        from: "clinic",
        body:
          "Booked. We will see you Thursday at 5:00 pm. If anything changes, just message here.",
        gapMins: 1,
      },
    ],
  },

  {
    label: "Feedback request",
    turns: [
      {
        from: "clinic",
        body:
          "Assalam o alaikum {{name}},\n\n" +
          "Thank you for visiting Dermiere Aesthetics. It was a pleasure looking after you.\n\n" +
          "When you have a spare moment, we would love to know how you found your visit. It takes less than a minute:\n\n" +
          "{{review_link}}\n\n" +
          "You can also simply reply here - it is read by the team, and it genuinely shapes how we look after you next time.\n\n" +
          "Warmly,\nDermiere Aesthetics",
        gapMins: 0,
      },
      {
        from: "patient",
        body:
          "Done, left you 5 stars. Honestly it was lovely - Dr. Hina explained everything properly and did not rush me at all. Skin feels much calmer than last week.",
        gapMins: 88,
      },
      {
        from: "clinic",
        body:
          "That is so good to hear, thank you for taking the time. I will pass this on to Dr. Hina. Your next session is due in about four weeks - message here whenever you would like to book it.",
        gapMins: 9,
      },
    ],
  },
];
