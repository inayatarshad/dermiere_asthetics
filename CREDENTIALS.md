# CAPTURE Clinic OS · Demo Credentials

**Live URL:** _add after Vercel deploy (new project — do NOT deploy over the Contour production project)_
**Local:** `npm run build && npm run start -- -p 3210` → http://localhost:3210
**Storage:** runs with zero infrastructure locally (file-backed dev database in `.dev-db/`); set `DATABASE_URL` (fresh Neon for CAPTURE) in production.

Shared demo password for all roles: `capture`

| Role | Email | What they see |
|---|---|---|
| **Medical Director** | dr.sadia@capture.cc | Dashboard, patients + MARK-VU, consultations, Visualization Studio, calendar, Reviews monitoring. |
| **Front Desk** | frontdesk@capture.cc | Check-in + registration, calendar, **Point of Sale** (invoices, Capture Circle redemption, review links). |
| **Operations (admin)** | shahrukh@capture.cc | Everything: all four locations, Analytics (VYBERO calls + AI spend), Reviews, Discovery (partner onboarding), Settings. |
| **Marketing (admin)** | rameez@capture.cc | Same as Operations — story focus: review scores, call insights, Capture Circle performance. |
| **Creative (front desk)** | ryan@capture.cc | Front-of-house view for content days: patients, gallery, calendar, POS. |

The public **VYBERO concierge** chat floats on the landing page — no login needed. It answers CAPTURE questions (treatments, prices, locations, aftercare, EXOMERE science) and books real appointments into the calendar.

## The four locations

| Location | Kind | Invoice prefix |
|---|---|---|
| CAPTURE Experience Centre — Vogue Towers, M.M. Alam Road | Owned | EC |
| The Skin Clinic by Dr. Haroon Nabi — Ghalib Road, Gulberg III | Partner | SC |
| Alta Derm by Dr. Nazia — M.M. Alam Road | Partner | AD |
| Experts by Dr. Ashba Cheema — DHA Broadway | Partner | EX |

## Seeded demo story

| Client | Story |
|---|---|
| **Mahnoor Baig** (27, Lahore) | Bridal glow journey: MitoRedLight Regenerative Glow course, session 3 today. Two MARK-VU scans show pigmentation −14, moisture +17. Photo on record → run the **Visualization Studio glow preset** on her. |
| **Zainab Qureshi** (24, Islamabad) | EXOMERE Skin Implant course (post-acne), session 4 booked. MARK-VU pores −14. Two 5★ reviews. |
| **Hassan Raza** (32, Karachi) | Booked via VYBERO. Full Body Reset for training recovery + sleep. 4★ review, reward redeemed. |
| **Amina Shahid** (34, Lahore) | Post-partum Body Contour, 2 sessions done. Her 5★ review issued a **Capture Circle code that is still unredeemed — use it live at POS**. |
| **Zara Iqbal** (41, Lahore) | Face Contour consult **open today** (jawline + pigmentation), MARK-VU baseline, invoice paid this morning. |
| **Bilal Chaudhry** (38, Lahore) | Regeneration session; left a 3★ review (waiting time) → shows the **follow-up flag** on the Reviews dashboard. |

Plus ~24 more reviews across all four locations (avg ≈ 4.6), ~20 invoices over 3 weeks, ~45 VYBERO calls over 14 days, and a full appointment book.

To find Amina's live redemption code: Reviews dashboard → or open `.dev-db/data.json` and search `"CIRCLE-`; any reward with `"status":"issued"` works at POS.

Sessions auto-lock after 10 minutes of inactivity. Reset demo data: delete `.dev-db/` and restart (the seed rebuilds on first login).

## AI generation

Photoreal enhancement activates when `GEMINI_API_KEY` (or OpenAI/FLUX/Higgsfield keys) is set — see `.env.example`. Without any key the Studio still renders live glow/contour previews on-device and every consultation warp works; the UI says photoreal AI is not configured. Demo never blocks on a key.
