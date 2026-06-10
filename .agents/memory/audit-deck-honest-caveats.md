---
name: Audit-deck honest caveats
description: Editorial stance for Saerens Google Ads YoY audit slide decks when a conversion drop is partly a tracking/measurement-definition change.
---

When a YoY conversion drop is partly caused by a tracking/measurement-definition
change (not only real performance), present it honestly and in BOTH directions —
never blame tracking entirely, never hide the real decline.

**Why:** A client deck that says "tracking was broken" when the tracking actually
works (it just counts differently now) is misleading; so is one that reports a raw
−97% as if all real. The user explicitly wanted an honest caveat with the actual
per-conversion-action figures shown.

**How to apply:**
- Keep the raw counted figure in the KPI table (e.g. conversions 31→1, −97%) but
  add a footnote explaining the counter was re-defined.
- Lead the verdict slide with the like-for-like real decline, not the raw counter
  (e.g. Limburg Oordeel = comparable aankopen 13→1; Studio = direct contact actions
  telefoon/mail/contact 81→29 + CPA still rising).
- Add a dedicated "Conversies per actie" slide showing 2025 vs 2026 per-action
  counts AND the "also measured but not counted" actions, so the definition change
  is visible, not asserted.
- Calibrate the qualifier to the math: if measurement explains ~60% of the lost
  count, say "voor een groot deel" not "grotendeels" (grotendeels overstates).
- Do NOT over-soften: keep "Verslechterend" badges and rising-CPA where the real
  result still worsened.

Layout note: a slide footnote at `bottom-[8.5vh]` collides with a tall KPI table —
an 8-row table needs tightened row padding (e.g. `py-[1.0vh]`) and/or a higher
table start so the last row clears the footnote; a 7-row table fits as-is.
