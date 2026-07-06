# Contour · Aesthetic Clinic OS

The consultation system for modern aesthetic clinics: role-based clinic access, patient registration with consent capture, a parametric **3D face canvas**, identity-preserving **AI before/after visualization**, template-driven **treatment plans**, and a glassmorphic **patient report** that exports to PDF.

Built from the Contour knowledge base for the IPAAC 2026 demo. Five procedures are fully wired end to end: **Rhinoplasty** (7 sliders), **Lip Filler** (8 sliders: vermilion volumes, upper:lower balance, cupid's bow, border, corners, projection, philtral columns), **Chin Filler** (6 sliders: E-line projection, length, taper, labiomental crease, prejowl blend, texture), **Botox** (6 sliders: forehead, glabella, crow's feet, brow lift, masseter slimming, lip flip) and **Hair Transplant** (hairline restore, temples, density, crown coverage, plus a hairstyle try-on: eight styles rendered on the grown-in result). Every additional procedure is one template object away (slider schema + prompt template + canvas handles + plan checklist), with no new engine code.

## The consultation spine

```
REGISTER -> CAPTURE -> BRIEF -> 3D CANVAS -> AI VISUALIZE -> PLAN -> REPORT
```

1. **Register**: search-first patient registration, three consent records (treatment, photography, marketing) with timestamp, staff attribution and wording version.
2. **Capture**: webcam capture with ghost pose guides (front, tilted-right, tilted-left), on-device face auto-check, upload fallback.
3. **Brief**: structured intake. The primary interest arms the canvas, pre-selects the AI preset and suggests the plan template.
4. **3D Canvas**: MediaPipe Face Landmarker (468 landmarks, fully self-hosted) fitted to the front photo, rendered as a textured Three.js mesh. Orbit/zoom/pan, semantic morph handles (bridge, tip, nostril width), soft-falloff sculpt brush, annotations that stick to the mesh, feature highlight and scaling.
5. **AI Visualize**: seven rhinoplasty sliders tune a parameterized instruction. Instant on-device warp preview (works offline, no key needed). "Generate with AI" runs the identity-preserving edit server-side (Gemini primary, FLUX.1 Kontext fallback). Draggable before/after reveal, disclaimer burned into every output, params + assembled prompt stored for audit.
6. **Plan**: rhinoplasty template pre-fills milestones, medicines and follow-ups; living checklist with status flow Proposed -> Accepted -> In progress -> Done.
7. **Report**: three glassmorphic mint A4 sheets (cover, visualization, plan). Pre-composed surfaces so the printed PDF matches the screen exactly. Print/save via the browser.

## Quick start

```bash
npm install        # also copies MediaPipe WASM to /public (postinstall)
npm run dev        # http://localhost:3000
```

Sign in with a demo role (password for all: `contour`):

| Role | Email | Sees |
|---|---|---|
| Doctor | `doctor@meridian.clinic` | Full consultation workspace |
| Front Desk | `frontdesk@meridian.clinic` | Registration, queue, profiles, reports |
| Clinic Admin | `admin@meridian.clinic` | Everything + staff, templates, settings |

The app seeds a demo clinic (Meridian Aesthetics, Lahore) with three patients, photos, an open rhinoplasty consultation and an in-progress treatment plan on first load. Reset anytime from Settings -> Demo utilities.

## AI configuration (optional but recommended)

Copy `.env.example` to `.env.local` and set:

```
GEMINI_API_KEY=...            # https://aistudio.google.com/apikey
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
```

Without a key the visualization runs in **simulation mode**: the on-device landmark warp still gives a live preview, and the UI explains that photoreal AI is not configured. With a key, "Generate with AI" produces the photoreal healed result on the patient's actual photo.

Three providers are wired so you can run the model bake-off the knowledge base recommends (same rhinoplasty edit, same 3-4 faces, whichever holds identity best wins):

| Provider | Env | Best at |
|---|---|---|
| **Google Gemini** (Nano Banana / Pro) | `GEMINI_API_KEY` | Identity preservation — the recommended default for "same face, new nose" |
| **OpenAI GPT Image 2** | `OPENAI_API_KEY` | Complex spatial reasoning (profile balancing); sent with `input_fidelity=high` |
| **FLUX.1 Kontext** | `BFL_API_KEY` | Controllable instructed editing, self-hosting later |

Set `AI_PROVIDER` to `gemini` \| `openai` \| `flux` to force one for a like-for-like comparison; leave it blank to auto-detect (priority gemini -> openai -> flux, others as fallbacks). The layer is model-agnostic (`src/lib/server/providers.ts`); point `GEMINI_IMAGE_MODEL` at `gemini-3-pro-image` (Nano Banana Pro) or `OPENAI_IMAGE_MODEL` at `gpt-image-2` as your keys gain access.

The provider can also be switched at runtime from the app itself: **Settings -> AI generation** (admin role) selects Auto / Gemini / OpenAI / FLUX or **None**, which turns photoreal generation off clinic-wide and keeps the visualization fully on-device. The GUI shows which providers have keys configured on the server; keys themselves never reach the browser.

## Booth link (phone -> desktop handoff)

Register a patient on the booth phone; they appear on the booth laptop within ~5 seconds. Photos and consents travel through a demo-grade Vercel Blob inbox (`/api/booth/*`), merge into the receiving device's local store, and work with the 3D canvas and AI generation immediately. Turn on **Booth link** in the top nav on the receiving screen. Deleting a patient removes the server copies too, and inbox items self-expire after 24 hours.

Setup: Vercel -> Storage -> Create -> **Blob** -> connect to the project (this injects `BLOB_READ_WRITE_TOKEN`). Locally, with no token, a file-based inbox under `.booth-dev-store/` keeps the whole flow testable.

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel: **Add New Project** -> import the repo. Framework auto-detects as Next.js; no build settings needed (`postinstall` handles the WASM assets).
3. Add the environment variables from `.env.example` (at minimum `GEMINI_API_KEY` for live AI).
4. Storage -> Create -> Blob -> connect to the project (enables the booth link).
5. Deploy. The camera capture requires HTTPS, which Vercel provides by default.

## Stack

- **Next.js 16** (App Router, Turbopack) + TypeScript + Tailwind CSS v4
- **Three.js / react-three-fiber** for the 3D canvas
- **@mediapipe/tasks-vision** Face Landmarker, self-hosted WASM + model (offline-capable)
- **Zustand + IndexedDB** persistence (structured records in localStorage, images in IndexedDB) per the demo build plan; swap for Postgres + object storage without touching the UI
- **API route** `/api/generate` keeps model keys server-side (60s max duration for slow generations)

## Privacy & guardrails

- Photography consent is enforced in code before any capture or generation.
- Marketing use of images is gated on an explicit, separately recorded consent flag.
- Every AI output and report carries the disclaimer: "Illustrative AI visualization, not a guarantee of surgical outcome."
- Slider extremes are word-capped so instructions stay clinically plausible.
- Idle sessions auto-lock after 10 minutes (shared clinic devices).
- Demo auth is intentionally simple (seeded users, client-side session). Replace with real server auth before production use with real patient data.

## Handoff pack

- `CREDENTIALS.md`: demo URL slots + role logins
- `DEMO_SCRIPT.md`: the 4-minute booth walkthrough
- `SYSTEM.md`: architecture and module breakdown
- `BUILD_LOG.md`: build state, verified checklist, known limits
