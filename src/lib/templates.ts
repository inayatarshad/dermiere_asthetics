/**
 * Treatment templates — the reusable unit that makes the system scale
 * across procedures (knowledge base / 06_treatments-and-plan.md).
 *
 * A template bundles: the AI slider schema + prompt template (drives
 * 05_ai-before-after.md) and the default plan checklist. Adding a new
 * procedure = adding one object here. Rhinoplasty ships first; the other
 * presets are declared but marked unavailable until their schemas are tuned.
 */

import type { TreatmentTemplate } from "./types";

export const RHINOPLASTY_PROMPT_TEMPLATE = `Edit ONLY the nose in this photograph to visualize the result of a rhinoplasty procedure. {assembled_slider_phrases}

Preserve exactly, with no changes: the person's identity and all other facial features, eyes, lips, skin tone and texture, facial proportions, hairstyle, lighting, camera angle, and background. Do not beautify or alter anything other than the nose. The result must look like the SAME person with a natural, fully-healed post-surgical nose. Photorealistic, consistent lighting, no artifacts.`;

export const TEMPLATES: TreatmentTemplate[] = [
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
        detail: "2 sprays per nostril, 3–4 times daily for 4 weeks.",
      },
    ],
  },
  {
    id: "lip_filler",
    name: "Lip Filler",
    category: "injectable",
    region: "lips",
    available: false,
    model: "gemini-2.5-flash-image",
    prompt_template: "",
    slider_schema: [],
    plan_template: [],
  },
  {
    id: "botox",
    name: "Botox",
    category: "injectable",
    region: "forehead",
    available: false,
    model: "gemini-2.5-flash-image",
    prompt_template: "",
    slider_schema: [],
    plan_template: [],
  },
  {
    id: "chin_jaw",
    name: "Chin / Jaw",
    category: "surgical",
    region: "jaw",
    available: false,
    model: "gemini-2.5-flash-image",
    prompt_template: "",
    slider_schema: [],
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
    id: "surgical",
    label: "Surgical / Structural",
    blurb: "Rhinoplasty, chin & jaw, eyelids",
    templateIds: ["rhinoplasty", "chin_jaw", "blepharoplasty"],
  },
  {
    id: "injectable",
    label: "Injectables",
    blurb: "Botox, dermal fillers, profile balancing",
    templateIds: ["botox", "lip_filler"],
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
