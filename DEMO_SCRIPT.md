# Star Fighter · 4-Minute Demo Script (IPAAC booth walkthrough)

The narrative from the demo build plan, click by click. Run it on repeat. Total time: about 4 minutes.

## Before the demo (once)

1. Open the live URL (or localhost), sign in as **Doctor** (one tap on the Doctor card).
2. If a previous run left data behind: Admin -> Settings -> Reset demo, then sign back in as Doctor.
3. Confirm `GEMINI_API_KEY` is configured if you want live photoreal generation. Without it, the live preview still performs; the photoreal pass is the encore.

## Beat 1: "Meet your patient" (30s)

- From the Dashboard, point at **Today's queue**: "Front desk registers, captures consent and photos, and queues patients. The doctor picks them up here."
- Click **Mahnoor Baig** in Recent patients. Walk the profile header: photo, tags, consent chips.
- Read her goal out loud from Latest consultation: *"I'd love to soften the bump on my bridge and have a slightly more refined tip."*
- Click **Resume consultation**.

## Beat 2: "Here's their face in 3D" (45s)

- The Brief step is already filled: "One structured selection arms the whole consultation: canvas, AI preset, plan template."
- Click **3D Canvas**. The face fits automatically from her front photo.
- Orbit the head slowly. Zoom in on the nose.
- Drag the **Bridge / hump** morph handle down a touch: "Watch the bridge respond. These are semantic controls, not raw mesh editing."
- Optional if time: draw a quick annotation along the dorsum with the pen tool. It sticks to the face as you rotate.
- Click **Generate AI preview** (top right card). "The canvas is the sketch. Now the render."

## Beat 3: "Now watch the real preview" (90s, the money moment)

- The Visualize step opens with the sliders pre-set from the canvas.
- Move three sliders while talking: **Dorsum / bridge** toward Reduce, **Tip refinement** up, **Nostril width** toward Narrower.
- Point at the after pane updating instantly: "Live preview, on-device, no internet needed."
- Open **AI instruction** so they see the assembled prompt: "The sliders write the surgical instruction. Everything is auditable."
- Click **Generate with AI**. While it runs: "Identity preservation is the whole game. Same person, only the nose changes."
- When the photoreal result lands: drag the **before/after divider** slowly. Pause. This is when phones come out.
- Point at the disclaimer under the image: "Illustrative visualization, not a promised outcome. Protects the clinic, sets honest expectations."
- Click **Save to consultation**.

## Beat 4: "They leave with this" (60s)

- Click **Continue to treatment plan**. Click **Use Rhinoplasty template**: milestones, medicines and follow-ups appear pre-filled with dates. Tick the first milestone.
- Click **Continue to report**. Then **Open full report**.
- Scroll the three sheets slowly: cover with her name, the before/after with the disclaimer, the plan timeline, contact block.
- Click **Download PDF**: "One click. This is what the patient takes home, and what they show their friends."

## Close

"Every consultation produces consented before/after material and an outcome story. That is the content engine for the clinic's marketing. One system: consultation, conversion, content."

## Fallbacks

- **No connectivity:** everything except the photoreal pass works offline (mesh, morphs, live preview, plan, report). Run the same script; the live preview IS the demo, the AI pass is the encore.
- **Fresh machine:** first canvas open downloads nothing; the face model and WASM are bundled with the app.
- **Something looks stale:** Admin -> Settings -> Reset demo restores the exact starting state in two clicks.
