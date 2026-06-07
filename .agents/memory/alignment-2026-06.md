---
name: Alignment interview outcomes (June 2026)
description: the founder's confirmed direction + priorities from the June 2026 alignment interview, and what the skill library does/doesn't cover.
---

# Alignment interview outcomes (June 2026)

Durable decisions from a full re-alignment interview with the founder. These guide what
to build next; they are NOT all reflected in code yet.

## Confirmed direction
- Core line unchanged: app = brain / source of truth; n8n + ClickUp = stateless
  executors; human approves before anything goes live.
- Executor layer = **both**: the app stays the brain AND the in-app planner
  (pg-boss), with n8n as the external trigger/executor. Not either/or.
- **Do NOT switch automations on yet.** Build them ready, but keep everything
  manual until the doc-graph is verified end-to-end. Readiness gate is trust, not
  capability.

## Market scope widened
- Not Belgium-only — **also the Netherlands**. Any market-context / budget-calendar
  / bilingual work must cover NL as well as BE (NL-NL + NL/FR), not just Belgian
  holidays/seasonality. Earlier docs/memory said "Belgian" only; treat that as
  too narrow now.

## Priorities the founder named (roughly in his order)
budget-pacing -> account watchdog (spend/CPA anomaly) -> new data sources
(Search Console / GA4) -> competitive intel -> automate the monthly report
(read-only) -> search-term -> negative keywords. Plus extra "wow" picks:
competitive intel, watchdog, budget-pacing + (BE+NL) calendar, message-match
(ad <-> landing page), onboarding autopilot.

## New data sources he wants (beyond the roadmap's Meta Ad Library)
- Google Ads Transparency Center / Ad Library (competitor ads)
- Google Maps
- Google Business Profile (GMB)

## His #1 immediate wish
A full **double-check / audit** of the existing doc-graph (agents, workflows,
standards) to confirm it matches how he actually works — before building more.
And, over time, an **output-rating feedback loop** ("was this correct?") so agents
improve from real practice. (Partly exists as the learning loop; the per-output
rating capture is the gap.)

## Skill-library reuse verdict (checked via skill finder)
The skill library is built for generic app-building, NOT Google Ads agency ops.
- No skill exists for: Meta/Google Ad Library, Google Maps/GMB, budget pacing,
  anomaly detection, Search Console/GA4 ingestion, output-feedback loop, doc
  audit. These must be built in-project (doc-graph + API layer).
- Marginally reusable as *method/inspiration* only: `deep-research` (multi-source
  research pattern for competitive intel + NL/BE market context), `seo-auditor`
  (later, for the SEO side), `competitive-analysis` (B2B positioning frameworks —
  mostly MBA-style, low fit for "what ads are competitors running now").
**Why it matters:** "don't reinvent the wheel" mostly doesn't apply here — there
is little wheel to reuse; the real engine is this project's own doc-graph + live
read-only data. Don't burn time re-searching the skill library for these.
