<!-- description: The concrete, reusable layout standard for Saerens-authored slide decks (audit/results/pitch). Defines the deck shell, the recurring slide patterns and reusable blocks, and the visual motifs, so a new deck starts from a fixed blueprint instead of from scratch. Pairs with knowledge/saerens-brand.md (palette, type, voice) and knowledge/replit-slide-decks.md (how to prompt the Replit Agent). -->

# Saerens slide-deck layout standard

The fixed layout blueprint for any deck **Saerens authors** — a Google Ads audit, a results presentation, or a sales/pitch deck. `knowledge/saerens-brand.md` says *how Saerens looks* (palette, type, logo, voice); this says *how a Saerens deck is laid out*, slide by slide, so a new deck reuses a proven structure instead of being invented each time. It is derived from the Saerens audit decks and mirrors the branded report PDF. When prompting the Replit Agent to build a deck, follow `knowledge/replit-slide-decks.md` and inline the concrete layout below.

## The deck shell (applies to every slide)

- **Dark cover and dark closing, light content in between.** Cover and closing use near-black `#0A0A0B`; all content slides use the light panel `#F5F5F8` with ink `#1A1A22` text.
- **Sizing in `vw`/`vh`, not pixels.** Every size, position, and font uses viewport units so slides look identical on any screen and when exported to PPTX/PDF. Slides are absolutely positioned full-bleed (`w-screen h-screen`, `overflow-hidden`).
- **Type:** Plus Jakarta Sans for display/headlines, Outfit for body (both Google Fonts). Headlines are extra-bold with tight tracking and balanced wrapping.
- **Eyebrow → headline rhythm.** Each slide opens with a small **eyebrow** label (uppercase, wide letter-spacing) above a large display headline — purple `#716BEB` on light slides, amber `#F4A425` on the dark cover/closing.
- **Wordmark, top-right on light slides.** "SAERENS ADVERTISING" in small, tracked display type at top-right of every content slide. Do **not** add a tagline.
- **Footer meta.** Bottom-left a source/confidentiality line (e.g. "Bron: Google Ads (read-only) · opgehaald [datum] · periode [periode]"); bottom-right the page number as `NN / TT` (e.g. `04 / 11`).
- **Cards.** Content sits in white cards with a thin hairline border `#E4E2EE` and soft rounding; never raw text on the background for data blocks.
- **Accent use.** Purple is the structural accent (rules, bars, markers); amber is reserved for the cover/closing eyebrow, pill highlights and the single most important callout. Negative / problem values are red `#C0392B`; positive deltas stay ink-grey.
- **No emoji, ever** — not in the deck, not in the prompt.

## Cover (dark)

- Near-black background with two soft blur orbs (purple `#716BEB` and indigo `#29274E`) and a thin purple→amber gradient hairline along one edge.
- Top-left logo lockup: the white-tinted SA mark (`filter: brightness(0) invert(1)`) next to the "SAERENS ADVERTISING" wordmark.
- Centre-left block: amber eyebrow (e.g. "Google Ads-audit"), a very large display title (the client/subject), a short purple accent rule, then a light subtitle (e.g. "Prestatie-analyse · [periode] · [vergelijking]").
- Footer: bottom-left confidentiality + date ("Vertrouwelijk · Opgesteld [datum]"); bottom-right the account identifier when relevant (e.g. "Google Ads-account [ID]").

## Content slides — the audit blueprint

An audit/results deck runs in this order; reuse, drop, or rename sections for other deck types (a pitch deck swaps findings for problem → solution → offer), but keep the rhythm of one idea per slide.

1. **Cover** — see above.
2. **Managementsamenvatting** — the verdict in prose on the left (one or two short paragraphs), a 2×2 grid of **stat cards** on the right. Each stat card: small uppercase label, one big number, one line of context. Use red for the headline negative.
3. **Oordeel** — a single large verdict headline + one supporting paragraph; bottom-left a hero before→after figure (`13 → 1` with a coloured arrow), and a status **pill** (amber for caution/"Verslechterend").
4. **Kerncijfers (KPI table)** — a comparison table: columns *Statistiek · [vorige] · [huidige] · Verschil*, header row with a heavy bottom rule, thin hairline rows, the key rows highlighted with a tinted background, negatives in red. A short note below explains any caveat.
5. **Conversies per actie** — two side-by-side white cards comparing periods (each: period title + a small "X geteld als conversie" label, then the per-action breakdown), with a muted line below listing actions measured-but-not-counted, and a short explanatory paragraph.
6. **Grafiek** — two simple bar-chart cards built with plain divs (no external chart library): each shows two bars (previous vs current) with the value above and year below; purple for the strong/current bar, red when the current value collapsed. A caption explains the like-for-like basis.
7–9. **Bevindingen (findings)** — one slide per finding (Meting / Structuur / Verspilling), each with a numbered eyebrow ("Bevinding 1 · Meting"). Layout: a column of short bullets on the left (each a small purple square marker + a bold lead sentence + detail), and a single highlighted **callout card** on the right (amber-bordered for the top action, or a dark indigo `#29274E` banner across the bottom for a key takeaway). Tables (e.g. wasted search terms: *term · cost · conv.*) reuse the KPI table style.
10. **Aanbevelingen** — a priority table: columns *Prioriteit · Actie · Verwacht effect*, with **pill** priority labels (amber "Hoog", grey "Midden"), ordered by impact.
11. **Closing (dark)** — mirrors the cover: blur orbs, gradient hairline at the opposite edge, logo lockup top-left. Amber "Volgende stap" eyebrow, a display headline stating the first move, a light supporting line, and a footer contact block (Axel Saerens · axel@saerensadvertising.com · saerensadvertising.com) with the final page number.

## Reusable blocks (mix and match)

- **Stat card** — label (uppercase, muted) + big display number + one context line; red number for a negative headline.
- **Comparison table** — heavy header rule, hairline rows, tinted highlight rows, right-aligned numbers, red negatives.
- **Comparison cards** — two white cards side by side for period-over-period or this-vs-that.
- **Bar pair** — div-based bars (no chart lib) for a single, legible comparison.
- **Finding bullets + callout** — left column of marker bullets, right a bordered callout card or a full-width dark banner for the headline takeaway.
- **Priority table** — pill labels + action + expected effect.
- **Pill** — rounded label for status/priority (amber = primary/high, grey = secondary).

## How to apply

- Keep real numbers and claims exactly as the team approved them; mark anything unconfirmed as `[AAN TE VULLEN: …]`. Never invent figures, testimonials, or tracking IDs.
- Fix an explicit slide count and confirm export needs (PPTX / Google Slides / PDF).
- For non-audit decks, keep the shell (dark cover/closing, light content, eyebrow→headline rhythm, footer meta, cards, vw/vh sizing) and reuse the blocks; only the section order and content change.
- A human reviews, exports, and presents — nothing goes live automatically.
