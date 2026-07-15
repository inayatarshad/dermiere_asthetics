# Contour — Full System Evaluation & 5-Clinic Readiness

**Date:** 2026-07-15 · **Evaluator:** Claude (Opus 4.8) session · **Method:** build/typecheck/lint,
production build, live runtime testing on :3111 (login → dashboard → patient → API probes),
and three parallel code audits (tenancy, security/PHI, config/cost). Every claim below is
backed by executable code (file:line) or a runtime probe — not by docs.

---

## VERDICT

**Not ready for even one real clinic today, and structurally not ready for five.** The
clinical *product* is genuinely well-built and stable. What's missing is a single
architectural layer — a **server-verified trust boundary** — and everything that blocks
multi-clinic scale is a face of that one gap. This is an honest "the hard 80% is done, but
the missing 20% is the part that makes it safe to sell" situation.

If 5 real clinics onboarded tomorrow, with only the public URL an anonymous visitor could:
- dump **every clinic's** patient names, phones, procedure interests, and **face photos**
  (`curl` three open endpoints — confirmed HTTP 200 at runtime);
- drain the shared OpenAI/Gemini/Higgsfield wallet in a loop (`/api/generate` has no auth);
- and the five clinics' appointments, call logs, discovery leads, and even patient records
  (via booth ingestion) would cross-contaminate into each other's screens.

---

## WHAT WORKS (verified — do not re-harden)

| Area | Evidence |
|---|---|
| Build / typecheck / production build | `tsc --noEmit` exit 0; `next build` exit 0, 22 routes compiled |
| Boots & renders | Dev server clean; login → dashboard → patient detail all render; **zero** server errors in log |
| Core clinical product | Patient records (Fitzpatrick, allergies, consent, clinical flags), consultation, 3D canvas, reports, discovery portal — polished and coherent |
| Role gating (client) | Doctor correctly blocked from admin Analytics at runtime |
| SQL injection | Fully parameterized via Neon template tags (`db.ts`) — no injection |
| Secret hygiene in bundle | **No** `NEXT_PUBLIC_` on any secret; AI keys server-side only (`providers.ts:62-71`) |
| Provider abuse surface | Server-side model whitelist (`generate/route.ts:87`) — client can't hit arbitrary URLs |
| IDOR | All ids `crypto.randomUUID`; portal tokens `crypto.getRandomValues` 16-char (`portalStore.ts:312`) — not guessable |
| Secrets in git | `.env.local` gitignored (`.gitignore:34`); never committed (git history clean) |

The lint pass shows 44 `react-hooks/set-state-in-effect` errors — code-quality debt, **non-blocking** (build succeeds).

---

## WHAT BLOCKS 5 CLINICS

Every blocker below collapses into **one missing piece: a server-verified session that carries
`clinic_id`.** Fix that once and most of these close together.

### The three faces of the gap

**1. No server-side authentication.** "Login" is a client-side `localStorage` compare
(`store.ts:450-461`), shared password `"contour"`, no `middleware.ts`, no session cookie. Page
guards are `useEffect` redirects that run in the browser. The server never knows who is calling.

**2. No tenancy.** The **actual** Postgres schema (`db.ts:64-106`) has **no `clinic_id` column**
on any of the five tables, and every query is an unscoped `SELECT payload FROM … ORDER BY …`.
(The `clinic_id default 'meridian'` schema in `SCALABILITY_ROADMAP.md` was **never applied** —
it is documentation fiction; the code is what runs.) `clinic_id` exists only as an inert field
on three client types plus a random per-device UUID.

**3. No cost control.** `/api/generate` and `/api/assessment/skin` call paid providers with **no
auth, no rate limit, no per-clinic quota, and no attribution**. The only usage counter is a
cosmetic client-side estimate. The owner cannot tell which clinic spent what.

### CRITICAL (confirmed at runtime)

| # | Finding | Proof |
|---|---|---|
| C1 | 3 unauthenticated GETs dump all-clinic PHI (names, phones, procedure interest, **faces**) | `GET /api/booth/pull`, `/api/vybero/appointments`, `/api/vybero/call-log` → **HTTP 200** unauth |
| C2 | Anonymous AI-spend: attacker loops `/api/generate` to drain the wallet | Empty POST → 400 on *validation only*; no 401/403 gate before the paid call (`generate/route.ts:36-105`) |
| C3 | Auth is entirely client-side; no `middleware.ts`; direct nav renders on a browser-set flag | `store.ts:450-461`, `(clinic)/layout.tsx:29-31` |
| H1 | All clinics share one global dataset (no `clinic_id`, no scoping) | `db.ts:127,147,169` |

### HIGH

- **H2** — Writes gated only by a spoofable `Origin` header (`vybero/book`, `portal/invites`) or
  nothing at all (`booth/push`): forged appointments, junk-data / storage-cost DoS.
- **H3** — `GET /api/portal/invites` leaks the entire BD pipeline (prospect clinics' WhatsApp,
  budget, pain points) behind only the spoofable same-origin check.
- **H4** — `DELETE /api/booth/:id` unauthenticated — anyone deletes a patient's pending handoff.

### MEDIUM / config blockers

- Onboarding clinic #2 is a **code change + new deployment**, not config: Meridian is hardcoded
  in `seed.ts` (name, city, contacts, 3 fake patients, `@meridian.clinic` logins); treatment
  **menu + prices** hardcoded in `templates.ts` (Settings is read-only accordion + one botox
  price to `localStorage`); one shared `VYBERO_API_KEY`; no logo/brand-color field; no
  provisioning script or admin route.
- Rotate the Neon + Higgsfield credentials before go-live (currently that one DB URL is the
  *only* thing between the world and all-tenant data).
- Even for **one** clinic: patient records live only in per-device `localStorage`/IndexedDB, so
  a clinic's own two rooms/devices don't share a patient list and data is lost on cache clear.

---

## REMEDIATION PLAN (phased, to real 5-clinic SaaS)

**Phase 1 — The trust boundary (closes C1/C2/C3/H1/H2/H3/H4 together). ~1–1.5 wks.**
1. Server auth: signed HTTP-only session cookie, verified in a new `middleware.ts` + per API
   route. Retire the client-only login and the shared `"contour"` password.
2. Add `clinic_id NOT NULL` to all five tables; add `(clinic_id, …)` indexes; scope **every**
   query with `WHERE clinic_id = …`; set it on every insert. Thread `clinicId` through
   `boothStore` / `vyberoStore` / `portalStore` and every route from the session.
3. Auth-gate the open GETs; real auth (not `Origin`) on writes; `timingSafeEqual` for agent key.

**Phase 2 — Cost control & metering. ~3 days.**
4. Attach `clinic_id` to `/api/generate` + `/api/assessment/skin`; add a Neon `usage` table;
   enforce per-clinic monthly caps + per-IP rate limits **before** the provider call; surface
   per-clinic spend in admin.

**Phase 3 — Real per-clinic config. ~1 wk.**
5. `clinics` table (name, logo, brand color, hours, VYBERO agent id, booking URL) + per-clinic
   **treatment menu + price list** persisted server-side; Settings writes there, not
   `localStorage`. Gate/parameterize the Meridian seed so new clinics don't inherit fake data.
6. Move patient/consult/asset records to clinic-scoped server tables (so a clinic's own devices
   share records). Per-clinic branding in reports.

**Phase 4 — Provisioning & hardening. ~3 days.**
7. `create-clinic` admin flow / script (target < 1 hr/clinic); Blob photos forced private +
   clinic-scoped paths; rotate credentials; backups + monitoring.

**Rough total: ~3–4 focused weeks** to safe, self-serve 5-clinic scale. Phase 1 alone is the
gate for onboarding even the *first* paying clinic.

---

## OPEN DECISION (owner)

**Tenancy model** drives the whole Phase 1 design:
- **A. Single deployment + session-scoped `clinic_id`** (one app, clinic from login/subdomain) —
  cheapest to run, true SaaS, needs the auth+scoping work above. **Recommended.**
- **B. Subdomain per clinic** (`clinicA.contour.app`) on one deployment — same code, nicer
  per-clinic branding/URLs; still needs A's scoping.
- **C. Deployment per clinic** (fork env per clinic) — fastest to 2–3 clinics with least code,
  but multiplies ops and doesn't scale to a real product; the current de-facto path.
