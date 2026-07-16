/**
 * CAPTURE knowledge base — single source of truth for everything the
 * client sees about the brand: locations, treatments, retail catalogue,
 * technology, FAQs and aftercare. Sourced from capture.cc (July 2026)
 * and the CAPTURE meeting notes (System_docs/11).
 *
 * VYBERO answers from this file. The POS catalogue sells from this file.
 * The seed provisions from this file. Change it here, it changes everywhere.
 */

export const CAPTURE_BRAND = {
  name: "CAPTURE",
  legalName: "Capture Beauty (Pvt.) Ltd.",
  parent: "Don Valley Pharmaceuticals",
  partner: "Three Days Love (Korea)",
  tagline: "The intimate science of beauty",
  subline: "Advanced Korean skincare & needle-free regenerative treatments",
  voice:
    "premium, calm, medically credible. Warm but precise. Never pushy, never clinical-cold. British English. No exclamation marks in medical context.",
  whatsapp: "+92-309-4442031",
  email: "cosmetics.dv@jsvt.com.pk",
  website: "capture.cc",
  loyaltyName: "Capture Circle",
  currency: "PKR",
  hours: {
    open: "10:00",
    close: "19:00",
    supportHours: "Monday to Saturday, 9:00 AM to 6:00 PM",
    openDays: [1, 2, 3, 4, 5, 6], // Mon–Sat
  },
} as const;

/** The four CAPTURE locations: the owned Experience Centre + 3 partner clinics. */
export interface CaptureLocation {
  id: string;
  name: string;
  short: string;
  kind: "experience_centre" | "partner";
  doctor?: string;
  address: string;
  area: string;
  city: string;
  phone: string;
  /** which treatments run here (treatment ids) */
  offers: string[];
  invoicePrefix: string;
}

export const CAPTURE_LOCATIONS: CaptureLocation[] = [
  {
    id: "experience-centre",
    name: "CAPTURE Experience Centre",
    short: "Experience Centre",
    kind: "experience_centre",
    address: "2nd Floor, Vogue Towers, 15 C/2 M.M. Alam Road",
    area: "Gulberg III",
    city: "Lahore",
    phone: "+92-309-4442031",
    offers: [
      "mito-regenerative-glow",
      "exomere-body-contour",
      "exomere-face-contour",
      "exomere-face-implant",
      "exomere-regeneration",
      "mito-full-body-reset",
    ],
    invoicePrefix: "EC",
  },
  {
    id: "skin-clinic-haroon",
    name: "The Skin Clinic by Dr. Haroon Nabi",
    short: "The Skin Clinic",
    kind: "partner",
    doctor: "Dr. Haroon Nabi",
    address: "49-C2, Ghalib Road, Gulberg III",
    area: "Gulberg III",
    city: "Lahore",
    phone: "+92-309-4442031",
    offers: [
      "exomere-face-implant",
      "exomere-regeneration",
      "exomere-face-contour",
    ],
    invoicePrefix: "SC",
  },
  {
    id: "alta-derm-nazia",
    name: "Alta Derm by Dr. Nazia",
    short: "Alta Derm",
    kind: "partner",
    doctor: "Dr. Nazia",
    address: "14 C/1, Main M.M. Alam Road, Block C1, Gulberg III",
    area: "Gulberg III",
    city: "Lahore",
    phone: "+92-309-4442031",
    offers: ["exomere-face-implant", "exomere-regeneration", "exomere-face-contour"],
    invoicePrefix: "AD",
  },
  {
    id: "experts-ashba",
    name: "Experts by Dr. Ashba Cheema",
    short: "Experts",
    kind: "partner",
    doctor: "Dr. Ashba Cheema",
    address: "Commercial Broadway, Block B, DHA",
    area: "DHA",
    city: "Lahore",
    phone: "+92-309-4442031",
    offers: ["exomere-face-implant", "exomere-regeneration", "exomere-body-contour"],
    invoicePrefix: "EX",
  },
];

/** The six in-clinic treatments (from capture.cc/pages/capture-experience-centre). */
export interface CaptureTreatment {
  id: string;
  name: string;
  short: string;
  category: "redlight" | "body" | "face" | "facial";
  /** one-line pitch, brand voice */
  pitch: string;
  bestFor: string[];
  focus: string;
  includes: string;
  durationMin: number;
  /** demo price per session, PKR — configurable in Settings */
  pricePkr: number;
  /** sessions in a typical course */
  courseSessions?: number;
  coursePricePkr?: number;
  aftercare: string[];
}

export const CAPTURE_TREATMENTS: CaptureTreatment[] = [
  {
    id: "mito-regenerative-glow",
    name: "MitoRedLight Regenerative Glow",
    short: "Regenerative Glow",
    category: "redlight",
    pitch:
      "A luxurious face-and-body treatment designed to deliver radiant skin and total-body renewal.",
    bestFor: [
      "pre-event glow",
      "rejuvenated facial and body skin",
      "hydration",
      "recovery support",
      "full-body wellness",
      "overall skin vitality",
    ],
    focus:
      "Radiant glow, skin revitalization, hydration, full-body recovery and enhanced vitality.",
    includes:
      "Exomere facial of choice with full-body red light and near-infrared light therapy.",
    durationMin: 75,
    pricePkr: 18000,
    courseSessions: 6,
    coursePricePkr: 95000,
    aftercare: [
      "Hydrate well for 24 hours; the light therapy raises cellular activity.",
      "No exfoliants or actives (retinol, AHA) for 48 hours.",
      "SPF 35+ daily; the Recovery Balm Plus SPF 35 is ideal.",
      "Mild warmth or flushing settles within a few hours and is normal.",
    ],
  },
  {
    id: "exomere-body-contour",
    name: "Exomere Body Contour",
    short: "Body Contour",
    category: "body",
    pitch:
      "A targeted body treatment designed to smooth, firm and refine your chosen areas for a more sculpted look.",
    bestFor: [
      "arms",
      "stomach",
      "hips",
      "thighs",
      "legs",
      "back",
      "shoulders",
      "uneven texture",
      "cellulite appearance",
      "loose-looking skin",
    ],
    focus:
      "Smoother skin, improved firmness, refined contours and enhanced body definition.",
    includes: "Body contouring for any two body regions per session.",
    durationMin: 60,
    pricePkr: 22000,
    courseSessions: 6,
    coursePricePkr: 118000,
    aftercare: [
      "Drink extra water for 48 hours to support lymphatic clearance.",
      "Light activity is fine; avoid intense heat (sauna, hot yoga) for 24 hours.",
      "Apply Lifting Shot S Body Concentrator daily between sessions.",
      "Results build across the course; photograph weekly under the same light.",
    ],
  },
  {
    id: "exomere-face-contour",
    name: "Exomere Face Contour",
    short: "Face Contour",
    category: "face",
    pitch:
      "A sculpting treatment for a more lifted, defined and confident profile.",
    bestFor: [
      "jawline definition",
      "neck firmness",
      "décolletage texture",
      "chest-area skin quality",
      "mild sagging appearance",
      "signs of aging",
      "crepey-looking skin",
    ],
    focus:
      "Visible lifting, contour definition, smoother texture, firmer-looking skin and refined appearance.",
    includes: "Face, jawline and neck contouring with Exomere actives.",
    durationMin: 60,
    pricePkr: 20000,
    courseSessions: 6,
    coursePricePkr: 108000,
    aftercare: [
      "No makeup for 12 hours; let the actives settle.",
      "Sleep slightly elevated the first night to support drainage.",
      "No exfoliants or actives for 48 hours; SPF 35+ daily.",
      "A follow-up photograph at day 14 shows the cumulative lift.",
    ],
  },
  {
    id: "exomere-face-implant",
    name: "Exomere Face Implant Regimen",
    short: "Skin Implant",
    category: "facial",
    pitch:
      "A powerful needle-free skin renewal treatment that visibly smooths, firms and restores a radiant, youthful-looking complexion.",
    bestFor: [
      "signs of aging",
      "uneven tone",
      "acne",
      "rough texture",
      "sagging",
      "loss of collagen",
      "pigmentation concerns",
      "brightness",
      "overall skin vitality",
    ],
    focus:
      "Visible lift, smoother texture, brighter tone, refined pores, reduced inflammation, enhanced firmness and visibly rejuvenated skin.",
    includes:
      "SPICUS micro-channel delivery of Exomere Halla exosomes with plant collagen.",
    durationMin: 50,
    pricePkr: 15000,
    courseSessions: 6,
    coursePricePkr: 80000,
    aftercare: [
      "A mild tingling for 24–48 hours is the spicules working; do not scrub.",
      "No retinol, AHA/BHA or vitamin C for 72 hours.",
      "Use the Post Care Regimen (Ceramide Recell Cream + Recovery Balm SPF).",
      "Avoid direct sun and heat styling near the face for 48 hours.",
    ],
  },
  {
    id: "exomere-regeneration",
    name: "Exomere Regeneration Regimen",
    short: "Regeneration",
    category: "facial",
    pitch:
      "A deeply restorative facial designed to calm, repair and revive stressed or compromised skin.",
    bestFor: [
      "dryness",
      "fine lines",
      "wrinkles",
      "dullness",
      "sensitivity",
      "tired-looking skin",
      "post-treatment care",
      "barrier support",
    ],
    focus:
      "Deep hydration, skin recovery, barrier strengthening, calming relief and radiant glow.",
    includes:
      "PDRN and ceramide infusion with Edelweiss massage and Aroma Healing finish.",
    durationMin: 50,
    pricePkr: 12000,
    courseSessions: 6,
    coursePricePkr: 65000,
    aftercare: [
      "Skip actives tonight; hydration only.",
      "The glow peaks at 48–72 hours as the barrier rebuilds.",
      "Aroma Healing Mist through the day keeps the infusion active.",
      "Book the next session inside 2–3 weeks to compound the repair.",
    ],
  },
  {
    id: "mito-full-body-reset",
    name: "MitoRedLight Full Body Reset",
    short: "Full Body Reset",
    category: "redlight",
    pitch:
      "A powerful all-in-one full-body experience designed to restore, energize and visibly refine your skin and body.",
    bestFor: [
      "body contouring",
      "skin firmness",
      "inflammation recovery",
      "skin quality improvement",
      "sleep and rhythm recovery",
      "fatigue",
      "wellness maintenance",
      "muscle tissue repair",
      "neurological health",
      "cellular vitality and oxygenation",
      "anti-aging",
      "hair and scalp wellness",
    ],
    focus:
      "Full-body rejuvenation, improved circulation, enhanced skin quality, body contouring and renewed energy.",
    includes: "Full-body MitoRedLight therapy with Exomere Body Contour.",
    durationMin: 90,
    pricePkr: 28000,
    courseSessions: 6,
    coursePricePkr: 150000,
    aftercare: [
      "Hydrate well; cellular energy work is thirsty work.",
      "Most clients sleep noticeably deeper the first two nights.",
      "Avoid intense heat exposure for 24 hours.",
      "Weekly sessions compound; keep a consistent slot.",
    ],
  },
];

/** Retail catalogue — real capture.cc prices (July 2026). */
export interface CaptureProduct {
  id: string;
  name: string;
  pricePkr: number;
  kind: "product" | "regimen";
  category: string;
  note?: string;
}

export const CAPTURE_PRODUCTS: CaptureProduct[] = [
  { id: "tea-tree-cleanser", name: "Tea Tree Bubble Cleanser", pricePkr: 6900, kind: "product", category: "Cleanser" },
  { id: "lifting-shot-gel", name: "Lifting Shot Soothing Gel", pricePkr: 13900, kind: "product", category: "Treatment" },
  { id: "rose-garden-mask", name: "Rose Garden Mask", pricePkr: 4900, kind: "product", category: "Mask" },
  { id: "edelweiss-cream", name: "Edelweiss Snow Massage Cream", pricePkr: 9900, kind: "product", category: "Moisturizer" },
  { id: "aroma-mist", name: "Aroma Healing Mist", pricePkr: 6900, kind: "product", category: "Mist" },
  { id: "glutathione-melashot", name: "Glutathione Melashot Solution", pricePkr: 12900, kind: "product", category: "Brightening" },
  { id: "ceramide-recell", name: "Ceramide Recell Cream", pricePkr: 10900, kind: "product", category: "Moisturizer" },
  { id: "egf-spicus", name: "EGF Spicus Ampoule", pricePkr: 12900, kind: "product", category: "Ampoule" },
  { id: "pdrn-spicus", name: "PDRN Spicus Ampoule", pricePkr: 12900, kind: "product", category: "Ampoule" },
  { id: "recovery-balm-21", name: "Recovery Balm Plus SPF 35 (Shade 21)", pricePkr: 9900, kind: "product", category: "UV Protection" },
  { id: "recovery-balm-25", name: "Recovery Balm Plus SPF 35 (Shade 25 Glow Tan Beige)", pricePkr: 9900, kind: "product", category: "UV Protection" },
  { id: "eyeron-shot", name: "Eyeron Shot Cream", pricePkr: 10900, kind: "product", category: "Eye Care" },
  { id: "exomere-g-eye", name: "Exomere G Spicus Shot Eye Cream", pricePkr: 12900, kind: "product", category: "Eye Care" },
  { id: "botani-v-serum", name: "Lifting Shot Botani V Serum", pricePkr: 15900, kind: "product", category: "Serum" },
  { id: "s-body-concentrator", name: "Lifting Shot S Body Concentrator", pricePkr: 14900, kind: "product", category: "Body Care" },
  { id: "implant-solution", name: "Implant Solution", pricePkr: 15900, kind: "product", category: "Treatment" },
  { id: "recovery-balm-refill", name: "Recovery Balm SPF 35 Shade 21 (Refill)", pricePkr: 7900, kind: "product", category: "Refill" },
  { id: "aroma-mist-refill", name: "Aroma Healing Mist (Refill)", pricePkr: 12900, kind: "product", category: "Refill" },
  { id: "derma-v-healer", name: "Exomere Derma V-Healer Plus", pricePkr: 49900, kind: "product", category: "Device" },
  // Regimen bundles ("Buy the Regimen")
  { id: "regimen-daily-care", name: "Daily Care Regimen (1 month)", pricePkr: 50000, kind: "regimen", category: "Regimen", note: "Save Rs. 10,400" },
  { id: "regimen-implant", name: "Implant Regimen (3 months)", pricePkr: 45000, kind: "regimen", category: "Regimen", note: "Save Rs. 20,300" },
  { id: "regimen-regenerative", name: "Regenerative Regimen (3 months)", pricePkr: 50000, kind: "regimen", category: "Regimen", note: "Save Rs. 25,300" },
  { id: "regimen-face-contour", name: "Face Contour Regimen", pricePkr: 55000, kind: "regimen", category: "Regimen", note: "Save Rs. 10,800" },
  { id: "regimen-body-contour", name: "Body Contour Regimen", pricePkr: 55000, kind: "regimen", category: "Regimen", note: "Save Rs. 9,800" },
  { id: "regimen-post-care", name: "Post Care Regimen", pricePkr: 16000, kind: "regimen", category: "Regimen" },
];

/** Technology & science talking points (VYBERO answers from these). */
export const CAPTURE_TECH = {
  exomere:
    "EXOMERE sits at the intersection of exosome and telomere science. It uses Korean Hallabong citrus-derived exosomes, rich in antioxidants, vitamins and flavonoids that stimulate collagen synthesis and inhibit melanin, delivered with plant-based collagen.",
  spicus:
    "SPICUS is a needle-free microneedle system using marine sponge spicules that painlessly open the skin's micro-channels, delivering actives for visible transformation within days. No needles, no downtime.",
  mitoRedLight:
    "MitoRedLight is medical-grade red and near-infrared light therapy. Our MitoPRO Commercial X flagship delivers six precision wavelengths; the MitoPOD offers full-body coverage with 6,960 LED chips and TriChip technology. Clinically proven benefits across collagen support, inflammation recovery, muscle wellness, cellular energy (ATP), brain health, mood and stress, sleep rhythm, and hair and scalp wellness.",
  captureProtocol:
    "The CAPTURE Protocol is our signature body-contour pairing: EXOMERE Lifting Shot S Body Concentrator combined with professional MitoRedLight therapy to enhance skin firmness, support collagen production and maximise body contouring results.",
  markVu:
    "Every new client begins with a MARK-VU professional skin analysis: a multi-spectral scan of pigmentation, pores, wrinkles, sebum and UV damage that lets our specialists personalise the treatment plan to your skin, not a template.",
  renewalProgram:
    "The 12-week EXOMERE Intensive Skin Renewal Program combines 6 Skin Implant treatments and 6 Regeneration treatments with personalised home care products.",
} as const;

/** Skin concerns CAPTURE addresses (site taxonomy) → treatment mapping. */
export const CAPTURE_CONCERNS: { concern: string; treatments: string[] }[] = [
  { concern: "sensitive skin", treatments: ["exomere-regeneration"] },
  { concern: "acne", treatments: ["exomere-face-implant"] },
  { concern: "signs of aging", treatments: ["exomere-face-implant", "exomere-face-contour"] },
  { concern: "dullness and pigmentation", treatments: ["exomere-face-implant", "mito-regenerative-glow"] },
  { concern: "brightening", treatments: ["mito-regenerative-glow", "exomere-face-implant"] },
  { concern: "texture and barrier strengthening", treatments: ["exomere-regeneration", "exomere-face-implant"] },
  { concern: "dryness", treatments: ["exomere-regeneration"] },
  { concern: "scars and marks", treatments: ["exomere-face-implant"] },
  { concern: "melasma and freckles", treatments: ["exomere-face-implant"] },
  { concern: "blackheads and clogged pores", treatments: ["exomere-face-implant"] },
  { concern: "skin laxity", treatments: ["exomere-face-contour", "exomere-body-contour"] },
  { concern: "cellulite and lymphedema", treatments: ["exomere-body-contour", "mito-full-body-reset"] },
];

export const CAPTURE_FAQS: { q: string[]; a: string }[] = [
  {
    q: ["needle", "needles", "pain", "painful", "hurt", "downtime"],
    a: "All CAPTURE treatments are needle-free. SPICUS uses natural marine sponge spicules that open micro-channels painlessly, and MitoRedLight is completely non-invasive light therapy. Most clients describe a mild tingling at most, and there is no downtime — you can return to your day immediately.",
  },
  {
    q: ["where", "location", "address", "situated", "clinic", "reach", "directions", "parking"],
    a: "Our Experience Centre is on the 2nd floor of Vogue Towers, 15 C/2 M.M. Alam Road, Gulberg III, Lahore, with valet parking at the tower. We also work through partner clinics: The Skin Clinic by Dr. Haroon Nabi (Ghalib Road, Gulberg III), Alta Derm by Dr. Nazia (M.M. Alam Road) and Experts by Dr. Ashba Cheema (DHA Broadway).",
  },
  {
    q: ["hours", "timing", "open", "close", "sunday", "when"],
    a: "The Experience Centre is open Monday to Saturday, 10:00 AM to 7:00 PM. We are closed on Sundays. Our support line answers Monday to Saturday, 9:00 AM to 6:00 PM.",
  },
  {
    q: ["price", "cost", "charges", "fee", "how much", "expensive", "rates"],
    a: "Single sessions start from Rs. 12,000 for the Exomere Regeneration facial; the Skin Implant treatment is Rs. 15,000; body contouring from Rs. 22,000 per session; and the full MitoRedLight Regenerative Glow is Rs. 18,000. Courses of six carry a meaningful saving. I can share the exact price for any treatment you are considering.",
  },
  {
    q: ["mark-vu", "markvu", "skin analysis", "scan", "analysis"],
    a: "Every new client begins with a MARK-VU professional skin analysis — a multi-spectral scan of pigmentation, pores, wrinkles, sebum and UV damage. Your specialist uses it to personalise your plan, and we track it across visits so you can see your skin improve on the numbers, not just in the mirror.",
  },
  {
    q: ["payment", "card", "cash", "installment", "pay"],
    a: "We accept cash and all major cards at the clinic. Course packages can be split across sessions. Retail products are also available on capture.cc with delivery across Pakistan.",
  },
  {
    q: ["capture circle", "loyalty", "points", "reward", "discount", "voucher"],
    a: "The Capture Circle is our members' programme: you earn rewards for visits and for sharing your experience after treatments. Members receive exclusive access to launches, rituals and seasonal invitations. Your reviews after each visit earn you credit toward your next treatment.",
  },
  {
    q: ["exomere", "exosome", "hallabong", "korean", "telomere"],
    a: "EXOMERE is our flagship Korean line, developed with Three Days Love, pioneers in patented Pain Detox Care. It sits at the intersection of exosome and telomere science: Hallabong citrus-derived exosomes rich in antioxidants and flavonoids that stimulate collagen and inhibit melanin, delivered needle-free with plant-based collagen.",
  },
  {
    q: ["red light", "redlight", "infrared", "mito", "led"],
    a: "MitoRedLight is medical-grade red and near-infrared light therapy on our MitoPRO Commercial X and MitoPOD systems (6,960 LED chips, six precision wavelengths). It is clinically supported for collagen production, inflammation recovery, muscle repair, cellular energy, sleep rhythm, and hair and scalp wellness — non-invasive and deeply relaxing.",
  },
  {
    q: ["gift", "voucher", "someone", "wife", "husband", "mother"],
    a: "We offer gift sessions for every treatment — the MitoRedLight Regenerative Glow is our most-gifted experience. Share the recipient's name and I will arrange a gift booking; the Experience Centre will take care of the rest.",
  },
  {
    q: ["cancel", "reschedule", "change my", "move my"],
    a: "Of course — share your name and booked time and I will reschedule or cancel it for you. We appreciate 24 hours' notice where possible so another client can take the slot.",
  },
  {
    q: ["safe", "pregnancy", "pregnant", "breastfeeding", "medical", "condition"],
    a: "CAPTURE treatments are needle-free and gentle, but with pregnancy, active skin infections or photosensitive conditions we ask that you consult your physician first. Our specialists review your MARK-VU analysis and medical notes before any programme begins — your safety leads every plan.",
  },
  {
    q: ["product", "shop", "buy", "home care", "cleanser", "serum", "delivery", "order"],
    a: "The full EXOMERE home-care collection is available at the Experience Centre and online at capture.cc — from the Tea Tree Bubble Cleanser (Rs. 6,900) to the Lifting Shot Botani V Serum (Rs. 15,900), plus curated regimens like the Face Contour Regimen (Rs. 55,000). Your specialist can pair products to your treatment plan.",
  },
];

/** Illustrative-preview disclaimer — required on every visualization output. */
export const CAPTURE_DISCLAIMER =
  "Illustrative preview of an expected outcome. Individual results vary; this is not a guarantee of results. Reviewed with your CAPTURE specialist.";

export function findTreatment(id: string): CaptureTreatment | undefined {
  return CAPTURE_TREATMENTS.find((t) => t.id === id);
}

export function findLocation(id: string): CaptureLocation | undefined {
  return CAPTURE_LOCATIONS.find((l) => l.id === id);
}

export function formatPkr(amount: number): string {
  return "Rs. " + amount.toLocaleString("en-PK");
}
