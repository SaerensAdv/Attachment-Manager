---
name: Briefing auto-suggest (proposal-only)
description: AI proposes cliëntfiche briefing values; never silently overwrites; resolve-fallbacks to the Website field.
---

# Briefing auto-suggest & resolve-fallbacks

## Rule: AI briefing-suggest is proposal-only, never a silent write
The `briefing-suggest` endpoint returns `{ client, suggestions, notes }` and must
NEVER mutate the briefing columns. The only side-effect it may have is caching
`websiteIntake` (fetch+persist) when empty and a website is set. The UI applies
suggestions into local form state only (per-field "Overnemen" + "Alles overnemen");
persistence still requires the user's manual save.

**Why:** user explicitly required review/confirm — an AI must propose, the human
decides. Commercial fields (hoofddoel/conversieactie/KPI's/budget) are the most
sensitive; the model is told to leave them blank if not grounded and to surface
that in `notes` ("te bevestigen"), never to invent a target.

**How to apply:** any future "auto-fill from AI" feature on the fiche follows the
same contract — separate suggest endpoint, no field writes, UI fills form only.
Keep the JSON parser tolerant (strip code fences, extract object boundaries,
default to empty suggestions/notes on shape mismatch); list fields are
newline-joined strings to match the textarea form shape.

## Rule: resolve URLs/intake fall back to the Website field
PageSpeed (and website-intake) resolve explicit input first, else derive from the
client's own `website` (+landingPages). PageSpeed: `resolvePagespeedUrls(row)` =
explicit `pagespeedUrls` else `collectClientUrls(website, landingPages)`, wired
into single-refresh, refresh-all branch, AND coverage `configured` so the three
stay consistent. UI enables the action when explicit input OR website is present.

**Why:** clients almost always have a website but rarely fill the dedicated URL
box; the fallback removes redundant manual entry.

**How to apply:** when adding a per-client live-data action, gate the button on
(explicit field OR website) and keep server condition + coverage flag in lockstep
with the resolve helper, or coverage lies about what's configured.

## Related cleanup: "Huidige stand" paste fields removed
`googleAdsData` + `searchConsoleData` were dropped from `STATE_FIELDS` and from the
`(current)` blocks in `clientToMarkdown` (redundant vs. the live pull); `currentState`
kept. Non-destructive: DB columns + `EMPTY_FORM` stay so old data isn't lost.
