---
name: System Map branding direction
description: The chosen visual identity for the AI Team System Map app and where it lives.
---

# Editorial "Newsroom" brand (Saerens Advertising)

The app uses an editorial/magazine identity derived from llms.saerensadvertising.com.

- **Palette:** cream paper #F4F4F0 (bg), ink #1A1A1A (fg), single accent indigo #726CEA. White cards.
- **Type:** Playfair Display (display serif), Inter (body/UI), Space Mono (labels/meta). All three loaded via Google Fonts in `index.html`.
- **Form:** sharp 0px corners, hairline rules, hard offset shadows `shadow-[4px_4px_0px_hsl(var(--foreground))]`, magazine details (section numbering 01/02, "EDITIE No. 0XX", "SA" monogram, drop caps).
- **Language:** all UI in Dutch (Vlaams), no emojis.

**Why:** Out of two explored directions on the Canvas — "Newsroom" (light) and "Evening Edition" (dark) — the user picked **Newsroom (light)**. The whole app (Kaart/Genereren/Klanten) was rebranded to it.

**How to apply:** Theme lives entirely in `artifacts/system-map/src/index.css` `:root` (light tokens; `.dark` is mirrored but never toggled — there is no dark-mode switch). `cat-*` graph category colors were darkened for legibility on cream. Stay consistent with this language for any new UI; do not reintroduce the old dark tech theme.

## saerens.agency site build (P3) — design inspiration

The Newsroom brand above is for the System Map app. The **saerens.agency** site
(the autonomous-case subject, to be built as a NEW web artifact in P3) is a
separate design with an "AI-focus" creative direction.

- Founder-supplied inspiration (Jun 2026): https://www.unicorn.studio/inspiration
  — a tool/gallery for interactive WebGL/shader effects (fluid animated gradients,
  cursor-reactive backgrounds, lightweight motion). Direction cue: a lively,
  technical "AI" hero feel **without heavy 3D**. Consider this when defining the
  P3 creative direction; it is inspiration, not a mandate.
