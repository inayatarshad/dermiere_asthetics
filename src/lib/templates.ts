/**
 * Treatment templates — the reusable unit that makes the system scale
 * across procedures (knowledge base / 06_treatments-and-plan.md).
 *
 * A template bundles: the AI slider schema + prompt template (drives
 * 05_ai-before-after.md), the 3D canvas morph handles, and the default plan
 * checklist. Adding a procedure = adding one object here.
 *
 * Live verticals: Rhinoplasty (surgical) plus the non-invasive injectable
 * set: Lip Filler, Chin Filler, Botox. Slider parameters follow real
 * clinical assessment frameworks (lip architecture: vermilion volume,
 * 1:1.6 upper-to-lower ratio, cupid's bow, philtral columns, vermilion
 * border, oral commissures; chin: projection to the Ricketts E-line,
 * vertical height, width, labiomental sulcus, prejowl blending; botox:
 * frontalis / glabella / orbicularis line softening, chemical brow lift,
 * masseter slimming, lip flip).
 */

import type { TreatmentTemplate } from "./types";

export const RHINOPLASTY_PROMPT_TEMPLATE = `Edit ONLY the nose in this photograph to visualize the result of a rhinoplasty procedure. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity and all other facial features, eyes, lips, skin tone and texture, facial proportions, hairstyle, lighting, camera angle, and background. Do not beautify or alter anything other than the nose. The result must look like the SAME person with a natural, fully-healed post-surgical nose. Photorealistic, consistent lighting, no artifacts.`;

export const LIP_FILLER_PROMPT_TEMPLATE = `Edit ONLY the lips and the immediate perioral area in this photograph to visualize the fully settled result of a hyaluronic acid lip filler treatment. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity and all other facial features, eyes, nose, teeth, skin tone and texture, facial proportions, hairstyle, lighting, camera angle, and background. Keep the mouth in the same position and expression. The result must look like the SAME person with naturally enhanced, softly hydrated lips: healed, settled, no swelling, no bruising, and absolutely no overfilled or duck-lip effect. Keep the enhancement proportionate and believable. Photorealistic, consistent lighting, no artifacts.`;

export const CHIN_FILLER_PROMPT_TEMPLATE = `Edit ONLY the chin and lower jawline area in this photograph to visualize the fully settled result of a non-surgical hyaluronic acid chin augmentation. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity and all other facial features, eyes, nose, lips, skin tone and texture, hairstyle, lighting, camera angle, and background. The result must look like the SAME person with a naturally balanced, structurally supported chin that blends smoothly into the jawline: healed, settled, no swelling. Keep the enhancement anatomically plausible and proportionate to the face. Photorealistic, consistent lighting, no artifacts.`;

export const BOTOX_PROMPT_TEMPLATE = `Edit ONLY the specific treatment areas described below in this photograph to visualize the settled result of a botulinum toxin (Botox) treatment, as it would look about two weeks after injection. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity, facial proportions, eyes, nose, lips, hairstyle, lighting, camera angle, and background. Critically: keep completely natural, realistic skin with visible pores and normal texture. Do NOT blur, airbrush or beautify the whole face; only relax and soften the specific lines and areas described. The result must look like the SAME person on a well-rested day, subtle and believable, never frozen or plastic. Photorealistic, consistent lighting, no artifacts.`;

export const TEMPLATES: TreatmentTemplate[] = [
  // =====================================================================
  // RHINOPLASTY (surgical)
  // =====================================================================
  {
    id: "rhinoplasty",
    name: "Rhinoplasty",
    category: "surgical",
    region: "nose",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: RHINOPLASTY_PROMPT_TEMPLATE,
    slider_schema: [
      {
        key: "radix",
        label: "Radix height",
        hint: "Bridge start, between the eyes",
        min: -100,
        max: 100,
        negPhrase: "lower the radix",
        posPhrase: "raise the radix",
        negLabel: "Lower",
        posLabel: "Higher",
      },
      {
        key: "dorsum",
        label: "Dorsum / bridge",
        hint: "Hump reduction or augmentation",
        min: -100,
        max: 100,
        negPhrase: "reduce the dorsal hump and straighten the bridge",
        posPhrase: "add height to the nasal bridge",
        negLabel: "Reduce hump",
        posLabel: "Augment",
      },
      {
        key: "tip_projection",
        label: "Tip projection",
        hint: "How far the tip projects from the face",
        min: -100,
        max: 100,
        negPhrase: "reduce nasal tip projection",
        posPhrase: "increase nasal tip projection",
        negLabel: "Less",
        posLabel: "More",
      },
      {
        key: "tip_rotation",
        label: "Tip rotation",
        hint: "Nasolabial angle",
        min: -100,
        max: 100,
        negPhrase: "rotate the nasal tip downward",
        posPhrase:
          "rotate the nasal tip upward and refine the nasolabial angle",
        negLabel: "Downward",
        posLabel: "Upturned",
      },
      {
        key: "tip_refinement",
        label: "Tip refinement",
        hint: "Refine a bulbous tip",
        min: 0,
        max: 100,
        posPhrase: "refine and narrow the bulbous nasal tip",
        negLabel: "As is",
        posLabel: "Refined",
      },
      {
        key: "alar_width",
        label: "Nostril / base width",
        hint: "Alar base width",
        min: -100,
        max: 100,
        negPhrase: "narrow the alar base width",
        posPhrase: "widen the alar base",
        negLabel: "Narrower",
        posLabel: "Wider",
      },
      {
        key: "overall_size",
        label: "Overall size",
        hint: "Proportional overall reduction / increase",
        min: -100,
        max: 100,
        negPhrase: "reduce overall nasal size proportionally",
        posPhrase: "increase overall nasal size proportionally",
        negLabel: "Smaller",
        posLabel: "Larger",
      },
    ],
    canvas_handles: [
      { key: "dorsum", label: "Bridge / hump", min: -100, max: 100, negLabel: "Reduce", posLabel: "Augment" },
      { key: "tip_rotation", label: "Tip rotation", min: -100, max: 100, negLabel: "Down", posLabel: "Up" },
      { key: "alar_width", label: "Nostril width", min: -100, max: 100, negLabel: "Narrow", posLabel: "Wide" },
      { key: "tip_refinement", label: "Tip refinement", min: 0, max: 100, negLabel: "As is", posLabel: "Refined" },
    ],
    plan_template: [
      {
        kind: "milestone",
        label: "Pre-op assessment & bloodwork",
        detail: "CBC, coagulation profile, anesthesia fitness review.",
        offset_days: 7,
      },
      {
        kind: "milestone",
        label: "Surgery date scheduled",
        detail: "Confirm date, fasting instructions, and companion for discharge.",
        offset_days: 14,
      },
      {
        kind: "milestone",
        label: "Procedure performed",
        detail: "Rhinoplasty under general anesthesia. Splint applied.",
        offset_days: 21,
      },
      {
        kind: "milestone",
        label: "Splint removal",
        detail: "~1 week post-op. Gentle cleaning demonstrated.",
        offset_days: 28,
      },
      {
        kind: "followup",
        label: "Follow-up 1 (2 weeks): photo capture",
        detail: "Healing check. Capture front + profile photos for the timeline.",
        offset_days: 35,
      },
      {
        kind: "followup",
        label: "Follow-up 2 (6 weeks): photo capture",
        detail: "Swelling review. Capture timeline photos.",
        offset_days: 63,
      },
      {
        kind: "followup",
        label: "Result review (3 months): before/after photo",
        detail: "Compare with AI visualization; capture the result set.",
        offset_days: 111,
      },
      {
        kind: "medicine",
        label: "Antibiotic course",
        detail: "Co-amoxiclav 625mg, 1 tablet three times daily for 7 days.",
      },
      {
        kind: "medicine",
        label: "Anti-inflammatory / pain relief",
        detail: "Ibuprofen 400mg as needed after food, max 3 per day.",
      },
      {
        kind: "medicine",
        label: "Saline nasal spray",
        detail: "2 sprays per nostril, 3-4 times daily for 4 weeks.",
      },
    ],
  },

  // =====================================================================
  // LIP FILLER (injectable) — full lip-architecture control set
  // =====================================================================
  {
    id: "lip_filler",
    name: "Lip Filler",
    category: "injectable",
    region: "lips",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: LIP_FILLER_PROMPT_TEMPLATE,
    slider_schema: [
      {
        key: "lip_upper_volume",
        label: "Upper lip volume",
        hint: "Vermilion fullness of the upper lip",
        min: 0,
        max: 100,
        posPhrase:
          "add soft hyaluronic filler volume to the upper lip, increasing the visible vermilion height",
        negLabel: "Natural",
        posLabel: "Fuller",
      },
      {
        key: "lip_lower_volume",
        label: "Lower lip volume",
        hint: "Vermilion fullness of the lower lip",
        min: 0,
        max: 100,
        posPhrase:
          "add soft hyaluronic filler volume to the lower lip, increasing its visible fullness",
        negLabel: "Natural",
        posLabel: "Fuller",
      },
      {
        key: "lip_ratio",
        label: "Upper : lower balance",
        hint: "Classical ideal is about 1 : 1.6 upper to lower",
        min: -100,
        max: 100,
        negPhrase:
          "shift the volume balance toward a proportionally fuller upper lip",
        posPhrase:
          "shift the volume balance toward a proportionally fuller lower lip",
        negLabel: "Upper-weighted",
        posLabel: "Lower-weighted",
      },
      {
        key: "cupids_bow",
        label: "Cupid's bow definition",
        hint: "Sharpness and lift of the two upper-lip peaks",
        min: 0,
        max: 100,
        posPhrase:
          "define and accentuate the cupid's bow, sharpening its two peaks",
        negLabel: "Soft",
        posLabel: "Defined",
      },
      {
        key: "lip_definition",
        label: "Vermilion border",
        hint: "Crispness of the lip outline",
        min: 0,
        max: 100,
        posPhrase:
          "crisply define the vermilion border for a cleanly outlined lip edge",
        negLabel: "Soft edge",
        posLabel: "Crisp edge",
      },
      {
        key: "lip_corners",
        label: "Mouth corners",
        hint: "Oral commissure position, downturn correction",
        min: -100,
        max: 100,
        negPhrase: "allow a softer, more relaxed mouth-corner position",
        posPhrase:
          "lift the corners of the mouth, correcting a downturned resting expression",
        negLabel: "Relaxed",
        posLabel: "Lifted",
      },
      {
        key: "lip_projection",
        label: "Projection / pout",
        hint: "Forward projection seen in profile and three-quarter view",
        min: 0,
        max: 100,
        posPhrase:
          "increase the forward projection of the lips for a subtle natural pout",
        negLabel: "Flat",
        posLabel: "Pout",
      },
      {
        key: "philtrum",
        label: "Philtral columns",
        hint: "The two ridges between nose and upper lip",
        min: 0,
        max: 100,
        posPhrase: "define the philtral columns above the cupid's bow",
        negLabel: "Soft",
        posLabel: "Defined",
      },
    ],
    canvas_handles: [
      { key: "lip_upper_volume", label: "Upper volume", min: 0, max: 100, negLabel: "Natural", posLabel: "Fuller" },
      { key: "lip_lower_volume", label: "Lower volume", min: 0, max: 100, negLabel: "Natural", posLabel: "Fuller" },
      { key: "cupids_bow", label: "Cupid's bow", min: 0, max: 100, negLabel: "Soft", posLabel: "Defined" },
      { key: "lip_corners", label: "Mouth corners", min: -100, max: 100, negLabel: "Relaxed", posLabel: "Lifted" },
      { key: "lip_projection", label: "Projection", min: 0, max: 100, negLabel: "Flat", posLabel: "Pout" },
    ],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & lip assessment",
        detail:
          "Facial photos, lip architecture analysis (ratio, bow, borders), agree target look from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Medical screening",
        detail:
          "Allergies, cold-sore history (consider antiviral cover), blood thinners, pregnancy/breastfeeding check.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Injection session",
        detail:
          "0.5-1.0ml hyaluronic acid filler with topical numbing. Placement per the agreed plan (body, border, bow, corners).",
        offset_days: 7,
      },
      {
        kind: "followup",
        label: "2-week review: photo capture",
        detail:
          "Swelling fully settled. Capture result photos for the timeline and compare with the visualization.",
        offset_days: 21,
      },
      {
        kind: "milestone",
        label: "Touch-up if needed",
        detail: "Up to 0.5ml for symmetry or balance refinement.",
        offset_days: 28,
      },
      {
        kind: "followup",
        label: "Maintenance reminder",
        detail: "Lip filler typically lasts 6-12 months. Book a refresh review.",
        offset_days: 200,
      },
      {
        kind: "medicine",
        label: "Aftercare (first 48 hours)",
        detail:
          "No makeup on the lips for 12h. Avoid heat, sauna, strenuous exercise and alcohol for 24-48h. No pressure or massage unless directed.",
      },
      {
        kind: "medicine",
        label: "Swelling & bruise care",
        detail:
          "Cold compress 10 minutes on/off the first evening. Arnica optional. Paracetamol if needed; avoid ibuprofen and aspirin.",
      },
      {
        kind: "medicine",
        label: "Antiviral cover (if cold-sore history)",
        detail: "Aciclovir per clinician's instruction, starting the day before treatment.",
      },
    ],
  },

  // =====================================================================
  // CHIN FILLER (injectable) — non-surgical chin augmentation
  // =====================================================================
  {
    id: "chin_filler",
    name: "Chin Filler",
    category: "injectable",
    region: "chin",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: CHIN_FILLER_PROMPT_TEMPLATE,
    slider_schema: [
      {
        key: "chin_projection",
        label: "Projection",
        hint: "Forward projection toward the Ricketts E-line",
        min: 0,
        max: 100,
        posPhrase:
          "project the chin forward to correct mild retrusion and balance the profile",
        negLabel: "As is",
        posLabel: "Projected",
      },
      {
        key: "chin_length",
        label: "Vertical length",
        hint: "Lower-face height, slims a short or round chin",
        min: 0,
        max: 100,
        posPhrase:
          "add vertical length to the chin for a slimmer lower-face proportion",
        negLabel: "As is",
        posLabel: "Longer",
      },
      {
        key: "chin_width",
        label: "Width / taper",
        hint: "Tapered heart-shape versus a stronger square base",
        min: -100,
        max: 100,
        negPhrase:
          "taper the chin toward a more defined, gently pointed shape",
        posPhrase:
          "broaden the chin base toward a stronger, squarer look",
        negLabel: "Tapered",
        posLabel: "Squarer",
      },
      {
        key: "labiomental",
        label: "Labiomental crease",
        hint: "The fold between lower lip and chin",
        min: 0,
        max: 100,
        posPhrase:
          "soften and fill the labiomental crease between the lower lip and chin",
        negLabel: "As is",
        posLabel: "Softened",
      },
      {
        key: "prejowl",
        label: "Prejowl blend",
        hint: "Fill the prejowl sulcus into a smooth jawline",
        min: 0,
        max: 100,
        posPhrase:
          "fill the prejowl sulcus so the chin flows smoothly into a continuous jawline",
        negLabel: "As is",
        posLabel: "Blended",
      },
      {
        key: "chin_smooth",
        label: "Chin skin texture",
        hint: "Dimpled or cobblestoned chin skin",
        min: 0,
        max: 100,
        posPhrase: "smooth dimpled or cobblestoned chin skin texture",
        negLabel: "As is",
        posLabel: "Smoothed",
      },
    ],
    canvas_handles: [
      { key: "chin_projection", label: "Projection", min: 0, max: 100, negLabel: "As is", posLabel: "Projected" },
      { key: "chin_length", label: "Vertical length", min: 0, max: 100, negLabel: "As is", posLabel: "Longer" },
      { key: "chin_width", label: "Width / taper", min: -100, max: 100, negLabel: "Tapered", posLabel: "Squarer" },
      { key: "prejowl", label: "Prejowl blend", min: 0, max: 100, negLabel: "As is", posLabel: "Blended" },
    ],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & profile assessment",
        detail:
          "Profile photos, E-line and labiomental angle assessment, agree target from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Medical screening",
        detail:
          "Allergies, previous filler in the area, blood thinners, dental work planned in the next fortnight.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Injection session",
        detail:
          "1-2ml structural hyaluronic acid filler placed deep on bone via cannula or needle. Symmetry checked continuously.",
        offset_days: 7,
      },
      {
        kind: "followup",
        label: "2-week review: photo capture",
        detail:
          "Integration settled. Capture front + profile photos and compare against the visualization.",
        offset_days: 21,
      },
      {
        kind: "milestone",
        label: "Touch-up if needed",
        detail: "Up to 1ml for projection balance or jawline blending.",
        offset_days: 28,
      },
      {
        kind: "followup",
        label: "Maintenance reminder",
        detail:
          "Structural chin filler typically lasts 12-18 months. Book a review.",
        offset_days: 380,
      },
      {
        kind: "medicine",
        label: "Aftercare (first week)",
        detail:
          "Avoid firm pressure on the chin and sleeping face-down for 1 week. Avoid heat, sauna, strenuous exercise and alcohol for 24-48h.",
      },
      {
        kind: "medicine",
        label: "Swelling & bruise care",
        detail:
          "Cold compress the first evening. Arnica optional. Paracetamol if needed; avoid ibuprofen and aspirin.",
      },
      {
        kind: "medicine",
        label: "Dental caution",
        detail: "Avoid dental procedures for 2 weeks after treatment.",
      },
    ],
  },

  // =====================================================================
  // BOTOX (injectable) — line softening + shape effects
  // =====================================================================
  {
    id: "botox",
    name: "Botox",
    category: "injectable",
    region: "forehead",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: BOTOX_PROMPT_TEMPLATE,
    slider_schema: [
      {
        key: "forehead_lines",
        label: "Forehead lines",
        hint: "Horizontal frontalis lines",
        min: 0,
        max: 100,
        posPhrase:
          "soften the horizontal forehead lines while keeping natural skin texture",
        negLabel: "As is",
        posLabel: "Softened",
      },
      {
        key: "glabella_lines",
        label: "Frown lines (11s)",
        hint: "Vertical glabellar lines between the brows",
        min: 0,
        max: 100,
        posPhrase:
          "smooth the vertical glabellar frown lines between the eyebrows for a rested, unworried expression",
        negLabel: "As is",
        posLabel: "Smoothed",
      },
      {
        key: "crows_feet",
        label: "Crow's feet",
        hint: "Radiating lines at the outer eye corners",
        min: 0,
        max: 100,
        posPhrase:
          "soften the crow's feet lines at the outer corners of the eyes",
        negLabel: "As is",
        posLabel: "Softened",
      },
      {
        key: "brow_lift",
        label: "Brow lift",
        hint: "Chemical lift of the brow tail, opens the eye area",
        min: 0,
        max: 100,
        posPhrase:
          "create a chemical brow lift, elevating the tails of the eyebrows and opening the eye area",
        negLabel: "As is",
        posLabel: "Lifted",
      },
      {
        key: "masseter_slim",
        label: "Masseter slimming",
        hint: "Reduces jaw-muscle bulk toward a tapered lower face",
        min: 0,
        max: 100,
        posPhrase:
          "slim the masseter muscles at the jaw angles for a softer, more tapered lower-face contour",
        negLabel: "As is",
        posLabel: "Slimmer",
      },
      {
        key: "lip_flip",
        label: "Lip flip",
        hint: "Relaxes the upper lip edge into slight eversion",
        min: 0,
        max: 100,
        posPhrase:
          "create a botox lip flip with upward eversion of the upper lip, without adding volume",
        negLabel: "As is",
        posLabel: "Flipped",
      },
    ],
    canvas_handles: [
      { key: "brow_lift", label: "Brow lift", min: 0, max: 100, negLabel: "As is", posLabel: "Lifted" },
      { key: "masseter_slim", label: "Masseter slim", min: 0, max: 100, negLabel: "As is", posLabel: "Slimmer" },
      { key: "lip_flip", label: "Lip flip", min: 0, max: 100, negLabel: "As is", posLabel: "Flipped" },
    ],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & dynamic assessment",
        detail:
          "Map treatment areas at rest and in animation (raise, frown, smile). Photos captured. Units planned per area.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Medical screening",
        detail:
          "Neuromuscular conditions, pregnancy/breastfeeding, recent antibiotics, previous toxin response.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Injection session",
        detail:
          "Botulinum toxin injected per the mapped plan. Takes about 15 minutes; no downtime.",
        offset_days: 7,
      },
      {
        kind: "followup",
        label: "Results check (day 14): photo capture",
        detail:
          "Full effect visible from about day 10-14. Capture photos and compare with the visualization.",
        offset_days: 21,
      },
      {
        kind: "milestone",
        label: "Top-up review if needed",
        detail: "Small unit top-up for symmetry or residual movement.",
        offset_days: 28,
      },
      {
        kind: "followup",
        label: "Maintenance reminder",
        detail: "Effect typically lasts 3-4 months. Book the next session.",
        offset_days: 100,
      },
      {
        kind: "medicine",
        label: "Aftercare (first 24 hours)",
        detail:
          "Stay upright for 4 hours. No rubbing or massaging the treated areas. No strenuous exercise for 24h.",
      },
      {
        kind: "medicine",
        label: "First week",
        detail:
          "Avoid facials, tight headwear and pressure on treated areas for 1 week. Report any heaviness of the eyelid.",
      },
    ],
  },

  // =====================================================================
  // Declared, not yet wired
  // =====================================================================
  {
    id: "chin_jaw",
    name: "Chin / Jaw Surgery",
    category: "surgical",
    region: "jaw",
    available: false,
    model: "gemini-2.5-flash-image",
    prompt_template: "",
    slider_schema: [],
    canvas_handles: [],
    plan_template: [],
  },
  {
    id: "blepharoplasty",
    name: "Blepharoplasty",
    category: "surgical",
    region: "under_eye",
    available: false,
    model: "gemini-2.5-flash-image",
    prompt_template: "",
    slider_schema: [],
    canvas_handles: [],
    plan_template: [],
  },
  {
    id: "laser_resurfacing",
    name: "Laser Resurfacing",
    category: "skin",
    region: "skin",
    available: false,
    model: "gemini-2.5-flash-image",
    prompt_template: "",
    slider_schema: [],
    canvas_handles: [],
    plan_template: [],
  },
  {
    id: "laser_hair_removal",
    name: "Laser Hair Removal",
    category: "skin",
    region: "skin",
    available: false,
    model: "gemini-2.5-flash-image",
    prompt_template: "",
    slider_schema: [],
    canvas_handles: [],
    plan_template: [],
  },
  {
    id: "pigmentation",
    name: "Pigmentation / Acne",
    category: "skin",
    region: "skin",
    available: false,
    model: "gemini-2.5-flash-image",
    prompt_template: "",
    slider_schema: [],
    canvas_handles: [],
    plan_template: [],
  },
];

export const PROCEDURE_CATEGORIES: {
  id: string;
  label: string;
  blurb: string;
  templateIds: string[];
}[] = [
  {
    id: "injectable",
    label: "Injectables / Non-invasive",
    blurb: "Lip filler, chin filler, botox",
    templateIds: ["lip_filler", "chin_filler", "botox"],
  },
  {
    id: "surgical",
    label: "Surgical / Structural",
    blurb: "Rhinoplasty, chin & jaw, eyelids",
    templateIds: ["rhinoplasty", "chin_jaw", "blepharoplasty"],
  },
  {
    id: "skin",
    label: "Skin / Energy-based",
    blurb: "Lasers, pigmentation, resurfacing",
    templateIds: ["laser_resurfacing", "laser_hair_removal", "pigmentation"],
  },
];

export function getTemplate(id: string | null | undefined) {
  if (!id) return undefined;
  return TEMPLATES.find((t) => t.id === id);
}

/**
 * Active templates for a brief: available selections, primary first.
 * The multi-procedure pipeline (T2) rests on slider keys staying flat and
 * globally unique across live templates.
 */
export function activeTemplatesFor(
  interests: string[],
  primary: string | null
): TreatmentTemplate[] {
  const ordered = [primary, ...interests.filter((i) => i !== primary)];
  const seen = new Set<string>();
  const out: TreatmentTemplate[] = [];
  for (const id of ordered) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const t = getTemplate(id);
    if (t?.available) out.push(t);
  }
  return out;
}

// Dev assertion: the flat-params design requires globally unique slider
// keys across live templates. Fails loudly in development if violated.
if (process.env.NODE_ENV !== "production") {
  const seen = new Map<string, string>();
  for (const t of TEMPLATES.filter((x) => x.available)) {
    for (const s of t.slider_schema) {
      const prior = seen.get(s.key);
      if (prior && prior !== t.id) {
        console.error(
          `[templates] DUPLICATE slider key "${s.key}" in ${prior} and ${t.id}. Multi-procedure params will collide.`
        );
      }
      seen.set(s.key, t.id);
    }
  }
}
