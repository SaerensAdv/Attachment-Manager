# Replit Slide Decks — Building Presentations with the Agent

A "how to use it" reference for handing slide-deck work to the Replit Agent. When Saerens turns an approved narrative into a presentation, the build is produced by the Replit Agent from a prompt. The quality of the deck depends on the quality of that prompt. Pair this with `knowledge/replit-prompting.md` (general prompting habits) and `knowledge/tone-of-voice.md` (Saerens voice).

## What a Replit slide deck is

- Presentations built as real **React components** — not static images — so they export pixel-perfect and fully editable to **PPTX, Google Slides, or PDF**, and can be **deployed as a live, shareable URL** with a built-in presenter mode.
- **One-shot generation**: the Agent creates a complete deck (layout, text, visuals) from a single, well-formed prompt, then refines through conversation.
- Brand-aware: the Agent matches uploaded **brand guidelines** (colours, fonts, visual style) or an uploaded **reference deck** used as a foundation.
- Editing after generation: the **Visual Editor** changes text, colours, spacing directly; slides can be duplicated/deleted. Drag-and-drop of elements within a slide is not supported — rearranging is done by asking the Agent.

## What to put in a slide-deck prompt

- **Goal & audience** — what the deck must achieve and who is in the room (e.g. "convince a Flemish heat-pump installer to start Google Ads with Saerens").
- **Narrative arc** — the slides in order, each with its single purpose. A strong deck has one idea per slide.
- **Per-slide content** — the headline and the concrete bullet points / numbers for each slide, taken from the team's work. Do not invent figures.
- **Visuals per slide** — charts (and what they show), icons, imagery direction. Name the chart type and the data behind it.
- **Theme** — colours, fonts, and visual style, grounded in the client's brand; light or dark.
- **Slide count** — an explicit number (e.g. "10 slides").

## Good prompting habits for decks

- Describe the outcome and the story first, then the slide-by-slide breakdown.
- Be specific per slide ("Make the problem slide concise: one stat + one sentence"), not vague.
- Keep real numbers and claims exactly as the team approved them; mark anything unconfirmed as **[AAN TE VULLEN: …]**.
- Iterate after the first version (content, styling, add/remove/reorder slides) — expect one or two refinement rounds.

## What it is good for

Pitch decks, product overviews, team/all-hands presentations, client-facing sales decks, educational/training material.

## How Saerens uses this

- Use for sales/pitch decks and client result presentations. Ground every deck in the real client fiche (`clients/<client>.md`), the brand, and `knowledge/tone-of-voice.md`.
- Never invent client logos, testimonials, or numbers — use clearly marked placeholders.
- No emojis or decorative symbols, in the prompt or in the deck.
- **Recommend, don't publish**: the prompt prepares the build; a human reviews, edits, exports, and presents or deploys. Nothing goes live automatically.
