# VYBERO Voice Agent (ElevenLabs) → CAPTURE Calendar

The corrected, canonical wiring guide — supersedes the draft
`ElevenLabs_Booking_Calendar_Setup.md`. The endpoints below **exist and
are live in this app**; the payloads are exactly what the server accepts,
so you can paste this straight into ElevenLabs.

What changed vs the draft: real URLs (`/api/vybero/*`, not
`/api/bookings`), both auth header styles accepted, a real
`get_current_time` endpoint, hours corrected (Mon–Sat **10:00–19:00**
from clinic config, not 9–18), treatment names map server-side, and
Pakistan-time handling is explicit (a UTC server can never shift a 4 PM
booking to 9 PM).

---

## 0. Prerequisites

- The app deployed over HTTPS (ElevenLabs requires it). Locally you can
  test the endpoints with curl, but the agent itself needs a public URL.
- `VYBERO_API_KEY` set in the deployment env — any strong random string.
  Store the same value in **ElevenLabs → Agent → Secrets**.
- `TZ=Asia/Karachi` set in the deployment env (Vercel → Environment
  Variables). Bookings are timezone-pinned either way, but the slot grid
  is computed in server-local time — this keeps it in clinic time.
- In the app: **VYBERO page → Webhook setup** (admin) shows these same
  URLs with your real origin filled in, with copy buttons.

## 1. The three webhook tools

Create each under **Agent → Tools → Add tool → Webhook**.

### Tool 1 — `get_current_time`
- **GET** `https://YOUR-DEPLOYMENT/api/vybero/time`
- No auth. Returns:
```json
{ "iso": "2026-07-18T05:12:00.000Z", "date": "2026-07-18", "time": "10:12", "day": "Saturday", "timezone": "Asia/Karachi" }
```
- Description for the LLM: "Returns the current date, weekday and time in
  Pakistan. Call FIRST whenever the caller says a relative day like
  today, tomorrow, or a weekday name."

### Tool 2 — `check_availability`
- **GET** `https://YOUR-DEPLOYMENT/api/vybero/availability?date={date}`
- **Query param** `date` (string, required): "Appointment date in
  YYYY-MM-DD format."
- **Header:** `Authorization: Bearer <VYBERO_API_KEY>`
  (the classic `x-vybero-key: <key>` also works)
- Description: "Returns the open appointment slots for a given date.
  Always call before offering or confirming a time."
- Returns:
```json
{
  "date": "2026-07-25",
  "closed": false,
  "open_slots": ["10:00", "11:30", "16:00", "17:30"],
  "hours": { "open": "10:00", "close": "19:00", "slot_min": 30, "days": [1,2,3,4,5,6] }
}
```
- `open_slots` are Pakistan wall-clock times — read them to the caller
  as-is. `closed: true` + empty `open_slots` means closed that day
  (Sundays) or fully booked.

### Tool 3 — `book_appointment`
- **POST** `https://YOUR-DEPLOYMENT/api/vybero/book`
- **Header:** `Authorization: Bearer <VYBERO_API_KEY>` (or `x-vybero-key`)
- Description: "Creates a confirmed appointment. Call ONLY after
  check_availability confirmed the slot and the caller said yes to the
  read-back."
- **Body parameters** (define each in the tool so the LLM fills them):

| Parameter | Type | Required | Description for the LLM |
|---|---|---|---|
| `customer_name` | string | yes | Customer's full name, as given. |
| `phone` | string | yes | Phone/WhatsApp number, digits, e.g. 03091234567. |
| `treatment` | string | yes | One of: MitoRedLight Regenerative Glow, Exomere Body Contour, Exomere Face Contour, Exomere Face Implant Regimen, Exomere Regeneration Regimen, MitoRedLight Full Body Reset, Consultation. |
| `date` | string | yes | YYYY-MM-DD. |
| `time` | string | yes | 24-hour HH:MM, Pakistan time, from open_slots. |
| `notes` | string | no | Skin concern or anything the customer mentioned. |
| `email` | string | no | For an emailed confirmation. |
| `location` | string | no | Experience Centre (default), The Skin Clinic, Alta Derm, or Experts. |

- **Success** (agent reads `message` back):
```json
{
  "status": "confirmed",
  "booking_id": "CAP-9F3A21D0",
  "message": "Booked Exomere Face Contour for Ayesha Khan, 16:00 on Saturday 25 July, at the Experience Centre."
}
```
- **Slot clash** (HTTP 200 — the agent must offer the alternatives, not
  report a failure):
```json
{
  "status": "unavailable",
  "message": "That time was just taken. Nearest open times: 15:30, 16:30, 17:00.",
  "alternatives": ["15:30", "16:30", "17:00"]
}
```
- Treatment names are matched server-side (close wording still works;
  unknown wording books a 30-min consultation rather than failing the
  call). The treatment sets the real duration: Glow 75 min, Body Contour
  60, Face Contour 60, Skin Implant 50, Regeneration 50, Full Body
  Reset 90, Consultation 30.

## 2. Optional Tool 4 — `log_call` (fills the Analytics dashboard)

At the end of each call (or via your post-call automation), POST the
call record so Analytics and the VYBERO page show real call history:

- **POST** `https://YOUR-DEPLOYMENT/api/vybero/call-log` — same auth.
- Body: `started_at` (ISO, required), `outcome` (required: booked | info |
  callback | transferred | missed), and optionally `duration_secs`,
  `caller_name`, `caller_phone`, `language`, `topics` (string array),
  `questions` (string array), `summary`, `appointment_id`, `rating` (1–5).

## 3. Multi-clinic note (partner locations later)

This deployment is single-clinic, so no clinic header is needed — the
server resolves it automatically. If more clinics are ever provisioned,
add the header `x-clinic: capture` (the clinic slug) to Tools 2–4.

## 4. Where things show up in the app

- **Calendar** — the booking lands in the diary of the location booked
  (default Experience Centre) within ~45 seconds on open screens.
- **VYBERO page** (nav → VYBERO) — the team can call Noor via the
  embedded widget (admin pastes the ElevenLabs agent id once), watch
  voice bookings appear live, and copy this webhook config.
- **Analytics** — call volume, topics, outcomes (from Tool 4 logs).

## 5. Test checklist

- [ ] `curl https://YOUR-DEPLOYMENT/api/vybero/time` → today's Pakistan date.
- [ ] `curl -H "Authorization: Bearer $KEY" ".../api/vybero/availability?date=2026-07-25"` → `open_slots`.
- [ ] POST the Section-1 example body → `status: "confirmed"` and the
      appointment visible on the Calendar + VYBERO page.
- [ ] Book the same slot again → `status: "unavailable"` + alternatives.
- [ ] Wrong bearer token → 401 (in production with `VYBERO_API_KEY` set).
- [ ] Say "book me the face contour tomorrow at 4" to Noor → she calls
      get_current_time → check_availability → book_appointment, reads the
      confirmation back, and the event appears on the calendar.
- [ ] Ask for a Sunday → `closed: true` → she declines gently, offers Mon–Sat.
- [ ] Kill the endpoint → she does NOT claim success; offers the WhatsApp
      fallback (+92 309 4442031).

## 6. Model + prompting notes (unchanged from the draft — both correct)

- Use a high-intelligence LLM for the agent so dates/parameters extract
  cleanly.
- The system prompt should instruct: always check availability before
  offering times; read the full booking back and get a yes before
  calling book_appointment; never invent a confirmation if the tool
  fails; hours are Monday–Saturday 10:00–19:00, closed Sunday.
