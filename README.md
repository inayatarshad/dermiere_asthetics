# CAPTURE · Clinic OS

The operating system for **CAPTURE (Capture Beauty / Don Valley Pharmaceuticals)** —
the intimate science of beauty. One system carries a client from VYBERO's
first hello to the Capture Circle reward, across the Experience Centre and
the three partner clinics.

```
Book (VYBERO) → Check-in + MARK-VU → Consultation + Visualization Studio
   → Treatment → Point of Sale + A4 invoice → Review link → Monitoring
      → Capture Circle reward → redeemed at POS → re-book
```

Built on the Contour engine (3D face canvas, 27 aesthetic procedure
templates, AI before/after, printed reports and consent packs, booth
handoff, partner-discovery portal) and extended for CAPTURE with:

- **VYBERO web concierge** — public chat that answers CAPTURE questions
  (treatments, prices, locations, aftercare, EXOMERE/MitoRedLight science)
  and books real appointments against live availability. Deterministic
  knowledge-base engine: zero API keys can fail on demo day.
- **Visualization Studio** — red-light glow and body-contour before/after
  previews rendered live on-device, with an optional photoreal AI pass.
  Every output is watermarked as an illustrative preview.
- **Point of Sale** — CAPTURE catalogue (6 treatments, 25 retail items at
  real capture.cc prices), Capture Circle redemption, 16% sales tax,
  per-location invoice numbering, print-exact **A4 letterhead invoice**.
- **Reviews + Capture Circle** — per-visit WhatsApp review links, branded
  public review page, instant reward issuance, and a monitoring dashboard
  (trend, by-location, by-treatment, low-score follow-up flags, funnel).
- **MARK-VU integration** — the intake scanner's metrics on the client
  record, tracked across visits with deltas.
- **Multi-location** — per-site diaries, invoices and review breakdowns
  for the Experience Centre + Dr. Haroon Nabi, Dr. Nazia and
  Dr. Ashba Cheema's clinics.

## Quick start

```bash
npm install                     # also copies MediaPipe WASM (postinstall)
npm run build
npm run start -- -p 3210        # http://localhost:3210
```

No database needed locally: a file-backed dev store (`.dev-db/`) runs the
full system and seeds the CAPTURE demo on first login. (Dev-mode note:
`next dev` with Turbopack has crash-looped on some Windows machines; the
production build path above is the verified way to run the demo.)

Sign in (password for all: `capture`):

| Role | Email | Sees |
|---|---|---|
| Medical Director | `dr.sadia@capture.cc` | Consultations, MARK-VU, Studio, Reviews |
| Front Desk | `frontdesk@capture.cc` | Registration, calendar, **Point of Sale** |
| Operations (admin) | `shahrukh@capture.cc` | Everything + Analytics, Discovery, Settings |
| Marketing (admin) | `rameez@capture.cc` | Everything — review/call insights focus |
| Creative (front desk) | `ryan@capture.cc` | Front-of-house view |

The **VYBERO concierge** floats on the landing page — no login needed.
Reset the demo: delete `.dev-db/` and restart; the seed rebuilds.

## AI configuration (optional)

Copy `.env.example` to `.env.local`. Everything works keyless (on-device
rendering, simulation mode); keys unlock the photoreal pass:

| Provider | Env | Best at |
|---|---|---|
| **Google Gemini** | `GEMINI_API_KEY` | Identity preservation (recommended default) |
| **OpenAI GPT Image** | `OPENAI_API_KEY` | Complex spatial reasoning |
| **FLUX.1 Kontext** | `BFL_API_KEY` | Controllable instructed editing |
| **Higgsfield Cloud** | `HIGGSFIELD_API_KEY` + `_SECRET` | Reference-guided renders |

Runtime switching: **Settings → AI generation** (admin). Keys never reach
the browser. Per-clinic monthly caps + usage metering guard the spend.

## Deploy to Vercel (production)

1. Push this folder to its own GitHub repository.
2. Vercel → **Add New Project** → import. **Do not deploy over the Contour
   production project** — CAPTURE gets its own project + domain.
3. Provision a **fresh Neon Postgres** for CAPTURE and set `DATABASE_URL`;
   set `SESSION_SECRET` and `PLATFORM_ADMIN_KEY`; optionally AI keys and
   `VYBERO_API_KEY`.
4. Deploy. First login seeds the CAPTURE demo clinic (only on an empty
   database). **For a real-data deployment set `SEED_DEMO=false`** and
   provision clean clinics via `/api/admin/provision` — demo patients can
   then never mix with client records.
5. Rotate every seeded password on day one: Settings → Staff → Reset
   password.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS v4 — CAPTURE
  "Noir & Champagne" design tokens (Jost type, charcoal + champagne gold)
- **Three.js / react-three-fiber** + **MediaPipe Face Landmarker** (self-hosted)
- **Zustand + IndexedDB** on-device; **Postgres (Neon)** system of record,
  file-backed dev twin locally — same data layer, zero-infra demos
- Server auth: scrypt + JWT session cookie + edge middleware perimeter;
  every query clinic-scoped

## Privacy & guardrails

- Photography consent enforced in code before any capture or generation.
- Every visualization output carries: *"Illustrative preview of an
  expected outcome, not a guarantee of results."*
- Payments are recorded, never processed — the terminal stays the
  merchant of record.
- Review submissions are rate-limited, honeypotted and server-validated;
  reward codes are single-redemption, server-checked at POS.
- Idle sessions auto-lock after 10 minutes (shared clinic devices).

## Handoff pack

- `CREDENTIALS.md` — logins, locations, seeded story, live reward codes
- `DEMO_SCRIPT.md` — the 5-minute CAPTURE walkthrough
- `SYSTEM.md` — architecture and module × role breakdown
- `BUILD_LOG.md` — build state, verified checklist, known limits
