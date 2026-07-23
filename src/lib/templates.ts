/**
 * Treatment templates — the reusable unit that makes the system scale
 * across procedures (knowledge base / 06_treatments-and-plan.md).
 *
 * A template bundles: the AI slider schema + prompt template (drives
 * 05_ai-before-after.md), the 3D canvas morph handles, and the default plan
 * checklist. Adding a procedure = adding one object here.
 *
 * Full aesthetic-clinic catalog across five menus: Injectables (botox,
 * lip / cheek / tear-trough / nasolabial / jawline / temple / chin fillers,
 * liquid rhinoplasty), Skin / resurfacing (laser resurfacing, chemical
 * peel, microneedling RF, HydraFacial, pigmentation / melasma, acne-scar
 * revision, laser hair removal), Lifting & tightening (HIFU, PDO thread
 * lift), Surgical / structural (rhinoplasty, chin & jaw, blepharoplasty,
 * facelift / neck lift, buccal fat, fat transfer) and Hair (FUE transplant
 * + hairstyle try-on, PRP).
 *
 * Two hard invariants make the set composable:
 *  1. Slider keys are GLOBALLY UNIQUE across every available template — the
 *     multi-procedure flow (T2) keeps one flat params record keyed by
 *     slider key, so a collision would cross-wire two procedures. The dev
 *     assertion at the foot of this file guards it.
 *  2. canvas_handles only ever reference keys the shared morph engine
 *     (face/geometry.ts applyMorphs) actually deforms. The anatomically
 *     tuned fields are owned by the original five verticals; new geometric
 *     procedures use the free feature-scale fields (scale_cheeks for cheek
 *     filler, scale_jaw for jawline filler). Everything else is AI-pass
 *     only (canvas_handles: []), exactly like the hair vertical — the
 *     slider still drives the identity-preserving prompt, it just does not
 *     move the live 3D sketch.
 *
 * Slider parameters follow real clinical assessment frameworks (lip
 * architecture: vermilion volume, 1:1.6 upper-to-lower ratio, cupid's bow,
 * philtral columns, vermilion border, oral commissures; chin: projection to
 * the Ricketts E-line, vertical height, width, labiomental sulcus, prejowl
 * blending; botox: frontalis / glabella / orbicularis line softening,
 * chemical brow lift, masseter slimming, lip flip).
 */

import type { TreatmentTemplate } from "./types";

export const RHINOPLASTY_PROMPT_TEMPLATE = `Edit ONLY the nose in this photograph to visualize the result of a rhinoplasty procedure. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity and all other facial features, eyes, lips, skin tone and texture, facial proportions, hairstyle, lighting, camera angle, and background. Do not beautify or alter anything other than the nose. The result must look like the SAME person with a natural, fully-healed post-surgical nose. Photorealistic, consistent lighting, no artifacts.`;

export const LIP_FILLER_PROMPT_TEMPLATE = `Edit ONLY the lips and the immediate perioral area in this photograph to visualize the fully settled result of a hyaluronic acid lip filler treatment. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity and all other facial features, eyes, nose, teeth, skin tone and texture, facial proportions, hairstyle, lighting, camera angle, and background. Keep the mouth in the same position and expression. The result must look like the SAME person with naturally enhanced, softly hydrated lips: healed, settled, no swelling, no bruising, and absolutely no overfilled or duck-lip effect. Keep the enhancement proportionate and believable. Photorealistic, consistent lighting, no artifacts.`;

export const CHIN_FILLER_PROMPT_TEMPLATE = `Edit ONLY the chin and lower jawline area in this photograph to visualize the fully settled result of a non-surgical hyaluronic acid chin augmentation. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity and all other facial features, eyes, nose, lips, skin tone and texture, hairstyle, lighting, camera angle, and background. The result must look like the SAME person with a naturally balanced, structurally supported chin that blends smoothly into the jawline: healed, settled, no swelling. Keep the enhancement anatomically plausible and proportionate to the face. Photorealistic, consistent lighting, no artifacts.`;

export const HAIR_TRANSPLANT_PROMPT_TEMPLATE = `Edit ONLY the hair, hairline and scalp in this photograph to visualize the final grown-in result of a hair transplant, approximately 12 months after the procedure. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity, face and all facial features, skin tone and texture, eyebrows and any facial hair, expression, lighting, camera angle, framing, clothing and background. The restored hairline must look completely natural: a soft, slightly irregular front edge with fine single hairs at the border, an age-appropriate position, natural growth direction and a realistic density gradient. Use the person's own natural hair color and texture unless a different style is explicitly described above. The result must be unmistakably the SAME person, fully healed, with no scars, redness or transplant marks. Photorealistic, consistent lighting, no artifacts.`;

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
  // HAIR TRANSPLANT (hair restoration) — restoration goals + hairstyle
  // try-on. Hair sits outside the face mesh, so this vertical is AI-pass
  // only (no geometric canvas handles); the try-on chips are exclusive
  // on/off params (style_* = 100, bandless phrases).
  // =====================================================================
  {
    id: "hair_transplant",
    name: "Hair Transplant",
    category: "hair",
    region: "hairline",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: HAIR_TRANSPLANT_PROMPT_TEMPLATE,
    slider_schema: [
      {
        key: "hairline_restore",
        label: "Hairline restore",
        hint: "Bring the receded frontal hairline forward",
        min: 0,
        max: 100,
        posPhrase:
          "lower and restore the receded frontal hairline to a natural, age-appropriate position",
        negLabel: "As is",
        posLabel: "Restored",
      },
      {
        key: "temple_fill",
        label: "Temple points",
        hint: "Recession at the temples",
        min: 0,
        max: 100,
        posPhrase:
          "fill in the recessed temple points so the hairline gently frames the face",
        negLabel: "As is",
        posLabel: "Filled",
      },
      {
        key: "hair_density",
        label: "Overall density",
        hint: "Fullness across the top of the scalp",
        min: 0,
        max: 100,
        posPhrase:
          "increase overall hair density and fullness across the top of the scalp",
        negLabel: "As is",
        posLabel: "Denser",
      },
      {
        key: "crown_coverage",
        label: "Crown coverage",
        hint: "Thinning at the crown / vertex",
        min: 0,
        max: 100,
        posPhrase: "restore natural coverage over the thinning crown",
        negLabel: "As is",
        posLabel: "Covered",
      },
      // ---- hairstyle try-on (exclusive chips, not sliders) ----
      {
        key: "style_classic_taper",
        label: "Classic taper",
        hint: "Hairstyle try-on",
        min: 0,
        max: 100,
        bandless: true,
        posPhrase:
          "restyle the grown-in hair as a classic short tapered cut, neatly groomed",
        negLabel: "Off",
        posLabel: "On",
      },
      {
        key: "style_textured_crop",
        label: "Textured crop",
        hint: "Hairstyle try-on",
        min: 0,
        max: 100,
        bandless: true,
        posPhrase:
          "restyle the grown-in hair as a modern textured crop with a short textured fringe",
        negLabel: "Off",
        posLabel: "On",
      },
      {
        key: "style_side_part",
        label: "Side part",
        hint: "Hairstyle try-on",
        min: 0,
        max: 100,
        bandless: true,
        posPhrase:
          "restyle the grown-in hair as a medium-length cut with a clean side part",
        negLabel: "Off",
        posLabel: "On",
      },
      {
        key: "style_slick_back",
        label: "Slicked back",
        hint: "Hairstyle try-on",
        min: 0,
        max: 100,
        bandless: true,
        posPhrase:
          "restyle the grown-in hair swept straight back off the forehead",
        negLabel: "Off",
        posLabel: "On",
      },
      {
        key: "style_pompadour",
        label: "Pompadour",
        hint: "Hairstyle try-on",
        min: 0,
        max: 100,
        bandless: true,
        posPhrase:
          "restyle the grown-in hair as a soft pompadour with volume swept up and back",
        negLabel: "Off",
        posLabel: "On",
      },
      {
        key: "style_curls",
        label: "Natural curls",
        hint: "Hairstyle try-on",
        min: 0,
        max: 100,
        bandless: true,
        posPhrase:
          "restyle the grown-in hair as medium-length natural curls",
        negLabel: "Off",
        posLabel: "On",
      },
      {
        key: "style_buzz",
        label: "Buzz cut",
        hint: "Hairstyle try-on",
        min: 0,
        max: 100,
        bandless: true,
        posPhrase:
          "restyle the grown-in hair as a uniform short buzz cut that clearly shows the restored hairline",
        negLabel: "Off",
        posLabel: "On",
      },
      {
        key: "style_long_flow",
        label: "Long flow",
        hint: "Hairstyle try-on",
        min: 0,
        max: 100,
        bandless: true,
        posPhrase:
          "restyle the grown-in hair as longer, flowing hair swept back from the face",
        negLabel: "Off",
        posLabel: "On",
      },
    ],
    canvas_handles: [], // hair sits outside the face mesh: AI pass only
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & scalp assessment",
        detail:
          "Trichoscopy, Norwood/Ludwig staging, donor area density check, graft estimate. Agree the hairline design from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Medical screening",
        detail:
          "Scalp conditions, keloid history, blood thinners, smoking status, diabetes. Baseline photos captured.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Procedure day (FUE)",
        detail:
          "Follicular units extracted from the donor area and implanted per the agreed hairline design. Local anesthesia, typically 4-8 hours.",
        offset_days: 14,
      },
      {
        kind: "milestone",
        label: "First wash & graft check (day 3)",
        detail:
          "Supervised first wash at the clinic; graft take and donor healing reviewed.",
        offset_days: 17,
      },
      {
        kind: "followup",
        label: "2-week review: photo capture",
        detail:
          "Shedding-phase counselling: shock loss of transplanted hairs from week 2-8 is normal and expected. Capture photos.",
        offset_days: 28,
      },
      {
        kind: "followup",
        label: "4-month review: early regrowth",
        detail:
          "New growth typically starts at month 3-4. Capture timeline photos and compare progress.",
        offset_days: 134,
      },
      {
        kind: "followup",
        label: "8-month review: density check",
        detail:
          "Most density visible by month 8. Photo capture; discuss any planned second session.",
        offset_days: 254,
      },
      {
        kind: "followup",
        label: "12-month result review: before/after photo",
        detail:
          "Final grown-in result. Compare against the AI visualization; capture the result set.",
        offset_days: 380,
      },
      {
        kind: "medicine",
        label: "Post-op course",
        detail:
          "Antibiotic and analgesia short course per clinician. Anti-swelling regime for the forehead in the first days.",
      },
      {
        kind: "medicine",
        label: "Graft care (first 10 days)",
        detail:
          "Saline spray on grafts every 2-3 hours while awake; gentle no-pressure wash technique. No caps or helmets for 2 weeks, no gym or heavy sweating for 2 weeks, protect the scalp from direct sun.",
      },
      {
        kind: "medicine",
        label: "Maintenance therapy",
        detail:
          "Finasteride and/or topical minoxidil per clinician's prescription to protect non-transplanted native hair.",
      },
    ],
  },

  // =====================================================================
  // CHEEK / MIDFACE FILLER (injectable) — regional volume; the cheek scale
  // is a real geometric handle (applyMorphs feature-scale on "cheeks").
  // =====================================================================
  {
    id: "cheek_filler",
    name: "Cheek / Midface Filler",
    category: "injectable",
    region: "cheeks",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the cheeks and midface in this photograph to visualize the fully settled result of a hyaluronic acid cheek and midface filler treatment. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity and all other facial features, eyes, nose, lips, skin tone and texture, facial proportions, hairstyle, lighting, camera angle, and background. The result must look like the SAME person with naturally restored midface volume and a subtly lifted cheek contour: healed, settled, no swelling, never overfilled or pillowed. Keep the enhancement proportionate and believable. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "scale_cheeks",
        label: "Cheek / midface volume",
        hint: "Overall volume of the cheek and midface region",
        min: 0,
        max: 100,
        posPhrase:
          "restore soft, natural volume to the cheeks and midface for a subtly lifted contour",
        negLabel: "As is",
        posLabel: "Fuller",
      },
      {
        key: "mid_cheek_projection",
        label: "Anterior projection",
        hint: "Forward projection of the front of the cheek",
        min: 0,
        max: 100,
        posPhrase:
          "add gentle forward projection to the anterior cheek for a lifted, youthful midface",
        negLabel: "As is",
        posLabel: "Projected",
      },
      {
        key: "submalar_fill",
        label: "Submalar hollow",
        hint: "The hollow just below the cheekbone",
        min: 0,
        max: 100,
        posPhrase:
          "fill the submalar hollows beneath the cheekbones to soften a gaunt or tired appearance",
        negLabel: "As is",
        posLabel: "Filled",
      },
      {
        key: "cheek_lift",
        label: "Cheek apex lift",
        hint: "Height of the cheek's high point",
        min: 0,
        max: 100,
        posPhrase:
          "lift the cheek apex to restore a youthful high-cheekbone position",
        negLabel: "As is",
        posLabel: "Lifted",
      },
      {
        key: "ogee_curve",
        label: "Ogee curve",
        hint: "The smooth S-curve of the cheek in three-quarter view",
        min: 0,
        max: 100,
        posPhrase:
          "enhance the ogee curve for a smooth, convex cheek contour in three-quarter view",
        negLabel: "As is",
        posLabel: "Defined",
      },
    ],
    canvas_handles: [
      { key: "scale_cheeks", label: "Cheek / midface volume", min: 0, max: 100, negLabel: "As is", posLabel: "Fuller" },
    ],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & midface assessment",
        detail:
          "Facial-thirds and midface volume assessment, photos, agree the target from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Medical screening",
        detail:
          "Allergies, previous filler in the area, blood thinners, pregnancy/breastfeeding.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Injection session",
        detail:
          "1-2ml hyaluronic acid filler placed on the cheekbone and midface via cannula or needle with topical numbing. Symmetry checked continuously.",
        offset_days: 7,
      },
      {
        kind: "followup",
        label: "2-week review: photo capture",
        detail:
          "Swelling settled. Capture photos and compare with the visualization.",
        offset_days: 21,
      },
      {
        kind: "milestone",
        label: "Touch-up if needed",
        detail: "Up to 1ml for symmetry or projection balance.",
        offset_days: 28,
      },
      {
        kind: "followup",
        label: "Maintenance reminder",
        detail: "Cheek filler typically lasts 12-18 months. Book a review.",
        offset_days: 380,
      },
      {
        kind: "medicine",
        label: "Aftercare (first 48 hours)",
        detail:
          "Avoid heat, sauna, strenuous exercise and alcohol for 24-48h. Sleep slightly elevated and avoid firm pressure on the cheeks.",
      },
      {
        kind: "medicine",
        label: "Swelling & bruise care",
        detail:
          "Cold compress the first evening. Arnica optional. Paracetamol if needed; avoid ibuprofen and aspirin.",
      },
    ],
  },

  // =====================================================================
  // TEAR-TROUGH / UNDER-EYE FILLER (injectable) — AI pass only: filling a
  // hollow is a forward-volume change the isotropic scale field can't fake.
  // =====================================================================
  {
    id: "tear_trough",
    name: "Tear-Trough Filler",
    category: "injectable",
    region: "under_eye",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the under-eye area (the tear troughs and lid-cheek junction) in this photograph to visualize the fully settled result of a careful hyaluronic acid tear-trough filler treatment. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity, eye shape, eye colour and gaze, lashes, all other facial features, skin tone and texture, hairstyle, lighting, camera angle, and background. The result must look like the SAME person looking rested: healed, settled, no lumps, no puffiness and no bluish tint. Keep the correction subtle and believable. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "trough_fill",
        label: "Hollow correction",
        hint: "Depth of the tear-trough shadow under the eye",
        min: 0,
        max: 100,
        posPhrase:
          "gently fill the tear-trough hollows to reduce the dark shadow under the eyes",
        negLabel: "As is",
        posLabel: "Filled",
      },
      {
        key: "undereye_smooth",
        label: "Lid-cheek blend",
        hint: "Transition between the lower eyelid and the cheek",
        min: 0,
        max: 100,
        posPhrase:
          "smooth the transition between the lower eyelid and the cheek for a seamless under-eye",
        negLabel: "As is",
        posLabel: "Smoothed",
      },
      {
        key: "undereye_brighten",
        label: "Brightening",
        hint: "Perceived darkness / tiredness of the under-eye",
        min: 0,
        max: 100,
        posPhrase:
          "brighten and even the under-eye area, reducing a tired, hollow appearance",
        negLabel: "As is",
        posLabel: "Brighter",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & under-eye assessment",
        detail:
          "Assess tear-trough depth, skin quality, fluid tendency and suitability (poor candidates are declined). Photos captured.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Medical screening",
        detail:
          "Allergies, blood thinners, thyroid/fluid-retention history, pregnancy/breastfeeding.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Injection session",
        detail:
          "0.5-1.0ml low-hydrophilic hyaluronic acid placed deep with a cannula, conservatively. Under-correction is intentional.",
        offset_days: 7,
      },
      {
        kind: "followup",
        label: "3-week review: photo capture",
        detail:
          "Assess for puffiness or unevenness once fully settled. Capture photos and compare with the visualization.",
        offset_days: 28,
      },
      {
        kind: "followup",
        label: "Maintenance reminder",
        detail: "Tear-trough filler typically lasts 9-15 months. Book a review.",
        offset_days: 300,
      },
      {
        kind: "medicine",
        label: "Aftercare (first 48 hours)",
        detail:
          "Sleep elevated, reduce salt, avoid heat and strenuous exercise for 24-48h. Report any prolonged puffiness or bluish tint.",
      },
    ],
  },

  // =====================================================================
  // NASOLABIAL FOLD FILLER (injectable) — AI pass only.
  // =====================================================================
  {
    id: "nasolabial_filler",
    name: "Nasolabial Fold Filler",
    category: "injectable",
    region: "cheeks",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the nasolabial folds and the lines around the mouth in this photograph to visualize the fully settled result of a hyaluronic acid filler treatment. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity and all other facial features, eyes, nose, lips, teeth, skin tone and texture, expression, hairstyle, lighting, camera angle, and background. The result must look like the SAME person with softened folds: healed, settled, natural, never flattened or overfilled. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "nasolabial_soften",
        label: "Nasolabial folds",
        hint: "The lines running from the nose to the mouth corners",
        min: 0,
        max: 100,
        posPhrase:
          "soften and reduce the depth of the nasolabial folds running from the nose to the mouth corners",
        negLabel: "As is",
        posLabel: "Softened",
      },
      {
        key: "marionette_soften",
        label: "Marionette lines",
        hint: "The lines running down from the mouth corners",
        min: 0,
        max: 100,
        posPhrase:
          "soften the marionette lines running downward from the corners of the mouth",
        negLabel: "As is",
        posLabel: "Softened",
      },
      {
        key: "perioral_support",
        label: "Perioral support",
        hint: "Overall support of the area around the mouth",
        min: 0,
        max: 100,
        posPhrase:
          "restore gentle structural support to the area around the mouth for a smoother lower face",
        negLabel: "As is",
        posLabel: "Supported",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & assessment",
        detail:
          "Assess fold depth and whether midface support is the better first step. Photos captured; agree the target from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Medical screening",
        detail:
          "Allergies, cold-sore history, blood thinners, pregnancy/breastfeeding.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Injection session",
        detail:
          "0.5-1.0ml hyaluronic acid filler along the folds with topical numbing. Symmetry checked continuously.",
        offset_days: 7,
      },
      {
        kind: "followup",
        label: "2-week review: photo capture",
        detail: "Swelling settled. Capture photos and compare with the visualization.",
        offset_days: 21,
      },
      {
        kind: "followup",
        label: "Maintenance reminder",
        detail: "Filler here typically lasts 9-12 months. Book a review.",
        offset_days: 300,
      },
      {
        kind: "medicine",
        label: "Aftercare (first 48 hours)",
        detail:
          "No makeup over the area for 12h. Avoid heat, sauna, strenuous exercise and alcohol for 24-48h.",
      },
    ],
  },

  // =====================================================================
  // JAWLINE FILLER / CONTOUR (injectable) — the jaw scale is a real
  // geometric handle (applyMorphs feature-scale on "jaw").
  // =====================================================================
  {
    id: "jawline_filler",
    name: "Jawline Filler / Contour",
    category: "injectable",
    region: "jaw",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the jawline and lower face in this photograph to visualize the fully settled result of a hyaluronic acid jawline contouring treatment. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity and all other facial features, eyes, nose, lips, skin tone and texture, hairstyle, lighting, camera angle, and background. The result must look like the SAME person with a naturally more defined jawline that stays in proportion: healed, settled, no swelling, never bulky or overfilled. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "scale_jaw",
        label: "Jaw definition",
        hint: "Overall structure and width of the jawline",
        min: 0,
        max: 100,
        posPhrase:
          "add structure and definition along the jawline for a stronger, more sculpted lower face",
        negLabel: "As is",
        posLabel: "Stronger",
      },
      {
        key: "gonial_angle",
        label: "Jaw angle",
        hint: "The angle where the jaw turns up toward the ear",
        min: 0,
        max: 100,
        posPhrase:
          "sharpen and define the gonial jaw angle for a crisper lower-face corner",
        negLabel: "As is",
        posLabel: "Defined",
      },
      {
        key: "mandible_line",
        label: "Mandibular border",
        hint: "The straightness of the lower jaw border",
        min: 0,
        max: 100,
        posPhrase:
          "create a crisp, straight mandibular border running from the jaw angle to the chin",
        negLabel: "As is",
        posLabel: "Crisp",
      },
      {
        key: "jaw_contour",
        label: "Jowl smoothing",
        hint: "Early jowling along the jawline",
        min: 0,
        max: 100,
        posPhrase:
          "smooth and contour the jawline, softening early jowling for a continuous line",
        negLabel: "As is",
        posLabel: "Smoothed",
      },
    ],
    canvas_handles: [
      { key: "scale_jaw", label: "Jaw definition", min: 0, max: 100, negLabel: "As is", posLabel: "Stronger" },
    ],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & jawline assessment",
        detail:
          "Assess jaw shape, chin projection and skin laxity; front + profile photos. Agree the target from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Medical screening",
        detail: "Allergies, blood thinners, dental work planned soon, pregnancy/breastfeeding.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Injection session",
        detail:
          "2-4ml structural hyaluronic acid placed along the mandible and at the jaw angles via cannula or needle. Symmetry checked continuously.",
        offset_days: 7,
      },
      {
        kind: "followup",
        label: "2-week review: photo capture",
        detail: "Integration settled. Capture front + profile photos and compare with the visualization.",
        offset_days: 21,
      },
      {
        kind: "milestone",
        label: "Touch-up if needed",
        detail: "Up to 1-2ml for symmetry or definition balance.",
        offset_days: 28,
      },
      {
        kind: "followup",
        label: "Maintenance reminder",
        detail: "Jawline filler typically lasts 12-18 months. Book a review.",
        offset_days: 380,
      },
      {
        kind: "medicine",
        label: "Aftercare (first week)",
        detail:
          "Avoid firm pressure on the jaw and sleeping face-down for 1 week. Avoid heat, sauna, strenuous exercise and alcohol for 24-48h.",
      },
    ],
  },

  // =====================================================================
  // TEMPLE FILLER (injectable) — AI pass only.
  // =====================================================================
  {
    id: "temple_filler",
    name: "Temple Filler",
    category: "injectable",
    region: "forehead",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the temples (the area at the sides of the forehead, between the brow tail, the eye and the hairline) in this photograph to visualize the fully settled result of a hyaluronic acid temple filler treatment. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity and all other facial features, eyes, brows, nose, lips, skin tone and texture, hairstyle and hairline, lighting, camera angle, and background. The result must look like the SAME person with softly restored temples that blend smoothly into the brow and hairline: healed, settled, no swelling, never bulging. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "temple_fill_hollow",
        label: "Temple hollow",
        hint: "Sunken hollow at the side of the forehead",
        min: 0,
        max: 100,
        posPhrase:
          "fill the hollow temples to restore a smooth, gently convex curve between the brow and the hairline",
        negLabel: "As is",
        posLabel: "Filled",
      },
      {
        key: "temple_lift",
        label: "Lateral brow support",
        hint: "Support that subtly lifts the outer brow",
        min: 0,
        max: 100,
        posPhrase:
          "create a subtle lateral brow lift by restoring support to the temple region",
        negLabel: "As is",
        posLabel: "Lifted",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & assessment",
        detail:
          "Assess temporal hollowing and vessel anatomy; photos captured. Agree the target from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Medical screening",
        detail: "Allergies, blood thinners, migraine history, pregnancy/breastfeeding.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Injection session",
        detail:
          "0.5-1.0ml per side of hyaluronic acid placed by a careful deep or supraperiosteal technique. Symmetry checked continuously.",
        offset_days: 7,
      },
      {
        kind: "followup",
        label: "2-week review: photo capture",
        detail: "Swelling settled. Capture photos and compare with the visualization.",
        offset_days: 21,
      },
      {
        kind: "followup",
        label: "Maintenance reminder",
        detail: "Temple filler typically lasts 12-18 months. Book a review.",
        offset_days: 380,
      },
      {
        kind: "medicine",
        label: "Aftercare (first 48 hours)",
        detail:
          "Avoid heat, sauna, strenuous exercise and alcohol for 24-48h. Avoid firm pressure on the temples.",
      },
    ],
  },

  // =====================================================================
  // LIQUID RHINOPLASTY (injectable, non-surgical nose) — AI pass only; the
  // geometric nose fields are owned by the surgical rhinoplasty template.
  // Non-surgical: volume can be added/camouflaged, not reduced.
  // =====================================================================
  {
    id: "liquid_rhino",
    name: "Liquid Rhinoplasty (Non-surgical)",
    category: "injectable",
    region: "nose",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the nose in this photograph to visualize the result of a non-surgical liquid rhinoplasty, in which small amounts of hyaluronic acid filler are used to smooth and balance the nasal profile (adding volume only, never removing tissue). {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity and all other facial features, eyes, lips, skin tone and texture, facial proportions, hairstyle, lighting, camera angle, and background. Do not shrink the nose or reduce the nostrils. The result must look like the SAME person with a smoother, straighter-looking nasal profile: healed, settled, subtle and believable. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "lr_bridge_smooth",
        label: "Bridge / hump camouflage",
        hint: "Filler above and below a dorsal hump to straighten the profile",
        min: 0,
        max: 100,
        posPhrase:
          "camouflage a dorsal hump by adding filler above and below it for a straighter bridge profile",
        negLabel: "As is",
        posLabel: "Straightened",
      },
      {
        key: "lr_tip_lift",
        label: "Tip lift / support",
        hint: "Subtle lift and support of a drooping tip",
        min: 0,
        max: 100,
        posPhrase:
          "subtly lift and support the nasal tip, refining the angle between the nose and lip",
        negLabel: "As is",
        posLabel: "Lifted",
      },
      {
        key: "lr_radix_fill",
        label: "Radix balance",
        hint: "Raise a low nasal root at the top of the bridge",
        min: 0,
        max: 100,
        posPhrase:
          "raise a low radix at the nasal root to better balance the profile",
        negLabel: "As is",
        posLabel: "Raised",
      },
      {
        key: "lr_straighten",
        label: "Frontal straightness",
        hint: "Straighten a crooked bridge in front view",
        min: 0,
        max: 100,
        posPhrase:
          "improve the frontal straightness and symmetry of the nasal bridge",
        negLabel: "As is",
        posLabel: "Straighter",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & profile assessment",
        detail:
          "Front + profile photos, E-line and nasofrontal angle assessment, vascular-safety counselling. Agree the target from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Medical screening",
        detail:
          "Previous rhinoplasty or nasal filler, blood thinners, cold-sore history, pregnancy/breastfeeding.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Injection session",
        detail:
          "Small aliquots (usually 0.3-0.8ml total) of hyaluronic acid placed slowly in the midline with aspiration and constant vascular vigilance. Dissolver (hyaluronidase) kept on hand.",
        offset_days: 7,
      },
      {
        kind: "followup",
        label: "2-week review: photo capture",
        detail:
          "Assess the settled profile. Capture front + profile photos and compare with the visualization.",
        offset_days: 21,
      },
      {
        kind: "followup",
        label: "Maintenance reminder",
        detail: "Liquid rhinoplasty typically lasts 12-18 months. Book a review.",
        offset_days: 380,
      },
      {
        kind: "medicine",
        label: "Aftercare & vascular safety",
        detail:
          "Avoid glasses pressure, heat and strenuous exercise for 48h. Report immediately any severe pain, blanching, dusky skin or vision change.",
      },
    ],
  },

  // =====================================================================
  // CHIN & JAW SURGERY (surgical, genioplasty / jaw contouring) — AI pass
  // only; the non-surgical chin fields are owned by the chin-filler template.
  // =====================================================================
  {
    id: "chin_jaw",
    name: "Chin & Jaw Surgery",
    category: "surgical",
    region: "jaw",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the chin and jawline bone contour in this photograph to visualize the result of chin and jaw surgery (genioplasty and/or jaw-angle contouring), as it would look fully healed. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity and all other facial features, eyes, nose, lips, skin tone and texture, hairstyle, lighting, camera angle, and background. The result must look like the SAME person with a naturally rebalanced lower face: fully healed, no scars, no swelling, and in proportion. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "genio_projection",
        label: "Chin projection",
        hint: "Forward projection of the chin (sliding genioplasty)",
        min: -100,
        max: 100,
        negPhrase: "reduce an over-projected chin for a balanced profile",
        posPhrase:
          "advance the chin forward to correct a weak or recessed chin",
        negLabel: "Reduce",
        posLabel: "Advance",
      },
      {
        key: "genio_vertical",
        label: "Vertical height",
        hint: "Lower-face height, from lip to chin tip",
        min: -100,
        max: 100,
        negPhrase: "shorten a long lower face by reducing vertical chin height",
        posPhrase: "lengthen a short chin by increasing vertical height",
        negLabel: "Shorter",
        posLabel: "Longer",
      },
      {
        key: "jaw_angle_implant",
        label: "Jaw-angle augmentation",
        hint: "Width and definition at the jaw angles",
        min: 0,
        max: 100,
        posPhrase:
          "augment the jaw angles for a wider, more defined and structured lower face",
        negLabel: "As is",
        posLabel: "Augmented",
      },
      {
        key: "jaw_reduction",
        label: "Jaw-angle reduction",
        hint: "Softening a prominent or square jaw angle",
        min: 0,
        max: 100,
        posPhrase:
          "reduce a prominent or square jaw angle for a softer, more tapered lower face",
        negLabel: "As is",
        posLabel: "Softened",
      },
      {
        key: "genio_asymmetry",
        label: "Chin centring",
        hint: "Deviation of the chin from the facial midline",
        min: 0,
        max: 100,
        posPhrase:
          "correct chin asymmetry by centring the chin to the facial midline",
        negLabel: "As is",
        posLabel: "Centred",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & imaging",
        detail:
          "Facial-proportion analysis, cephalometry/OPG as indicated, dental occlusion review. Front + profile photos; agree the target from the AI visualization.",
        offset_days: 7,
      },
      {
        kind: "milestone",
        label: "Pre-op assessment & bloodwork",
        detail: "CBC, coagulation profile, anesthesia fitness review.",
        offset_days: 14,
      },
      {
        kind: "milestone",
        label: "Surgery performed",
        detail:
          "Genioplasty and/or jaw-angle contouring via an intraoral approach under general anesthesia.",
        offset_days: 21,
      },
      {
        kind: "followup",
        label: "Follow-up 1 (2 weeks): photo capture",
        detail: "Healing and swelling check. Capture front + profile photos.",
        offset_days: 35,
      },
      {
        kind: "followup",
        label: "Result review (3 months): before/after photo",
        detail:
          "Swelling largely resolved. Compare with the AI visualization; capture the result set.",
        offset_days: 111,
      },
      {
        kind: "medicine",
        label: "Antibiotic course",
        detail: "Co-amoxiclav 625mg, 1 tablet three times daily for 7 days.",
      },
      {
        kind: "medicine",
        label: "Analgesia & mouth care",
        detail:
          "Paracetamol/ibuprofen as directed. Chlorhexidine mouthwash and a soft diet for 2 weeks; no strenuous activity for 3-4 weeks.",
      },
    ],
  },

  // =====================================================================
  // BLEPHAROPLASTY (surgical, eyelids) — AI pass only.
  // =====================================================================
  {
    id: "blepharoplasty",
    name: "Blepharoplasty (Eyelid Surgery)",
    category: "surgical",
    region: "under_eye",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the eyelids and the immediate area around the eyes in this photograph to visualize the result of blepharoplasty (eyelid surgery), as it would look fully healed. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity, eye colour, gaze direction and all other facial features, nose, lips, skin tone and texture, hairstyle, lighting, camera angle, and background. Keep the eyes open naturally and the same colour. The result must look like the SAME person looking more rested and refreshed: fully healed, no scars, no hollowed or surprised look. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "bleph_upper_hood",
        label: "Upper-lid hooding",
        hint: "Excess skin folding over the upper eyelid",
        min: 0,
        max: 100,
        posPhrase:
          "reduce excess upper-eyelid skin and hooding to open the eyes (upper blepharoplasty)",
        negLabel: "As is",
        posLabel: "Reduced",
      },
      {
        key: "bleph_lower_bags",
        label: "Lower-lid bags",
        hint: "Puffy fat bags of the lower eyelid",
        min: 0,
        max: 100,
        posPhrase:
          "reduce or reposition the lower-eyelid fat bags for a smooth, rested lower lid",
        negLabel: "As is",
        posLabel: "Smoothed",
      },
      {
        key: "bleph_undereye_hollow",
        label: "Lower-lid hollow",
        hint: "Hollowing and the lid-cheek transition",
        min: 0,
        max: 100,
        posPhrase:
          "correct lower-lid hollowing and blend the lid-cheek junction",
        negLabel: "As is",
        posLabel: "Corrected",
      },
      {
        key: "bleph_canthal_tilt",
        label: "Outer-corner tilt",
        hint: "Position of the outer eye corner",
        min: 0,
        max: 100,
        posPhrase:
          "create a subtle upward canthal tilt at the outer eye corner for a refreshed, almond shape",
        negLabel: "As is",
        posLabel: "Lifted",
      },
      {
        key: "bleph_ptosis",
        label: "Upper-lid ptosis",
        hint: "A drooping upper eyelid covering the iris",
        min: 0,
        max: 100,
        posPhrase:
          "correct upper-eyelid ptosis, raising a drooping lid to reveal more of the iris",
        negLabel: "As is",
        posLabel: "Corrected",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & eye assessment",
        detail:
          "Assess skin, fat and lid position; visual-field and dry-eye screen where relevant. Photos captured; agree the target from the AI visualization.",
        offset_days: 7,
      },
      {
        kind: "milestone",
        label: "Pre-op assessment & bloodwork",
        detail: "CBC, coagulation profile, anesthesia fitness review.",
        offset_days: 14,
      },
      {
        kind: "milestone",
        label: "Surgery performed",
        detail:
          "Upper and/or lower blepharoplasty under local anesthesia with sedation. Fine incisions in the lid crease / behind the lower lid.",
        offset_days: 21,
      },
      {
        kind: "milestone",
        label: "Suture removal (~1 week)",
        detail: "Remove skin sutures; review healing.",
        offset_days: 28,
      },
      {
        kind: "followup",
        label: "Follow-up (2 weeks): photo capture",
        detail: "Bruising settling. Capture photos.",
        offset_days: 35,
      },
      {
        kind: "followup",
        label: "Result review (3 months): before/after photo",
        detail: "Final settled result. Compare with the AI visualization; capture the result set.",
        offset_days: 111,
      },
      {
        kind: "medicine",
        label: "Eye care & analgesia",
        detail:
          "Lubricating eye drops and prescribed ointment as directed. Cold compresses for 48h; sleep head-elevated. Paracetamol for comfort.",
      },
    ],
  },

  // =====================================================================
  // FACELIFT / NECK LIFT (surgical) — AI pass only.
  // =====================================================================
  {
    id: "facelift",
    name: "Facelift / Neck Lift",
    category: "surgical",
    region: "jaw",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the lower face, jawline and neck in this photograph to visualize the result of a facelift / neck lift (SMAS), as it would look fully healed. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity, the character of their face, eyes, nose, lips, skin tone and texture, hairstyle, lighting, camera angle, and background. The result must look like the SAME person, naturally younger and rested for their age: fully healed, no scars, no tightness, no wind-swept or pulled look. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "midface_lift",
        label: "Midface lift",
        hint: "Sagging of the cheeks and midface",
        min: 0,
        max: 100,
        posPhrase:
          "lift the sagging midface and restore a more youthful cheek position",
        negLabel: "As is",
        posLabel: "Lifted",
      },
      {
        key: "jowl_reduction",
        label: "Jowls",
        hint: "Sagging along the jawline",
        min: 0,
        max: 100,
        posPhrase:
          "eliminate the jowls and restore a clean, defined jawline",
        negLabel: "As is",
        posLabel: "Cleaned",
      },
      {
        key: "neck_tighten",
        label: "Neck lift",
        hint: "Loose neck skin and the jaw-neck angle",
        min: 0,
        max: 100,
        posPhrase:
          "tighten loose neck skin and define the angle between the jaw and neck",
        negLabel: "As is",
        posLabel: "Tightened",
      },
      {
        key: "nasolabial_lift",
        label: "Nasolabial folds",
        hint: "Deep folds from nose to mouth",
        min: 0,
        max: 100,
        posPhrase:
          "soften deep nasolabial folds by repositioning the cheek tissue",
        negLabel: "As is",
        posLabel: "Softened",
      },
      {
        key: "marionette_lift",
        label: "Lower-face droop",
        hint: "Marionette lines and downturned lower face",
        min: 0,
        max: 100,
        posPhrase:
          "lift the marionette lines and the downturned lower face",
        negLabel: "As is",
        posLabel: "Lifted",
      },
      {
        key: "overall_rejuvenation",
        label: "Overall rejuvenation",
        hint: "General youthful, rested appearance",
        min: 0,
        max: 100,
        posPhrase:
          "produce an overall younger, rested and naturally lifted appearance appropriate to the person's age",
        negLabel: "As is",
        posLabel: "Rejuvenated",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & assessment",
        detail:
          "Assess skin laxity, SMAS, neck bands and hairline. Front + profile photos; agree the target from the AI visualization.",
        offset_days: 7,
      },
      {
        kind: "milestone",
        label: "Pre-op assessment & bloodwork",
        detail:
          "CBC, coagulation profile, anesthesia fitness. Stop smoking and blood thinners as directed.",
        offset_days: 21,
      },
      {
        kind: "milestone",
        label: "Surgery performed",
        detail:
          "SMAS facelift with neck lift under general anesthesia or deep sedation. Drains and dressing applied.",
        offset_days: 28,
      },
      {
        kind: "milestone",
        label: "Dressing & suture review (~1 week)",
        detail: "Remove dressing/drains and sutures in stages; review healing.",
        offset_days: 35,
      },
      {
        kind: "followup",
        label: "Follow-up (3 weeks): photo capture",
        detail: "Bruising and swelling settling. Capture photos.",
        offset_days: 49,
      },
      {
        kind: "followup",
        label: "Result review (3 months): before/after photo",
        detail: "Final settled result. Compare with the AI visualization; capture the result set.",
        offset_days: 118,
      },
      {
        kind: "medicine",
        label: "Post-op medication",
        detail:
          "Antibiotic and analgesia course per clinician. Sleep head-elevated; wear the compression garment as directed.",
      },
      {
        kind: "medicine",
        label: "Recovery guidance",
        detail:
          "No strenuous activity for 3-4 weeks. Protect scars from sun for 6-12 months; no smoking during healing.",
      },
    ],
  },

  // =====================================================================
  // BUCCAL FAT REMOVAL (surgical) — AI pass only.
  // =====================================================================
  {
    id: "buccal_fat",
    name: "Buccal Fat Removal",
    category: "surgical",
    region: "cheeks",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the lower cheeks in this photograph to visualize the result of buccal fat pad removal, as it would look fully healed. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity and all other facial features, eyes, nose, lips, skin tone and texture, hairstyle, lighting, camera angle, and background. The result must look like the SAME person with a slightly slimmer, more sculpted lower cheek: fully healed, no scars, natural and never gaunt or hollowed. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "buccal_reduction",
        label: "Lower-cheek slimming",
        hint: "Fullness of the lower cheek / buccal fat pad",
        min: 0,
        max: 100,
        posPhrase:
          "reduce the buccal fat pad to create a slimmer lower cheek with a subtle hollow beneath the cheekbone",
        negLabel: "As is",
        posLabel: "Slimmer",
      },
      {
        key: "cheekbone_definition",
        label: "Cheekbone shadow",
        hint: "Definition and shadow under the cheekbone",
        min: 0,
        max: 100,
        posPhrase:
          "enhance the definition and natural shadow beneath the cheekbone",
        negLabel: "As is",
        posLabel: "Defined",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & assessment",
        detail:
          "Assess facial fullness and rule out patients who would look gaunt with age. Photos captured; agree the target from the AI visualization.",
        offset_days: 7,
      },
      {
        kind: "milestone",
        label: "Pre-op screening",
        detail: "Medical history, medications, bloodwork as indicated.",
        offset_days: 14,
      },
      {
        kind: "milestone",
        label: "Procedure performed",
        detail:
          "Small intraoral incisions; buccal fat pads teased out and trimmed under local anesthesia. No external scars.",
        offset_days: 21,
      },
      {
        kind: "followup",
        label: "Follow-up (2 weeks): photo capture",
        detail: "Swelling settling. Capture photos.",
        offset_days: 35,
      },
      {
        kind: "followup",
        label: "Result review (3 months): before/after photo",
        detail: "Final settled result. Compare with the AI visualization; capture the result set.",
        offset_days: 111,
      },
      {
        kind: "medicine",
        label: "Mouth care & analgesia",
        detail:
          "Chlorhexidine mouthwash and a soft diet for 1-2 weeks. Paracetamol/ibuprofen as directed.",
      },
    ],
  },

  // =====================================================================
  // FACIAL FAT TRANSFER (surgical, autologous fat grafting) — AI pass only.
  // =====================================================================
  {
    id: "fat_transfer",
    name: "Facial Fat Transfer",
    category: "surgical",
    region: "cheeks",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the described areas of the face in this photograph to visualize the result of facial fat transfer (autologous fat grafting), as it would look fully healed and settled. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity and all other facial features, eyes, nose, lips, skin tone and texture, hairstyle, lighting, camera angle, and background. The result must look like the SAME person with softly restored facial volume: fully healed, natural, never overfilled or lumpy. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "ft_cheek_volume",
        label: "Cheek volume",
        hint: "Grafted volume to the cheeks",
        min: 0,
        max: 100,
        posPhrase:
          "restore natural volume to the cheeks with grafted fat for a softer, fuller midface",
        negLabel: "As is",
        posLabel: "Fuller",
      },
      {
        key: "ft_temple_volume",
        label: "Temple volume",
        hint: "Grafted volume to hollow temples",
        min: 0,
        max: 100,
        posPhrase: "restore volume to hollow temples for a smoother upper-face curve",
        negLabel: "As is",
        posLabel: "Fuller",
      },
      {
        key: "ft_undereye",
        label: "Under-eye volume",
        hint: "Micro-fat grafting to the under-eye hollows",
        min: 0,
        max: 100,
        posPhrase: "soften the under-eye hollows with fine micro-fat grafting",
        negLabel: "As is",
        posLabel: "Softened",
      },
      {
        key: "ft_overall",
        label: "Overall volume",
        hint: "General youthful volume distribution",
        min: 0,
        max: 100,
        posPhrase:
          "restore a soft, youthful facial volume distribution across the treated areas",
        negLabel: "As is",
        posLabel: "Restored",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & assessment",
        detail:
          "Map deflated areas and identify a donor site (abdomen/flanks/thighs). Photos captured; agree the target from the AI visualization.",
        offset_days: 7,
      },
      {
        kind: "milestone",
        label: "Pre-op screening",
        detail: "Medical history, medications, bloodwork as indicated.",
        offset_days: 14,
      },
      {
        kind: "milestone",
        label: "Procedure performed",
        detail:
          "Fat harvested by gentle liposuction, purified, and micro-grafted to the face under local anesthesia with sedation. Slight over-correction to allow for resorption.",
        offset_days: 21,
      },
      {
        kind: "followup",
        label: "Follow-up (2 weeks): photo capture",
        detail: "Early swelling settling at face and donor site. Capture photos.",
        offset_days: 35,
      },
      {
        kind: "followup",
        label: "Result review (3 months): before/after photo",
        detail:
          "Graft take stabilised (about 50-70% retained). Compare with the AI visualization; capture the result set.",
        offset_days: 111,
      },
      {
        kind: "medicine",
        label: "Aftercare",
        detail:
          "Do not massage or apply pressure to grafted areas. Wear the donor-site compression garment as directed; analgesia per clinician.",
      },
    ],
  },

  // =====================================================================
  // LASER RESURFACING (skin) — AI pass only.
  // =====================================================================
  {
    id: "laser_resurfacing",
    name: "Laser Resurfacing",
    category: "skin",
    region: "skin",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the skin surface in this photograph to visualize the result of fractional laser skin resurfacing, once fully healed. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity, facial features, proportions, eyes, nose, lips, hairstyle, lighting, camera angle, and background. Critically, keep natural, realistic skin with visible pores and normal texture; improve the skin's quality without plastic over-smoothing or airbrushing, and do not change the shape of any feature. The result must look like the SAME person with fresher, healthier skin. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "resurf_lines",
        label: "Fine lines",
        hint: "Fine surface wrinkles and creping",
        min: 0,
        max: 100,
        posPhrase:
          "soften fine surface lines and creping as the resurfaced skin smooths",
        negLabel: "As is",
        posLabel: "Smoothed",
      },
      {
        key: "resurf_pores",
        label: "Pores & texture",
        hint: "Enlarged pores and rough texture",
        min: 0,
        max: 100,
        posPhrase: "refine enlarged pores and improve overall skin texture",
        negLabel: "As is",
        posLabel: "Refined",
      },
      {
        key: "resurf_tone",
        label: "Tone & redness",
        hint: "Blotchy tone and diffuse redness",
        min: 0,
        max: 100,
        posPhrase: "even out blotchy skin tone and reduce diffuse redness",
        negLabel: "As is",
        posLabel: "Even",
      },
      {
        key: "resurf_texture",
        label: "Shallow scars",
        hint: "Shallow scars and surface irregularity",
        min: 0,
        max: 100,
        posPhrase: "smooth shallow scars and irregular surface texture",
        negLabel: "As is",
        posLabel: "Smoothed",
      },
      {
        key: "resurf_glow",
        label: "Radiance",
        hint: "Overall freshness and glow",
        min: 0,
        max: 100,
        posPhrase: "reveal fresh, radiant, healthy-looking skin",
        negLabel: "As is",
        posLabel: "Radiant",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & skin assessment",
        detail:
          "Fitzpatrick typing, concern mapping and a test patch. Photos captured; agree the target from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Pre-treatment prep",
        detail:
          "Priming skincare (e.g. sunscreen, retinoid/tyrosinase inhibitor as advised) and antiviral cover if cold-sore history.",
        offset_days: 3,
      },
      {
        kind: "milestone",
        label: "Resurfacing session",
        detail:
          "Fractional laser pass under topical numbing. Expect 3-7 days of redness and flaking depending on depth.",
        offset_days: 10,
      },
      {
        kind: "followup",
        label: "Healing check (1 week)",
        detail: "Review re-epithelialisation and aftercare.",
        offset_days: 17,
      },
      {
        kind: "followup",
        label: "Result review (6-8 weeks): photo capture",
        detail: "Collagen remodelling visible. Capture photos and compare with the visualization.",
        offset_days: 60,
      },
      {
        kind: "medicine",
        label: "Aftercare & sun protection",
        detail:
          "Bland emollient and strict SPF 50 daily. No active ingredients (retinoids, acids) or picking until healed; avoid sun and heat.",
      },
    ],
  },

  // =====================================================================
  // CHEMICAL PEEL (skin) — AI pass only.
  // =====================================================================
  {
    id: "chemical_peel",
    name: "Chemical Peel",
    category: "skin",
    region: "skin",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the skin surface in this photograph to visualize the result of a chemical peel, once fully healed. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity, facial features, proportions, eyes, nose, lips, hairstyle, lighting, camera angle, and background. Keep natural, realistic skin with visible pores and normal texture; brighten and even the complexion without plastic over-smoothing, and do not change the shape of any feature. The result must look like the SAME person with a fresher, clearer complexion. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "peel_tone",
        label: "Tone & dullness",
        hint: "Dull, sun-damaged surface layers",
        min: 0,
        max: 100,
        posPhrase: "even out skin tone and lift dull, sun-damaged surface layers",
        negLabel: "As is",
        posLabel: "Brighter",
      },
      {
        key: "peel_pigment",
        label: "Pigmentation",
        hint: "Superficial sun spots and patchy pigment",
        min: 0,
        max: 100,
        posPhrase: "lighten superficial pigmentation and sun spots",
        negLabel: "As is",
        posLabel: "Lightened",
      },
      {
        key: "peel_texture",
        label: "Texture",
        hint: "Rough or flaky surface texture",
        min: 0,
        max: 100,
        posPhrase: "smooth rough surface texture for a fresh, renewed complexion",
        negLabel: "As is",
        posLabel: "Smoothed",
      },
      {
        key: "peel_glow",
        label: "Radiance",
        hint: "Overall brightness and glow",
        min: 0,
        max: 100,
        posPhrase: "reveal brighter, more radiant skin",
        negLabel: "As is",
        posLabel: "Radiant",
      },
      {
        key: "peel_acne",
        label: "Breakouts",
        hint: "Active surface breakouts and congestion",
        min: 0,
        max: 100,
        posPhrase: "clear active surface breakouts and congestion",
        negLabel: "As is",
        posLabel: "Clearer",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & skin assessment",
        detail:
          "Fitzpatrick typing and concern mapping; choose peel depth. Photos captured; agree the target from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Peel session",
        detail:
          "Superficial-to-medium peel applied and neutralised. Light flaking for several days is expected.",
        offset_days: 7,
      },
      {
        kind: "milestone",
        label: "Course (optional): sessions 2-4",
        detail:
          "Superficial peels are usually a course every 2-4 weeks for a cumulative result.",
        offset_days: 28,
      },
      {
        kind: "followup",
        label: "Result review: photo capture",
        detail: "Capture photos and compare with the visualization.",
        offset_days: 42,
      },
      {
        kind: "medicine",
        label: "Aftercare & sun protection",
        detail:
          "Bland moisturiser and strict SPF 50. Do not pick or peel flaking skin; pause retinoids/acids for a week.",
      },
    ],
  },

  // =====================================================================
  // MICRONEEDLING RF (skin) — AI pass only.
  // =====================================================================
  {
    id: "microneedling_rf",
    name: "Microneedling RF",
    category: "skin",
    region: "skin",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the skin surface in this photograph to visualize the cumulative result of radio-frequency microneedling, once healed. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity, facial features, proportions, eyes, nose, lips, hairstyle, lighting, camera angle, and background. Keep natural, realistic skin with visible pores and normal texture; refine skin quality without plastic over-smoothing, and do not change the shape of any feature. The result must look like the SAME person with tighter, smoother, healthier skin. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "mn_texture",
        label: "Texture & pores",
        hint: "Rough texture and enlarged pores",
        min: 0,
        max: 100,
        posPhrase: "refine skin texture and minimise the appearance of enlarged pores",
        negLabel: "As is",
        posLabel: "Refined",
      },
      {
        key: "mn_scars",
        label: "Acne scarring",
        hint: "Shallow, depressed acne scars",
        min: 0,
        max: 100,
        posPhrase: "soften atrophic acne scars for smoother-looking skin",
        negLabel: "As is",
        posLabel: "Smoothed",
      },
      {
        key: "mn_firmness",
        label: "Firmness",
        hint: "Skin laxity and crepiness",
        min: 0,
        max: 100,
        posPhrase:
          "improve skin firmness with a subtle tightening from collagen stimulation",
        negLabel: "As is",
        posLabel: "Firmer",
      },
      {
        key: "mn_tone",
        label: "Tone & clarity",
        hint: "Overall evenness of the complexion",
        min: 0,
        max: 100,
        posPhrase: "even out skin tone and improve overall clarity",
        negLabel: "As is",
        posLabel: "Even",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & skin assessment",
        detail:
          "Assess texture, scarring and laxity. Photos captured; agree the target from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Treatment session 1",
        detail:
          "RF microneedling under topical numbing. Mild redness for 1-2 days.",
        offset_days: 7,
      },
      {
        kind: "milestone",
        label: "Course: sessions 2-3",
        detail: "Usually a course of 3 sessions spaced 4 weeks apart.",
        offset_days: 35,
      },
      {
        kind: "followup",
        label: "Result review (3 months): photo capture",
        detail:
          "Collagen remodelling matures over 8-12 weeks. Capture photos and compare with the visualization.",
        offset_days: 100,
      },
      {
        kind: "medicine",
        label: "Aftercare & sun protection",
        detail:
          "Gentle cleanser, hydrating serum and SPF 50. Pause actives for 3-5 days; avoid heat and makeup for 24h.",
      },
    ],
  },

  // =====================================================================
  // HYDRAFACIAL GLOW (skin) — AI pass only.
  // =====================================================================
  {
    id: "hydrafacial",
    name: "HydraFacial Glow",
    category: "skin",
    region: "skin",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the skin surface in this photograph to visualize the immediate result of a hydradermabrasion "glow" facial. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity, facial features, proportions, eyes, nose, lips, hairstyle, lighting, camera angle, and background. Keep natural, realistic skin with visible pores and normal texture; add a healthy, hydrated glow without plastic over-smoothing, and do not change the shape of any feature. The result must look like the SAME person with fresh, dewy, clean skin. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "hf_hydration",
        label: "Hydration",
        hint: "Plumpness and dewiness of the skin",
        min: 0,
        max: 100,
        posPhrase: "deeply hydrate the skin for a plump, dewy, healthy glow",
        negLabel: "As is",
        posLabel: "Dewy",
      },
      {
        key: "hf_clarity",
        label: "Clarity",
        hint: "Congestion and visible pores",
        min: 0,
        max: 100,
        posPhrase: "clear surface congestion and refine the appearance of pores",
        negLabel: "As is",
        posLabel: "Clearer",
      },
      {
        key: "hf_radiance",
        label: "Radiance",
        hint: "Overall luminosity",
        min: 0,
        max: 100,
        posPhrase: "boost radiance for a luminous, freshly-treated complexion",
        negLabel: "As is",
        posLabel: "Radiant",
      },
      {
        key: "hf_tone",
        label: "Tone",
        hint: "Dullness and subtle redness",
        min: 0,
        max: 100,
        posPhrase: "even out dullness and subtle redness for a refreshed look",
        negLabel: "As is",
        posLabel: "Even",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & skin check",
        detail:
          "Quick skin-quality assessment and goals. Photos captured; agree the target from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Glow session",
        detail:
          "Cleanse, gentle exfoliation, extraction and hydrating serum infusion. No downtime; immediate glow.",
        offset_days: 0,
      },
      {
        kind: "followup",
        label: "Maintenance reminder",
        detail:
          "Best kept up monthly, or booked a few days before an event for peak glow.",
        offset_days: 28,
      },
      {
        kind: "medicine",
        label: "Aftercare",
        detail:
          "Daily SPF and a simple hydrating routine. Skip strong actives for 24h for the freshest result.",
      },
    ],
  },

  // =====================================================================
  // PIGMENTATION / MELASMA (skin) — AI pass only.
  // =====================================================================
  {
    id: "pigmentation",
    name: "Pigmentation / Melasma",
    category: "skin",
    region: "skin",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the skin surface in this photograph to visualize the result of a pigmentation and melasma treatment programme, once settled. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity, facial features, proportions, eyes, nose, lips, hairstyle, lighting, camera angle, and background. Keep natural, realistic skin with visible pores and normal texture; even the complexion without lightening the person's overall skin colour or bleaching, and do not change the shape of any feature. The result must look like the SAME person with clearer, more even skin. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "pig_melasma",
        label: "Melasma patches",
        hint: "Blotchy brown patches, often on the cheeks and forehead",
        min: 0,
        max: 100,
        posPhrase:
          "fade melasma patches and blotchy pigmentation toward a more even complexion",
        negLabel: "As is",
        posLabel: "Faded",
      },
      {
        key: "pig_sunspots",
        label: "Sun spots",
        hint: "Sun spots, freckles and age spots",
        min: 0,
        max: 100,
        posPhrase: "lighten sun spots, freckles and age spots",
        negLabel: "As is",
        posLabel: "Lightened",
      },
      {
        key: "pig_pih",
        label: "Dark marks (PIH)",
        hint: "Post-inflammatory marks left by spots",
        min: 0,
        max: 100,
        posPhrase:
          "reduce post-inflammatory hyperpigmentation and leftover dark marks",
        negLabel: "As is",
        posLabel: "Reduced",
      },
      {
        key: "pig_redness",
        label: "Redness",
        hint: "Diffuse redness and broken capillaries",
        min: 0,
        max: 100,
        posPhrase: "calm diffuse facial redness and the look of broken capillaries",
        negLabel: "As is",
        posLabel: "Calmer",
      },
      {
        key: "pig_tone",
        label: "Overall tone",
        hint: "General evenness and clarity",
        min: 0,
        max: 100,
        posPhrase: "unify overall skin tone and clarity",
        negLabel: "As is",
        posLabel: "Even",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & pigment assessment",
        detail:
          "Wood's-lamp/typing, identify triggers (sun, hormones, heat). Photos captured; agree the target from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Topical programme started",
        detail:
          "Prescription regimen (e.g. tyrosinase inhibitors) with strict daily SPF; the foundation of any pigment result.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "In-clinic treatments",
        detail:
          "Gentle peels or a low-energy pigment laser as suited to the skin type; conservative in melasma to avoid rebound.",
        offset_days: 14,
      },
      {
        kind: "followup",
        label: "Review (6 weeks): photo capture",
        detail: "Assess response and tolerance. Capture photos and compare with the visualization.",
        offset_days: 45,
      },
      {
        kind: "followup",
        label: "Result review (12 weeks): photo capture",
        detail: "Cumulative fading visible. Capture the result set.",
        offset_days: 90,
      },
      {
        kind: "medicine",
        label: "Daily sun protection (non-negotiable)",
        detail:
          "Broad-spectrum SPF 50 every morning, reapplied; add a tinted (iron-oxide) sunscreen for melasma. Sun undoes the result.",
      },
    ],
  },

  // =====================================================================
  // ACNE SCAR REVISION (skin) — AI pass only.
  // =====================================================================
  {
    id: "acne_scar",
    name: "Acne Scar Revision",
    category: "skin",
    region: "skin",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the skin surface in this photograph to visualize the result of an acne-scar revision programme, once healed. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity, facial features, proportions, eyes, nose, lips, hairstyle, lighting, camera angle, and background. Keep natural, realistic skin with visible pores and normal texture; improve the scars realistically (they are softened and shallower, not perfectly erased) without plastic over-smoothing, and do not change the shape of any feature. The result must look like the SAME person with noticeably smoother skin. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "as_rolling",
        label: "Rolling scars",
        hint: "Broad, sloping depressions in the skin",
        min: 0,
        max: 100,
        posPhrase: "smooth rolling acne scars and the undulating surface",
        negLabel: "As is",
        posLabel: "Smoothed",
      },
      {
        key: "as_boxcar",
        label: "Boxcar scars",
        hint: "Sharp-edged, box-like depressions",
        min: 0,
        max: 100,
        posPhrase: "soften the sharp edges of boxcar scars",
        negLabel: "As is",
        posLabel: "Softened",
      },
      {
        key: "as_icepick",
        label: "Icepick scars",
        hint: "Small, deep pitted scars",
        min: 0,
        max: 100,
        posPhrase: "reduce the appearance of deep, pitted icepick scars",
        negLabel: "As is",
        posLabel: "Reduced",
      },
      {
        key: "as_pih",
        label: "Scar marks",
        hint: "Red-brown discolouration from old spots",
        min: 0,
        max: 100,
        posPhrase: "fade the red-brown marks left by old breakouts",
        negLabel: "As is",
        posLabel: "Faded",
      },
      {
        key: "as_texture",
        label: "Overall texture",
        hint: "General smoothness and evenness",
        min: 0,
        max: 100,
        posPhrase: "restore smoother, more even overall skin texture",
        negLabel: "As is",
        posLabel: "Smoother",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & scar mapping",
        detail:
          "Classify scar types (rolling, boxcar, icepick) and plan a combination approach. Photos captured; agree the target from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Treatment session 1",
        detail:
          "Combination of subcision, RF microneedling, TCA CROSS or fractional laser as indicated by scar type.",
        offset_days: 7,
      },
      {
        kind: "milestone",
        label: "Course: sessions 2-4",
        detail: "Scar revision is staged, typically 4-6 weeks apart over several months.",
        offset_days: 42,
      },
      {
        kind: "followup",
        label: "Result review (4-6 months): photo capture",
        detail:
          "Cumulative remodelling assessed. Capture photos and compare with the visualization.",
        offset_days: 150,
      },
      {
        kind: "medicine",
        label: "Aftercare & sun protection",
        detail:
          "Gentle healing routine and strict SPF 50 between sessions. Keep active acne controlled; pause actives around each session.",
      },
    ],
  },

  // =====================================================================
  // LASER HAIR REMOVAL (skin, facial hair) — AI pass only.
  // =====================================================================
  {
    id: "laser_hair_removal",
    name: "Laser Hair Removal",
    category: "skin",
    region: "skin",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the described areas of facial hair in this photograph to visualize the result of a course of laser hair removal, once complete. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity, facial features, proportions, eyes, nose, lips, skin tone and texture, hairstyle, lighting, camera angle, and background. Reduce only the unwanted hair described; do not lighten the skin or change any feature shape. The result must look like the SAME person with cleaner, smoother skin in the treated area. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "lhr_upper_lip",
        label: "Upper lip",
        hint: "Unwanted upper-lip hair",
        min: 0,
        max: 100,
        posPhrase: "reduce and clear unwanted upper-lip hair",
        negLabel: "As is",
        posLabel: "Cleared",
      },
      {
        key: "lhr_chin",
        label: "Chin & jaw",
        hint: "Unwanted hair on the chin and jaw",
        min: 0,
        max: 100,
        posPhrase: "reduce unwanted hair on the chin and jaw",
        negLabel: "As is",
        posLabel: "Cleared",
      },
      {
        key: "lhr_cheeks",
        label: "Cheeks / sideburns",
        hint: "Unwanted hair on the cheeks and sideburn area",
        min: 0,
        max: 100,
        posPhrase: "reduce unwanted hair on the cheeks and sideburn area",
        negLabel: "As is",
        posLabel: "Cleared",
      },
      {
        key: "lhr_beard_shape",
        label: "Beard-line shaping",
        hint: "Cleaning and sharpening the beard outline",
        min: 0,
        max: 100,
        posPhrase: "clean and sharpen the beard outline for a groomed look",
        negLabel: "As is",
        posLabel: "Sharper",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & patch test",
        detail:
          "Skin typing and a test patch 24-48h before, to set safe settings. Photos captured; agree the target from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Treatment session 1",
        detail:
          "Laser pass over the area; hair should be shaved (not plucked/waxed) beforehand.",
        offset_days: 2,
      },
      {
        kind: "milestone",
        label: "Course: sessions 2-6",
        detail:
          "A course of 6-8 sessions every 4-6 weeks catches hairs in their growth phase.",
        offset_days: 30,
      },
      {
        kind: "followup",
        label: "Result review: photo capture",
        detail: "Assess reduction after the course. Capture photos and compare with the visualization.",
        offset_days: 180,
      },
      {
        kind: "medicine",
        label: "Aftercare & sun protection",
        detail:
          "Avoid sun, saunas and hot baths for 48h; apply SPF 50 daily. No plucking or waxing between sessions (shaving only).",
      },
    ],
  },

  // =====================================================================
  // SKIN TIGHTENING (skin, HIFU / RF) — AI pass only.
  // =====================================================================
  {
    id: "skin_tightening",
    name: "Skin Tightening (HIFU)",
    category: "skin",
    region: "jaw",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY skin firmness and contour in this photograph to visualize the result of a non-surgical skin-tightening treatment (HIFU / RF), a few months on. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity, all facial features and their shapes, eyes, nose, lips, skin tone and texture with visible pores, hairstyle, lighting, camera angle, and background. Do not change facial volume or feature shapes; only firm and subtly lift lax skin. The result must look like the SAME person, subtly tighter and more lifted, natural and believable. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "st_jaw_tighten",
        label: "Jawline tightening",
        hint: "Lax skin and early jowls along the jaw",
        min: 0,
        max: 100,
        posPhrase:
          "tighten and lift lax skin along the jawline and lower face",
        negLabel: "As is",
        posLabel: "Tightened",
      },
      {
        key: "st_neck_tighten",
        label: "Neck tightening",
        hint: "Crepey neck skin and the jaw-neck angle",
        min: 0,
        max: 100,
        posPhrase:
          "tighten crepey neck skin and better define the angle between the jaw and neck",
        negLabel: "As is",
        posLabel: "Tightened",
      },
      {
        key: "st_brow",
        label: "Brow lift",
        hint: "A subtle non-surgical lift of the brow",
        min: 0,
        max: 100,
        posPhrase: "create a subtle non-surgical lift of the brow and upper face",
        negLabel: "As is",
        posLabel: "Lifted",
      },
      {
        key: "st_cheek_firm",
        label: "Cheek firmness",
        hint: "Softening cheek laxity",
        min: 0,
        max: 100,
        posPhrase: "firm and subtly lift the cheeks",
        negLabel: "As is",
        posLabel: "Firmer",
      },
      {
        key: "st_overall",
        label: "Overall firmness",
        hint: "General skin firmness and lift",
        min: 0,
        max: 100,
        posPhrase:
          "improve overall skin firmness for a tightened, gently lifted contour",
        negLabel: "As is",
        posLabel: "Firmer",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & suitability",
        detail:
          "Assess degree of laxity (best for mild-to-moderate); set realistic expectations. Photos captured; agree the target from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Treatment session",
        detail:
          "HIFU/RF energy delivered to the SMAS/dermal layers. Little to no downtime; mild tenderness.",
        offset_days: 7,
      },
      {
        kind: "followup",
        label: "Early review (6 weeks): photo capture",
        detail: "Initial tightening visible. Capture photos.",
        offset_days: 49,
      },
      {
        kind: "followup",
        label: "Result review (3 months): photo capture",
        detail:
          "Peak collagen tightening at 2-3 months. Capture photos and compare with the visualization.",
        offset_days: 97,
      },
      {
        kind: "medicine",
        label: "Aftercare",
        detail:
          "Daily SPF and hydration. Effect builds gradually; a maintenance session at 12-18 months is typical.",
      },
    ],
  },

  // =====================================================================
  // PDO THREAD LIFT (other, minimally-invasive lifting) — AI pass only.
  // =====================================================================
  {
    id: "thread_lift",
    name: "PDO Thread Lift",
    category: "other",
    region: "jaw",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the lower face, cheeks and jawline in this photograph to visualize the result of a PDO thread lift, once settled. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity and all other facial features, eyes, nose, lips, skin tone and texture, hairstyle, lighting, camera angle, and background. The result must look like the SAME person, subtly lifted and refreshed: healed, natural, never pulled, dimpled or overtightened. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "thread_cheek_lift",
        label: "Cheek / midface lift",
        hint: "Sagging cheeks and midface",
        min: 0,
        max: 100,
        posPhrase:
          "lift the sagging cheeks and midface with a subtle repositioning",
        negLabel: "As is",
        posLabel: "Lifted",
      },
      {
        key: "thread_jowl",
        label: "Jowl lift",
        hint: "Early jowls along the jawline",
        min: 0,
        max: 100,
        posPhrase: "lift early jowls and redefine the jawline",
        negLabel: "As is",
        posLabel: "Lifted",
      },
      {
        key: "thread_brow",
        label: "Brow / temple lift",
        hint: "A subtle lateral brow and temple lift",
        min: 0,
        max: 100,
        posPhrase: "create a subtle lateral brow and temple lift",
        negLabel: "As is",
        posLabel: "Lifted",
      },
      {
        key: "thread_neck",
        label: "Upper-neck lift",
        hint: "Laxity of the upper neck",
        min: 0,
        max: 100,
        posPhrase: "lift and tighten the upper neck",
        negLabel: "As is",
        posLabel: "Lifted",
      },
      {
        key: "thread_nasolabial",
        label: "Nasolabial softening",
        hint: "Folds from nose to mouth",
        min: 0,
        max: 100,
        posPhrase: "soften the nasolabial folds by repositioning cheek tissue",
        negLabel: "As is",
        posLabel: "Softened",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & assessment",
        detail:
          "Assess laxity and vectors; thread lift suits mild-to-moderate sagging. Photos captured; agree the target from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Medical screening",
        detail: "Allergies, blood thinners, active infection, pregnancy/breastfeeding.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Thread placement session",
        detail:
          "Barbed PDO threads inserted via cannula under local anesthesia and lifted along the planned vectors. About 30-45 minutes.",
        offset_days: 7,
      },
      {
        kind: "followup",
        label: "2-week review: photo capture",
        detail: "Settling check for dimpling or asymmetry. Capture photos and compare with the visualization.",
        offset_days: 21,
      },
      {
        kind: "followup",
        label: "Maintenance reminder",
        detail: "Thread-lift effect typically lasts 12-18 months. Book a review.",
        offset_days: 380,
      },
      {
        kind: "medicine",
        label: "Aftercare (first 2 weeks)",
        detail:
          "Sleep face-up, avoid wide mouth opening, facials and dental work, and no strenuous exercise for 2 weeks. Analgesia as needed.",
      },
    ],
  },

  // =====================================================================
  // PRP HAIR RESTORATION (hair) — AI pass only; the transplant density /
  // hairline fields are owned by the hair-transplant template.
  // =====================================================================
  {
    id: "prp_hair",
    name: "PRP Hair Restoration",
    category: "hair",
    region: "hairline",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the hair and scalp in this photograph to visualize the result of a course of PRP (platelet-rich plasma) hair treatment, about 4-6 months in. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity, face and all facial features, skin tone and texture, expression, lighting, camera angle, framing, clothing and background. Use the person's own natural hair colour and texture; do not add a transplanted hairline, only strengthen and thicken existing hair. The result must be unmistakably the SAME person with fuller, healthier hair. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "prp_density",
        label: "Overall density",
        hint: "Fullness and thickness of existing hair",
        min: 0,
        max: 100,
        posPhrase:
          "increase overall hair density and thickness from PRP-stimulated regrowth",
        negLabel: "As is",
        posLabel: "Denser",
      },
      {
        key: "prp_thinning",
        label: "Thinning areas",
        hint: "Visible scalp along the part and crown",
        min: 0,
        max: 100,
        posPhrase:
          "reduce visible scalp show in thinning areas along the part and crown",
        negLabel: "As is",
        posLabel: "Fuller",
      },
      {
        key: "prp_hairline",
        label: "Hairline reinforcement",
        hint: "Strengthening a softly thinning hairline (no grafts)",
        min: 0,
        max: 100,
        posPhrase:
          "strengthen and slightly reinforce a softly thinning hairline, without any transplanted grafts",
        negLabel: "As is",
        posLabel: "Stronger",
      },
      {
        key: "prp_shedding",
        label: "Shedding control",
        hint: "Excess shedding and breakage",
        min: 0,
        max: 100,
        posPhrase: "reduce shedding for thicker, healthier-looking hair",
        negLabel: "As is",
        posLabel: "Reduced",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Consultation & scalp assessment",
        detail:
          "Trichoscopy, Norwood/Ludwig staging and shedding history; PRP suits early-to-moderate thinning. Photos captured; agree the target from the AI visualization.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Medical screening",
        detail:
          "Blood disorders, anticoagulants, active scalp infection; baseline bloods if indicated.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Treatment sessions 1-3",
        detail:
          "Blood drawn, spun, and PRP injected into the scalp. An induction course is usually monthly for 3 sessions.",
        offset_days: 7,
      },
      {
        kind: "followup",
        label: "Review (4 months): photo capture",
        detail:
          "Reduced shedding and early thickening. Capture photos and compare with the visualization.",
        offset_days: 120,
      },
      {
        kind: "followup",
        label: "Maintenance reminder",
        detail: "Top-up sessions every 4-6 months maintain the result. Book a review.",
        offset_days: 180,
      },
      {
        kind: "medicine",
        label: "Adjunct therapy",
        detail:
          "Topical minoxidil and/or finasteride per clinician to support the PRP result. Avoid harsh styling for 24h after each session.",
      },
    ],
  },

  // =====================================================================
  // CAPTURE signature treatments — ids match lib/capture/kb.ts, so the
  // clinic menu, POS catalogue, VYBERO bookings and the consultation flow
  // all speak the same six ids. Texture-first: canvas_handles stay empty
  // (nothing geometric moves) and the AI pass is the reveal.
  // =====================================================================
  {
    id: "mito-regenerative-glow",
    name: "MitoRedLight Regenerative Glow",
    category: "skin",
    region: "skin",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the skin in this photograph to visualize the cumulative result of a course of professional red light and near-infrared therapy facials. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity, facial features, proportions, eyes, nose, lips, hairstyle, lighting, camera angle, and background. Keep natural, realistic skin with visible pores; the change is a healthy, lit-from-within radiance and calmer, more even skin — never plastic smoothing, never reshaping. The result must look like the SAME person after excellent treatment. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "rgl_radiance",
        label: "Radiance",
        hint: "The lit-from-within glow red light is known for",
        min: 0,
        max: 100,
        posPhrase: "add a healthy, luminous, lit-from-within radiance to the skin",
        negLabel: "As is",
        posLabel: "Radiant",
      },
      {
        key: "rgl_tone",
        label: "Tone evenness",
        hint: "Dullness, patchiness and mild redness",
        min: 0,
        max: 100,
        posPhrase: "even out dullness, patchiness and mild redness across the face",
        negLabel: "As is",
        posLabel: "Even",
      },
      {
        key: "rgl_texture",
        label: "Texture refinement",
        hint: "Fine surface texture, kept natural",
        min: 0,
        max: 100,
        posPhrase: "gently refine fine surface texture while keeping pores and natural skin detail",
        negLabel: "As is",
        posLabel: "Refined",
      },
      {
        key: "rgl_rested",
        label: "Rested look",
        hint: "The fresher, recovered look of consistent sessions",
        min: 0,
        max: 100,
        posPhrase: "make the skin look rested and recovered, reducing tired dullness around the eyes and cheeks",
        negLabel: "As is",
        posLabel: "Rested",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "MARK-VU intake scan",
        detail:
          "Baseline pigmentation, moisture and texture scores — the numbers this programme will move.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Session 1 of 6 · Regenerative Glow",
        detail:
          "Exomere facial of choice with full-body red light and near-infrared therapy (about 75 minutes).",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Mid-course MARK-VU rescan",
        detail: "After session 3: compare pigmentation and moisture against intake.",
        offset_days: 21,
      },
      {
        kind: "followup",
        label: "Course complete · results review",
        detail:
          "Session 6 review with before/after photographs under the same light. Agree the maintenance rhythm.",
        offset_days: 42,
      },
      {
        kind: "medicine",
        label: "Home care between sessions",
        detail:
          "Recovery Balm Plus SPF 35 daily; no exfoliants or actives for 48 hours after each session; hydrate well.",
      },
    ],
  },
  {
    id: "exomere-face-implant",
    name: "Exomere Face Implant Regimen",
    category: "skin",
    region: "skin",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the skin in this photograph to visualize the result of a course of needle-free SPICUS micro-channel skin renewal with exosome actives. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity, facial features, proportions, eyes, nose, lips, hairstyle, lighting, camera angle, and background. Keep realistic skin with natural pores; improvements are clarity, brightness and firmness — never plastic smoothing, never feature reshaping. The result must look like the SAME person with visibly renewed skin. Photorealistic, consistent lighting, no artifacts.`,
    slider_schema: [
      {
        key: "xfi_clarity",
        label: "Blemish clarity",
        hint: "Active blemishes and post-acne marks",
        min: 0,
        max: 100,
        posPhrase: "clear active blemishes and fade post-acne marks",
        negLabel: "As is",
        posLabel: "Clear",
      },
      {
        key: "xfi_brightness",
        label: "Brightness",
        hint: "Pigmentation and uneven tone",
        min: 0,
        max: 100,
        posPhrase: "brighten the complexion and soften pigmentation for a more uniform tone",
        negLabel: "As is",
        posLabel: "Bright",
      },
      {
        key: "xfi_pores",
        label: "Pore refinement",
        hint: "Visible pores and rough texture",
        min: 0,
        max: 100,
        posPhrase: "refine visible pores and smooth rough texture while keeping natural skin detail",
        negLabel: "As is",
        posLabel: "Refined",
      },
      {
        key: "xfi_firmness",
        label: "Firmness",
        hint: "Collagen-supported bounce and density",
        min: 0,
        max: 100,
        posPhrase: "make the skin look subtly firmer and denser, as after collagen-stimulating treatment",
        negLabel: "As is",
        posLabel: "Firm",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "MARK-VU intake scan",
        detail: "Baseline pores, pigmentation and texture scores on record.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Session 1 of 6 · Skin Implant",
        detail:
          "SPICUS micro-channel delivery of Exomere Halla exosomes with plant collagen (about 50 minutes). Mild tingling for 24–48h is normal.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Sessions every 2–3 weeks",
        detail: "Six sessions total; texture and brightness compound across the course.",
        offset_days: 14,
      },
      {
        kind: "followup",
        label: "Course review + rescan",
        detail: "MARK-VU rescan against intake; before/after photographs under the same light.",
        offset_days: 84,
      },
      {
        kind: "medicine",
        label: "Post care",
        detail:
          "No retinol, AHA/BHA or vitamin C for 72 hours after each session. Post Care Regimen (Ceramide Recell + Recovery Balm SPF) daily.",
      },
    ],
  },
  {
    id: "exomere-regeneration",
    name: "Exomere Regeneration Regimen",
    category: "skin",
    region: "skin",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the skin in this photograph to visualize the result of a deeply restorative barrier-repair facial course. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity, facial features, proportions, eyes, nose, lips, hairstyle, lighting, camera angle, and background. Keep realistic skin; the change is calm, hydrated, healthy-looking skin — reduced redness and dryness, a soft natural glow. Never plastic smoothing, never reshaping. The SAME person, restored. Photorealistic, no artifacts.`,
    slider_schema: [
      {
        key: "xrg_hydration",
        label: "Hydration",
        hint: "Dry, tight-looking skin",
        min: 0,
        max: 100,
        posPhrase: "deeply hydrate dry, tight-looking skin for a supple, comfortable finish",
        negLabel: "As is",
        posLabel: "Hydrated",
      },
      {
        key: "xrg_calm",
        label: "Calming",
        hint: "Redness, irritation and sensitivity",
        min: 0,
        max: 100,
        posPhrase: "calm visible redness and irritation for settled, comfortable skin",
        negLabel: "As is",
        posLabel: "Calm",
      },
      {
        key: "xrg_lines",
        label: "Fine lines",
        hint: "Dehydration lines soften as the barrier recovers",
        min: 0,
        max: 100,
        posPhrase: "soften fine dehydration lines as the skin plumps with moisture",
        negLabel: "As is",
        posLabel: "Softened",
      },
      {
        key: "xrg_glow",
        label: "Healthy glow",
        hint: "The quiet glow of a repaired barrier",
        min: 0,
        max: 100,
        posPhrase: "add the quiet, healthy glow of fully recovered skin",
        negLabel: "As is",
        posLabel: "Glowing",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Skin barrier assessment",
        detail: "Sensitivity history + MARK-VU moisture score. Programme tuned to the barrier's state.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Session 1 of 6 · Regeneration",
        detail:
          "PDRN and ceramide infusion with Edelweiss massage and Aroma Healing finish (about 50 minutes).",
        offset_days: 0,
      },
      {
        kind: "followup",
        label: "Glow check at 72 hours",
        detail: "The glow peaks at 48–72 hours as the barrier rebuilds — quick WhatsApp check-in.",
        offset_days: 3,
      },
      {
        kind: "followup",
        label: "Next session inside 2–3 weeks",
        detail: "Repair compounds when sessions stay consistent.",
        offset_days: 18,
      },
      {
        kind: "medicine",
        label: "Home care",
        detail:
          "Hydration only on treatment nights; Aroma Healing Mist through the day; SPF 35+ every morning.",
      },
    ],
  },
  {
    id: "exomere-face-contour",
    name: "Exomere Face Contour",
    category: "skin",
    region: "jaw",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit this photograph to visualize the fully settled result of a course of non-invasive lifting and contouring treatment on the lower face and neck. {assembled_slider_phrases}

The contour changes are the POINT of this image — they must be clearly visible in a side-by-side comparison: a crisper jaw-to-neck angle, a cleaner shadow line along the mandible, reduced fullness under the jaw. Keep them believable for a non-surgical treatment (soft tissue only, no altered bone), but do NOT wash them out into a mere glow. Preserve exactly: the person's identity, facial features, eyes, nose, lips, hairstyle, lighting, camera angle, framing and background. The SAME person, visibly contoured. Photorealistic, no artifacts.`,
    slider_schema: [
      {
        key: "xfc_jawline",
        label: "Jawline definition",
        hint: "Firmness and definition along the jaw",
        min: 0,
        max: 100,
        posPhrase:
          "sharpen and define the jawline: a visibly crisper jaw-to-neck angle and a clean, continuous shadow line along the mandible from chin to ear",
        negLabel: "As is",
        posLabel: "Defined",
      },
      {
        key: "xfc_neck",
        label: "Neck firmness",
        hint: "Crepey texture and laxity on the neck",
        min: 0,
        max: 100,
        posPhrase:
          "firm the neck: smooth crepey texture and visibly tighten the skin under the chin so the submental area looks taut",
        negLabel: "As is",
        posLabel: "Firm",
      },
      {
        key: "xfc_sag",
        label: "Sagging appearance",
        hint: "Mild softness in the lower face",
        min: 0,
        max: 100,
        posPhrase:
          "lift the lower face: visibly reduce jowl softness so the cheek-to-jaw transition is smoother and higher, keeping proportions natural",
        negLabel: "As is",
        posLabel: "Lifted",
      },
      {
        key: "xfc_texture",
        label: "Décolletage texture",
        hint: "Chest-area skin quality",
        min: 0,
        max: 100,
        posPhrase: "smooth and even the texture of the décolletage and chest-area skin where visible",
        negLabel: "As is",
        posLabel: "Smooth",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Contour assessment + photos",
        detail: "Jawline and neck photographed at fixed angles — the comparison set for the course.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Session 1 of 6 · Face Contour",
        detail: "Face, jawline and neck contouring with Exomere actives (about 60 minutes).",
        offset_days: 0,
      },
      {
        kind: "followup",
        label: "Day-14 photo comparison",
        detail: "Cumulative lift shows by the second week — same angles, same light.",
        offset_days: 14,
      },
      {
        kind: "medicine",
        label: "Between sessions",
        detail:
          "No makeup for 12 hours after each session; sleep slightly elevated the first night; Lifting Shot Botani V Serum daily.",
      },
    ],
  },
  {
    id: "exomere-body-contour",
    name: "Exomere Body Contour",
    category: "other",
    region: "abdomen",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit this photograph to visualize the result of a course of professional non-invasive body contouring on the treated area. {assembled_slider_phrases}

Preserve exactly: the person's identity, pose, clothing, lighting, camera angle, and background. Changes must be SUBTLE, gradual-looking and anatomically plausible — firmer, smoother skin and modestly refined contours in the treated region only; never dramatic reshaping, never a different body. The SAME person after a successful course. Photorealistic, no artifacts.`,
    slider_schema: [
      {
        key: "xbc_firmness",
        label: "Skin firmness",
        hint: "Loose-looking skin in the treated area",
        min: 0,
        max: 100,
        posPhrase: "make the skin in the treated area look firmer and more toned",
        negLabel: "As is",
        posLabel: "Firm",
      },
      {
        key: "xbc_smooth",
        label: "Smoothness",
        hint: "Uneven texture and cellulite appearance",
        min: 0,
        max: 100,
        posPhrase: "smooth uneven texture and reduce the appearance of cellulite in the treated area",
        negLabel: "As is",
        posLabel: "Smooth",
      },
      {
        key: "xbc_contour",
        label: "Contour refinement",
        hint: "Modest slimming of the chosen region",
        min: 0,
        max: 100,
        posPhrase: "modestly refine the contour of the treated region, keeping the change realistic and gradual",
        negLabel: "As is",
        posLabel: "Refined",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Region selection + baseline photos",
        detail:
          "Choose any two body regions per session (stomach, arms, hips, thighs, back). Fixed-angle photos weekly.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Session 1 of 6 · Body Contour",
        detail: "Two regions treated per session (about 60 minutes). Results build across the course.",
        offset_days: 0,
      },
      {
        kind: "followup",
        label: "Weekly photo tracking",
        detail: "Photograph weekly under the same light — the course tells its story in the series.",
        offset_days: 7,
      },
      {
        kind: "medicine",
        label: "Between sessions",
        detail:
          "Extra water for 48 hours after each session; Lifting Shot S Body Concentrator daily; avoid sauna/hot yoga for 24 hours.",
      },
    ],
  },
  {
    id: "mito-full-body-reset",
    name: "MitoRedLight Full Body Reset",
    category: "other",
    region: "full_body",
    available: true,
    model: "gemini-2.5-flash-image",
    prompt_template: `Edit ONLY the skin in this photograph to visualize the result of a course of full-body red light and near-infrared therapy. {assembled_slider_phrases}

Preserve exactly: the person's identity, features, pose, clothing, hairstyle, lighting, camera angle, and background. The change is healthier, more rested, subtly firmer-looking skin with an even, vital tone — never plastic smoothing, never reshaping. The SAME person, visibly recovered and well. Photorealistic, no artifacts.`,
    slider_schema: [
      {
        key: "fbr_vitality",
        label: "Skin vitality",
        hint: "Overall skin energy and evenness",
        min: 0,
        max: 100,
        posPhrase: "give the skin an even, vital, well-circulated tone",
        negLabel: "As is",
        posLabel: "Vital",
      },
      {
        key: "fbr_recovery",
        label: "Recovered look",
        hint: "The rested look of good sleep and recovery",
        min: 0,
        max: 100,
        posPhrase: "make the person look rested and recovered, easing tired, drawn features",
        negLabel: "As is",
        posLabel: "Rested",
      },
      {
        key: "fbr_firm",
        label: "Skin firmness",
        hint: "Subtle full-body skin quality",
        min: 0,
        max: 100,
        posPhrase: "make visible skin look subtly firmer and healthier overall",
        negLabel: "As is",
        posLabel: "Firm",
      },
    ],
    canvas_handles: [],
    plan_template: [
      {
        kind: "milestone",
        label: "Wellness intake",
        detail:
          "Goals across recovery, sleep, skin and training load. MitoPOD programme set accordingly.",
        offset_days: 0,
      },
      {
        kind: "milestone",
        label: "Session 1 of 6 · Full Body Reset",
        detail:
          "Full-body MitoRedLight therapy with Exomere Body Contour (about 90 minutes). Most clients sleep noticeably deeper the first two nights.",
        offset_days: 0,
      },
      {
        kind: "followup",
        label: "Weekly rhythm",
        detail: "Weekly sessions compound — keep a consistent slot.",
        offset_days: 7,
      },
      {
        kind: "medicine",
        label: "Between sessions",
        detail: "Hydrate well; avoid intense heat exposure for 24 hours after each session.",
      },
    ],
  },
];

export const PROCEDURE_CATEGORIES: {
  id: string;
  label: string;
  blurb: string;
  templateIds: string[];
}[] = [
  {
    id: "capture",
    label: "CAPTURE Signature",
    blurb: "EXOMERE & MitoRedLight — the six needle-free house treatments",
    templateIds: [
      "mito-regenerative-glow",
      "exomere-face-implant",
      "exomere-regeneration",
      "exomere-face-contour",
      "exomere-body-contour",
      "mito-full-body-reset",
    ],
  },
  {
    id: "injectable",
    label: "Injectables / Non-invasive",
    blurb: "Botox, dermal fillers, liquid rhinoplasty",
    templateIds: [
      "botox",
      "lip_filler",
      "cheek_filler",
      "tear_trough",
      "nasolabial_filler",
      "jawline_filler",
      "chin_filler",
      "temple_filler",
      "liquid_rhino",
    ],
  },
  {
    id: "skin",
    label: "Skin / Resurfacing",
    blurb: "Lasers, peels, microneedling, pigmentation",
    templateIds: [
      "laser_resurfacing",
      "chemical_peel",
      "microneedling_rf",
      "hydrafacial",
      "pigmentation",
      "acne_scar",
      "laser_hair_removal",
    ],
  },
  {
    id: "lifting",
    label: "Lifting & Tightening",
    blurb: "HIFU skin tightening, PDO thread lift",
    templateIds: ["skin_tightening", "thread_lift"],
  },
  {
    id: "surgical",
    label: "Surgical / Structural",
    blurb: "Rhinoplasty, chin & jaw, eyelids, facelift",
    templateIds: [
      "rhinoplasty",
      "chin_jaw",
      "blepharoplasty",
      "facelift",
      "buccal_fat",
      "fat_transfer",
    ],
  },
  {
    id: "hair",
    label: "Hair Restoration",
    blurb: "FUE transplant, PRP, hairline design",
    templateIds: ["hair_transplant", "prp_hair"],
  },
];

export function getTemplate(id: string | null | undefined) {
  if (!id) return undefined;
  return TEMPLATES.find((t) => t.id === id);
}

/**
 * Body-first treatments skip the 3D face pipeline entirely: their
 * visualization is the photo-based Body Studio (pose-detected toning +
 * AI), not the landmark canvas (owner 2026-07-23).
 */
export const BODY_TEMPLATE_IDS = [
  "exomere-body-contour",
  "mito-full-body-reset",
] as const;

export function isBodyTemplate(id: string | null | undefined): boolean {
  return !!id && (BODY_TEMPLATE_IDS as readonly string[]).includes(id);
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
