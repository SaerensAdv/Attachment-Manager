# Workflow: Slide Deck Build

<!-- deliverable: slide-deck-prompt -->

## Goal

Turn an approved narrative into a paste-ready Replit build prompt for a **slide deck** — a professional presentation the Replit Agent builds as a React deck that exports to PPTX, Google Slides, or PDF. A human reviews, exports, and presents; nothing goes live automatically. This workflow's deliverable is a Replit prompt; write it per `knowledge/replit-slide-decks.md` and `knowledge/replit-prompting.md`. A pitch/sales/results deck is agency-authored, so apply the Saerens house style from `knowledge/saerens-brand.md`.

## When to use

A client or prospect needs a presentation: a pitch/sales deck, a product overview, a results presentation, or training material — and we want it buildable by the Replit Agent.

## Steps

1. Identify the client/audience and the deck's goal (`clients/<client>.md`) — what it must achieve and for whom (the room).
2. Confirm the narrative arc: the slides in order, one idea per slide.
3. Write the per-slide content (headline + concrete bullets/numbers) from the team's work — never invent figures. Pre-fill what the agency already knows (agency name, positioning, Google Partner status, working model, contact, today's date); mark only genuinely unknown client-specific items as `[AAN TE VULLEN: …]`.
4. Set the visual direction per slide (chart types and the data behind them, icons, imagery) and the deck theme grounded in the Saerens house style (`knowledge/saerens-brand.md`) and `knowledge/tone-of-voice.md`.
5. Fix an explicit slide count and confirm export needs (PPTX / Google Slides / PDF).
6. Flag claims needing confirmation; for client-facing wording add a Humanizer pass; prepare the human approval summary.

## Agents involved

- Orchestrator Agent (routes and briefs)
- Web Developer / Builder (lead — assembles the build spec)
- Copywriter (deck narrative and per-slide copy)
- Creative Designer (visual direction, theme, charts)
- Sales / Proposal Agent (for pitch/sales decks) or Reporting Specialist (for results decks), where relevant

## Required output

Follow `templates/task-output.md`. Must include:

- Deck goal and audience
- Slide-by-slide outline (purpose + headline + key content per slide), pointing to the Copywriter's approved copy rather than re-transcribing everything
- Visual direction and theme (charts, icons, colours, fonts, light/dark)
- Explicit slide count and required export formats
- Open questions / missing assets (logos, testimonials, numbers as placeholders)
- Human approval required (a human reviews, exports, and presents — nothing goes live automatically)
