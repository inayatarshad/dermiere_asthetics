# Contour · System Documentation

Client-safe technical overview of the aesthetic clinic consultation system.

## What it is

A web application used inside an aesthetics clinic. The front desk registers patients and captures consent and photos; the doctor runs a visual consultation powered by a 3D face canvas and AI before/after previews; the patient leaves with a polished report and a concrete treatment plan.

## Module × Role matrix

| Capability | Front Desk | Doctor | Clinic Admin |
|---|---|---|---|
| Register a new patient | Yes | Yes | Yes |
| Capture consent + photos | Yes | Yes | Yes |
| View patient profiles | Yes | Yes | Yes |
| Run consultation (brief, canvas, AI, plan) | No | Yes | Yes |
| Export report | Yes | Yes | Yes |
| Manage treatment templates | No | No | Yes (view) |
| Manage staff users | No | No | Yes |
| Clinic settings / branding | No | No | Yes |

Enforced in the UI (controls hidden or locked per role) and by route guards. Sessions auto-lock after 10 minutes idle.

## Architecture

```
[ Clinic laptop / tablet browser ]
  Next.js 16 SPA surface (React 19, Tailwind v4, glassmorphic mint tokens)
  ├─ 3D canvas: react-three-fiber + MediaPipe Face Landmarker (self-hosted WASM + model)
  ├─ Live preview: on-device 2D triangulated landmark warp (offline, instant)
  ├─ Store: Zustand (localStorage) + IndexedDB for images and landmark caches
  └─ /api/generate (Vercel serverless, 60s max)
        └─ Model-agnostic provider layer (AI_PROVIDER selects; auto-fallback)
             ├─ Google Gemini / Nano Banana (primary; identity preservation)
             ├─ OpenAI GPT Image 2 (input_fidelity=high; spatial reasoning)
             └─ FLUX.1 Kontext via BFL API (controllable editing)
```

### The face engine (src/lib/face)

- `landmarker.ts`: MediaPipe FaceLandmarker singleton. GPU delegate with CPU fallback. WASM runtime and the 3.7MB model file are served from `/public`, so the pipeline runs with zero network.
- `geometry.ts`: mesh triangulation derived at runtime from the official tessellation edge list (3-clique detection, ~900 triangles, cached); semantic region weights (nose frame, alar, dorsum, tip, radix, lips, cheeks, jaw, chin, under-eye) with smooth falloff; the shared **morph engine** that maps slider params to landmark displacements. Magnitudes are capped to clinically plausible ranges.
- `subdivide.ts`: uniform 1-to-4 mesh subdivision (2 levels, ~14.4k triangles). The morph engine is a smooth displacement field; the 3D canvas evaluates it at every subdivided vertex, so a handle drag reads as a refined curved push rather than a flat triangle moving. Originals keep their indices, so anatomical anchors stay valid. Field evaluation stays in the low milliseconds.
- `warp2d.ts`: per-triangle affine warp of the photo from base to morphed landmarks, with seam-hiding clip expansion; also burns the disclaimer bar into saved after-images.
- The 3D canvas and the 2D preview share the same morph math, so what the doctor sculpts and what the preview shows always agree.
- Roadmap (owner decision): after IPAAC, the 3D canvas moves to a FLAME / 3DMM dense parametric head model as the final version (anatomically smooth morphs, full head; a few seconds of fit time accepted). The subdivided-mesh approach is the interim solution.

### The AI loop (05_ai-before-after.md)

- Each procedure is a `TreatmentTemplate`: slider schema + prompt template + canvas morph handles + plan checklist + preferred model. Four ship fully wired: Rhinoplasty (7 sliders), Lip Filler (8), Chin Filler (6), Botox (6). The lip/chin/brow morph fields are anchored to canonical landmarks (oral line, cupid's bow peaks, menton, eyebrow sets, gonial oval points) so geometry moves anatomically in both the 3D canvas and the 2D preview; skin-level sliders (lines, texture) are rendered by the AI pass and flagged honestly in the UI.
- Slider values map to phrase bands (under 15 neutral, 15-40 "very slightly", 40-70 "moderately", 70-100 "noticeably") assembled into the identity-preserving edit instruction.
- Every generation stores `params` and `prompt_used` on the `Visualization` record for reproducibility and audit.
- Consent gating: no capture or generation without a granted photography consent record.
- Generations are cached client-side by provider + params hash; revisiting a setting is instant.
- Admin control: Settings -> AI generation selects the provider clinic-wide, including **None** (photoreal off; on-device simulation only). The GUI reads provider availability from GET `/api/generate` (configured flags and model names only); API keys never leave the server environment.

### Data model

Clinic, User, Patient, Consent, Asset, Consultation, Visualization, TreatmentTemplate, TreatmentPlan, PlanItem, Report, exactly per the knowledge base data model. Everything is clinic-scoped. Assets carry `visit_date`, which powers the patient timeline (before, AI-predicted after, healed result at follow-ups).

Persistence is deliberately light for the demo (per the build plan): structured records in localStorage via Zustand persist, images and landmark caches in IndexedDB. The store API is the seam for swapping in Postgres + object storage later without touching the UI.

### The report (07_report-export.md)

Three A4 sheets rendered as HTML/CSS from the same design tokens as the app: cover, consultation + visualization, plan + next steps. Report surfaces use pre-composed opaque glass (no backdrop-filter), so browser print-to-PDF output matches the screen exactly. Page breaks are locked per sheet.

## Design system

Glassmorphic Mint, implemented as CSS variables + Tailwind v4 theme tokens straight from the knowledge base: mint scale (#34D3B0 family), off-white base, ink text scale, the `.glass` recipe (blur 20px, saturate 140%, 1px light border, soft wide shadows), pill buttons with mint glow, the mint slider as the star control, calm 150-250ms ease-out motion. No flat white backgrounds anywhere; panels float over a soft mint radial gradient with ambient glow blobs.

## Scaling to new procedures

Add one object to `src/lib/templates.ts` (sliders, phrases, prompt template, plan items) and set `available: true`. The brief, canvas emphasis, AI visualization, plan and report all pick it up automatically. Lip filler, Botox, chin/jaw, blepharoplasty, laser presets are already declared as placeholders.

## Known demo-scope limits

- Auth is seeded demo credentials with client-side sessions (per the build plan). Replace with real server auth + hashed credentials before handling real patient data.
- Data lives on the device (no server database yet). "Reset demo" restores the seed.
- The sculpt brush is a live communication tool; its strokes are not persisted (morph sliders and annotations are).
- One clinic per deployment in the demo store; the data model is already clinic-scoped for multi-tenant.
