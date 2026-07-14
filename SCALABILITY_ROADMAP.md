# Contour — Scalability Roadmap (10 clinics in 30 days)

Owner: H (TechGIS) · Written 2026-07-14 · Companion to BUILD_LOG.md and
`Contour-AI-Aesthetic-Report-Module-SPEC.md` (Mythos vault).

The demo architecture (localStorage + one Vercel Blob store) is deliberate
booth-grade engineering. This document is the honest path from "one booth"
to "ten paying clinics," with what each step costs.

---

## Phase 0 — DONE (this build)
- **Blob operation explosion fixed.** Root cause: pollers cost
  `1 list + N reads` per tick (booth every 4s, sync every 20s) — ~30–50k
  operations/day from idle screens, against a 2k quota. Now: every JSON
  collection is ONE blob (1 read/poll, zero lists), booth polls 10s,
  sync 45s, hidden tabs skip entirely. Expected: **< 4k ops/day** with
  screens open all day; near zero overnight.
- Capture quality gate (face size / centering / exposure graded on every
  shot) so bad photos are caught at the camera, not at the 3D fit.

## Phase 1 — External database — DONE 2026-07-14 (Neon connected, all collections migrated)
The single-blob interim still has one weakness: two simultaneous writers
can lose an update, and Blob has no queries. The fix is Postgres.

**Action (owner, ~5 min):** Vercel dashboard → Storage → Create Database →
**Neon Postgres** (or Supabase — the VYBERO Analytics stack already uses
Supabase, so team familiarity argues for it). Connect to the `aesthetics`
project; Vercel injects `POSTGRES_URL`. Say the word and the driver gets
wired the same day.

**Schema (ready to apply):**
```sql
create table appointments (
  id uuid primary key, clinic_id text not null default 'meridian',
  patient_name text not null, phone text, start_at timestamptz not null,
  duration_min int not null, type text, procedure_interest text,
  source text, status text, notes text, vybero_call_id text,
  created_at timestamptz, updated_at timestamptz
);
create index on appointments (clinic_id, start_at);
create table vybero_calls (
  id uuid primary key, clinic_id text not null default 'meridian',
  started_at timestamptz not null, duration_secs int, direction text,
  caller_name text, caller_phone text, language text, outcome text,
  topics jsonb, questions jsonb, summary text, appointment_id uuid,
  rating int
);
create table booth_items (
  id text primary key, clinic_id text not null default 'meridian',
  payload jsonb not null, created_at timestamptz not null
);
```
Photos stay on Blob (binary belongs there); every JSON record moves to
Postgres. The storage layer (`vyberoStore.ts` / `boothStore.ts`) already
isolates this behind small functions — the swap does not touch UI code.

## Phase 2 — Multi-tenancy (weeks 1–2)
- `clinic_id` on every row (schema above already carries it).
- Clinic config table: name, logo URL, brand color, booking link, treatment
  menu (which templates are on), clinic hours, VYBERO agent id.
- Env secrets stay platform-level (one OpenAI/Gemini key serves all
  clinics); per-clinic budgets enforced in the generate route (simple
  monthly counter per clinic_id in Postgres).
- Patient records remain per-device/local in the demo tier; clinics that
  sign move to Postgres-backed patients (same store interface, second
  driver — the post-IPAAC backend step BUILD_LOG has always flagged).

## Phase 3 — Provisioning playbook (repeatable per clinic, target < 1 hour)
1. Vercel project from the same repo (or same deployment + clinic_id
   routing — start with ONE deployment, clinic picked by subdomain).
2. Insert clinic row (branding tokens: logo, color, name, booking URL).
3. Create the clinic's VYBERO agent (ElevenLabs) → set its tools to
   `GET /api/vybero/availability` + `POST /api/vybero/book` +
   `POST /api/vybero/call-log` with the clinic's `VYBERO_API_KEY`.
4. Load their treatment menu + prices (Settings).
5. Assessment Report widget link for their Instagram bio.
6. 30-minute staff walkthrough (DEMO_SCRIPT.md is the base).

## Phase 4 — Hardening (weeks 3–4)
- Auth: real accounts (Supabase Auth or NextAuth) replacing demo logins.
- Backups: Neon/Supabase point-in-time recovery (included in paid tiers).
- Monitoring: Vercel Analytics + a daily cost cron that posts per-clinic
  AI spend to the admin Analytics page (counters already exist).
- Fitzpatrick I–VI validation set for the Assessment Report (spec §7).

---

## Cost model (display these in Finances)

### Per-unit AI costs
| Unit | Engine | Est. cost |
|---|---|---|
| Assessment report (skin vision) | GPT-4o vision call | **~$0.01** |
| Assessment report (geometry + layout) | on-device / our code | $0.00 |
| Photoreal visualization | Gemini flash image | ~$0.04 |
| Photoreal visualization | GPT-Image (high) | ~$0.17 |
| Photoreal visualization | Higgsfield Reve Edit | ~$0.09–0.19 (credits) |
| VYBERO call (voice) | ElevenLabs conversational | ~$0.08–0.12/min |

### Per-clinic monthly (at ~200 assessments, ~100 visualizations, ~300 call-min)
| Line | Est./month |
|---|---|
| AI: assessments (200 × $0.01) | $2 |
| AI: visualizations (100 × ~$0.06 avg) | $6 |
| VYBERO voice minutes (300 × ~$0.10) | $30 |
| Postgres share (Neon Launch $19 covers ~10 clinics) | ~$2 |
| Blob storage + ops (photos only after Phase 1) | ~$1 |
| Vercel Pro share ($20 covers all clinics until traffic grows) | ~$2 |
| **Total infra + AI per clinic** | **≈ $43/month** |

Platform fixed costs: Vercel Pro $20 + Neon $19 + domain ≈ **$40/month**
regardless of clinic count. Ten clinics ≈ **$470/month all-in** at the
usage above — price the offering accordingly (the free Assessment Report
is the wedge; VYBERO + platform subscription is the revenue).

### The two costs that scale with success
1. **Voice minutes** (VYBERO) — meter per clinic, pass through or bundle.
2. **Photoreal generations** — cap per clinic per month (route-level
   counter), sell top-ups.

---

## Owner checklist (in order)
- [ ] Provision Neon/Supabase Postgres on the Vercel project (Phase 1 — 5 min)
- [ ] Provide the OpenAI key (lights up Assessment skin analysis + GPT-Image)
- [ ] Top up Higgsfield API wallet OR settle on Gemini/OpenAI for images
- [ ] Set `VYBERO_API_KEY` env for the first real agent
- [ ] Lock the first clinic's treatment menu + branding tokens (Dr Omer)
