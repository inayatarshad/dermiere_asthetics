/**
 * The four message templates, one per automation.
 *
 * The wording here is the wording that actually goes out - see
 * composeMessage() in crmAutomation.ts. They are kept in the Meta template
 * shape (numbered {{1}} variables, a language, an approval status) so that
 * connecting the real WhatsApp Cloud API later means submitting these for
 * approval, not rewriting them.
 */

import type { MessageTemplate } from "@/lib/crm/types";

export function dermiereTemplates(
  clinicId: string,
  now: number
): MessageTemplate[] {
  const ago = (days: number) => new Date(now - days * 86400000).toISOString();

  return [
    {
      id: "tpl_booking_confirmation",
      clinic_id: clinicId,
      name: "booking_confirmation",
      status: "approved",
      language: "en",
      category: "utility",
      body: [
        "Assalam o alaikum {{1}},",
        "",
        "Your appointment at Dermiere Aesthetics is confirmed for {{2}}.",
        "",
        "Please arrive about ten minutes early so we can settle you in, and come with clean skin if you can - no makeup is best.",
        "",
        "If anything changes, just reply here and we will move it for you. We are looking forward to seeing you.",
        "",
        "Warmly,",
        "Dermiere Aesthetics",
      ].join("\n"),
      variables: ["patient_name", "datetime"],
      created_at: ago(40),
    },
    {
      id: "tpl_appointment_reminder",
      clinic_id: clinicId,
      name: "appointment_reminder",
      status: "approved",
      language: "en",
      category: "utility",
      body: [
        "Assalam o alaikum {{1}},",
        "",
        "A gentle reminder about your appointment with us {{2}}.",
        "",
        "There is nothing you need to bring. If you have started any new skincare or medication since we last spoke, do mention it when you arrive so we can take it into account.",
        "",
        "See you soon, and reply here if you need to reschedule.",
        "",
        "Warmly,",
        "Dermiere Aesthetics",
      ].join("\n"),
      variables: ["patient_name", "datetime"],
      created_at: ago(38),
    },
    {
      id: "tpl_followup_consultation",
      clinic_id: clinicId,
      name: "follow_up_consultation",
      status: "approved",
      language: "en",
      category: "utility",
      body: [
        "Assalam o alaikum {{1}},",
        "",
        "We hope you have been well since your visit. At this point in your treatment it is a good moment to see how your skin has responded, so we can decide together whether to continue as planned or adjust anything.",
        "",
        "Would you like us to arrange your follow-up consultation? Tell us a day that suits you and we will find you a time.",
        "",
        "Warmly,",
        "Dermiere Aesthetics",
      ].join("\n"),
      variables: ["patient_name"],
      created_at: ago(30),
    },
    {
      id: "tpl_feedback_request",
      clinic_id: clinicId,
      name: "feedback_request",
      status: "approved",
      language: "en",
      category: "utility",
      body: [
        "Assalam o alaikum {{1}},",
        "",
        "Thank you for visiting Dermiere Aesthetics. It was a pleasure looking after you.",
        "",
        "When you have a spare moment, we would love to know how you found your visit. It takes less than a minute:",
        "",
        "{{2}}",
        "",
        "You can also simply reply here - it is read by the team, and it genuinely shapes how we look after you next time.",
        "",
        "Warmly,",
        "Dermiere Aesthetics",
      ].join("\n"),
      variables: ["patient_name", "review_link"],
      created_at: ago(6),
    },
  ];
}
