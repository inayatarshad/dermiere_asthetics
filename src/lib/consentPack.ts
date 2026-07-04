/**
 * Consent pack copy (T5) — ONE editable place for clinics to tune the
 * acknowledgement wording and the per-category risks checklist that print
 * on the consent sheet. Legal review happens here, not in components.
 */

export const CONSENT_ACK_PARAGRAPH =
  "I confirm that during my consultation I was shown an AI-generated visualization of a possible treatment outcome on my own photograph. I understand that this image is an illustrative simulation only: it is not a promise, prediction or guarantee of my result. Actual outcomes vary with individual anatomy, tissue behaviour, healing and aftercare. I have had the opportunity to ask questions about the procedure(s), the expected recovery and the realistic range of results.";

export const RISKS_BY_CATEGORY: Record<
  "injectable" | "surgical",
  { title: string; risks: string[] }
> = {
  injectable: {
    title: "Injectable treatment risks discussed",
    risks: [
      "Swelling, redness and tenderness at injection sites (usually days)",
      "Bruising, which can take 1 to 2 weeks to settle",
      "Asymmetry or irregularity that may need a touch-up",
      "Lumps or nodules; migration of filler",
      "Infection (rare); allergic reaction (rare)",
      "Vascular occlusion (very rare, treated urgently)",
      "For toxin: temporary heaviness, brow or lid droop (weeks)",
      "Results are temporary and maintenance is required",
    ],
  },
  surgical: {
    title: "Surgical risks discussed",
    risks: [
      "Swelling and bruising over weeks; final result at 6 to 12 months",
      "Bleeding, infection, delayed healing",
      "Scarring, including abnormal scars",
      "Asymmetry or irregularity; possible revision surgery",
      "Numbness or altered sensation, usually temporary",
      "Anesthesia-related risks",
      "Breathing changes (rhinoplasty-specific)",
      "Dissatisfaction with the aesthetic result despite correct technique",
    ],
  },
};
