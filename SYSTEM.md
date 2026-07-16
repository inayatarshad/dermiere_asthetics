# CAPTURE Clinic OS · System Documentation

Client-safe technical overview of the CAPTURE clinic operating system —
the platform that carries a client from VYBERO's first hello to the
Capture Circle reward, across all four Lahore locations.

## What it is

One web application for the whole clinic journey:

```
Book (VYBERO web/WhatsApp)
  → Check-in + MARK-VU skin analysis
    → Consultation + Before/After Visualization Studio
      → Treatment
        → Point of Sale + printed A4 invoice
          → Review link (WhatsApp)
            → Reviews monitoring dashboard
              → Capture Circle reward → redeemed at POS
                → Retention (re-book via VYBERO)
```

## Module × Role matrix

| Capability | Front Desk | Doctor | Admin (Ops/Marketing) |
|---|---|---|---|
| Register clients, consent + photos | Yes | Yes | Yes |
| Patient profiles + MARK-VU scans | Yes | Yes | Yes |
| Calendar (per-location diaries) | Yes | Yes | Yes |
| Run consultation (brief, 3D canvas, AI, plan) | No | Yes | Yes |
| Visualization Studio (glow / body contour) | Yes | Yes | Yes |
| Point of Sale + invoices + reward redemption | Yes | No | Yes |
| Send review links | Yes (POS) | Yes | Yes |
| Reviews monitoring dashboard | No | Yes | Yes |
| VYBERO analytics + AI spend | No | No | Yes |
| Discovery (partner-clinic onboarding) | No | No | Yes |
| Staff, settings, branding, prices | No | No | Yes |

Enforced by the server session (JWT cookie, role claims), route middleware
and per-route guards. Sessions auto-lock after 10 minutes idle.

## The five CAPTURE modules

1. **VYBERO concierge** — public chat on the landing page (and WhatsApp in
   production). Deterministic knowledge-base engine: treatments, prices,
   locations, hours, aftercare, EXOMERE/MitoRedLight science, safety.
   Books real appointments against live availability; every conversation
   lands in the call log that feeds Analytics. No AI key required — an
   LLM can be layered on the same engine without changing the logic.
2. **Visualization Studio** — before/after previews for the two signature
   families: MitoRedLight glow (radiance/tone/texture/warmth) and Exomere
   body contour (region pinch-warp + firmness across abdomen/waist/hips/
   thighs/arms). Renders on-device (no key needed); optional photoreal AI
   pass via Gemini/OpenAI/FLUX/Higgsfield. Every output carries the
   "illustrative preview, not a guarantee" watermark. Saves to the client
   photo timeline.
3. **Point of Sale** — cart from the CAPTURE catalogue (6 treatments, 25
   retail products/regimens at real capture.cc prices), client-record
   linking, Capture Circle code validation and redemption, configurable
   sales tax (default 16%), cash/card record-only payment, per-location
   invoice numbering (EC/SC/AD/EX prefixes), print-ready A4 letterhead
   invoice.
4. **Reviews + Capture Circle** — per-visit token links (WhatsApp), a
   branded public review page (stars, highlights, comment), instant
   reward issuance shown on the thank-you screen, and a monitoring
   dashboard: average, trend, by-location/by-treatment breakdowns,
   low-score follow-up flags, invite funnel, reward economy.
5. **MARK-VU integration** — the intake scanner's six metrics recorded per
   visit (manual entry mirrors the device report; scan sheet photo
   attaches as evidence), tracked across scans with deltas on the client
   profile.

Plus the full Contour engine underneath: 27 aesthetic procedure templates,
3D face canvas (MediaPipe + three.js), consultation workspace, printed
reports and consent packs, assessment letterhead, booth phone→desktop
handoff, and the Discovery portal for partner-clinic onboarding.

## Architecture

```
[ Browser (clinic devices + public pages) ]
  Next.js 16 (React 19, Tailwind v4 — CAPTURE Noir & Champagne tokens, Jost type)
  ├─ Clinic app: zustand store hydrated from server bootstrap; write-through
  │   diff sync to /api/records (clinic-scoped)
  ├─ Studio renderers: on-device canvas (glow passes, elliptical pinch warp)
  ├─ 3D canvas: react-three-fiber + MediaPipe Face Landmarker (self-hosted)
  └─ Public surfaces: landing + VYBERO widget, /review/[token], /invoice/[id],
      /report, /assessment, /portal — zero-login, token capabilities

[ Server (Next.js route handlers) ]
  ├─ Auth: scrypt passwords, JWT session cookie, edge middleware perimeter
  ├─ Tenant boundary: every query filtered by clinic_id
  ├─ Stores: clinic/users, records (patients…invoices, rewards,
  │   skin_analyses), appointments+calls, review invites+reviews
  ├─ VYBERO chat engine (KB + slot-filling booking, per-IP rate limits)
  └─ AI providers: Gemini / OpenAI / FLUX / Higgsfield behind aiGuard
      (per-clinic monthly caps + metering)

[ Storage ]
  Production: Postgres (Neon) — one jsonb row store per collection
  Local/demo: file-backed dev database (.dev-db/) — zero infrastructure,
  identical behavior through the same data layer
```

## Multi-location

CAPTURE is one tenant with four locations (Experience Centre + three
partner clinics). Locations live in the clinic config; appointments,
invoices and reviews are tagged per location, so calendars filter per
site, invoices carry the right letterhead + numbering, and the reviews
dashboard breaks scores down per location. Partner clinic #5 onboards
through the Discovery portal.

## Brand safety

- Every visualization output is watermarked "Illustrative preview of an
  expected outcome, not a guarantee of results."
- Strengths-first language throughout; no scorecards of flaws.
- Payments are recorded, never processed — the card terminal stays the
  merchant of record.
- Patient photos live device-local (IndexedDB); shared records are
  clinic-scoped rows behind the session.

## Deployment

- `npm run build && npm run start` — production build verified green.
- Local demo needs nothing else (file-backed store, deterministic seed).
- Production: set `DATABASE_URL` (fresh Neon project for CAPTURE),
  `SESSION_SECRET`, optional AI keys, `VYBERO_API_KEY` for the phone
  agent. Deploy as a NEW Vercel project — never over the Contour
  production deployment.
