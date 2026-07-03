# Star Fighter · Demo Credentials

**Live URL:** _add after Vercel deploy_
**Local:** http://localhost:3000

Shared demo password for all roles: `starfighter`

| Role | Email | What they see |
|---|---|---|
| **Doctor** | doctor@meridian.clinic | Dashboard + queue with Start/Resume consultation. Full workspace: Brief, 3D Canvas, AI Visualize, Plan, Report. |
| **Front Desk** | frontdesk@meridian.clinic | Dashboard + queue (view only), patient registration with consent + photo capture, profiles, report export. Consultation tools are locked (doctor-only). |
| **Clinic Admin** | admin@meridian.clinic | Everything the doctor sees, plus Settings: staff management, treatment templates, clinic branding, demo reset. |

## Seeded demo data (Meridian Aesthetics, Lahore)

| Patient | Story |
|---|---|
| **Mahnoor Baig** (27, Lahore) | Today's hero. Open rhinoplasty consultation with the brief pre-filled ("soften the bump on my bridge") and a front photo ready for the canvas and AI. Marketing consent granted. |
| **Hassan Raza** (32, Karachi) | Booked via the Vibro voice agent, waiting in today's queue. Marketing consent declined (shows consent gating). Penicillin allergy on record. |
| **Zainab Qureshi** (24, Islamabad) | Consultation completed three weeks ago; rhinoplasty plan in progress with the first milestones ticked. Shows the treatment-tracking story. |

Sessions auto-lock after 10 minutes of inactivity (patient privacy on shared devices). Reset all demo data anytime: sign in as Admin -> Settings -> Demo utilities -> Reset demo.

## AI generation

Photoreal generation activates when `GEMINI_API_KEY` is set in the environment (see `.env.example`). Without it the app runs in simulation mode: the live on-device preview still works and the UI says photoreal AI is not configured.
