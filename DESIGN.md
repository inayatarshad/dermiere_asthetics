# DESIGN.md — Contour

## System
Glassmorphic Mint (locked by the knowledge base, 08_design-system.md).
App chrome: glass cards over a mint-lit off-white stage. PRINT ARTEFACTS
(reports, consent pack, assessment) are flat white paper: no glass, no
blur, no shadows heavier than a hairline.

## Color
- mint-500 #34d3b0 (accent; on paper use sparingly: rules, numerals, the
  single gauge), mint-100 #e6faf5 (wash), ink-900 #0e2a26 (mint-tinted
  near-black), ink-700 #35514c, ink-400 #8aa39d.
- Never pure #000/#fff for text; inks above are the neutrals.
- Print artefacts follow the Restrained strategy: tinted neutrals + mint
  ≤10% of the surface.

## Typography
- App: Inter (var --font-inter), -0.01em tracking.
- Print artefacts: Fraunces (var --font-fraunces) for display headings and
  the wordmark line, Inter for body/tables. Body on paper 9.5–10.5px,
  captions 8–9px, display 22–30px, weight contrast ≥ 1.25 steps.
- Wordmark: "Con" 600 + "tour" 300, always.

## Components (print artefacts)
- Letterhead band: mark left, serif title, meta line right, hairline rule
  below (1px rgba ink 12%).
- Tables: hairline row rules only (no zebra, no cell borders), 9.5-10px,
  numeric columns tabular-nums right-aligned.
- Gauges: thin 3-4px linear tracks or a single small annular gauge; never
  big-number stat cards on paper.
- Figures: photos with 10px radius, 1px ink-10% border, serif figcaption
  numerals.
- Bans honored: no side-stripe borders, no gradient text, no glass on
  paper, no identical card grids, no hero-metric blocks.

## Motion
App only (fade-up 0.35s ease-out-quart). Print artefacts: none.
