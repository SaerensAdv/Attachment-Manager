# SEO / Website Results Reporting

How Saerens reports **organic search and website health** to clients. This is the recurring SEO/website report — separate from the monthly Google Ads report (`knowledge/measurement-reporting.md`), which covers paid performance. Both share the same honesty promise and client-facing conventions; this note defines what an organic report contains and how to read its data.

The Reporting Specialist leads the client-facing write-up; the SEO Specialist interprets the organic movements, technical health, and next steps. It runs on two cadences — **monthly** (`workflows/seo-monthly-reporting.md`) and **quarterly** (`workflows/seo-quarterly-reporting.md`).

## Data sources

- **Google Search Console (primary).** The organic source of truth: clicks, impressions, average position, and CTR, with the real change against the comparison period (previous month or previous quarter). Position is a real 1-based rank — never scale or invent it.
- **Branded vs non-branded split.** The organic queries split into *branded* (people already searching for the business by name — they would likely find it anyway) and *non-branded* (generic demand the SEO work actually captures). This is where SEO earns its keep, so lead the organic story with the non-branded numbers. The split is derived deterministically from the client's name/domain plus an editable per-client brand-terms list; treat the supplied figures as given — never re-classify queries by hand.
- **Technical crawl health.** Signals from the most recent site crawl (indexation, errors, broken links, redirects) and what changed since the last report.
- **PageSpeed / Core Web Vitals (current state).** A snapshot of page speed and Core Web Vitals at report time — a state, not a period-over-period delta. Say so plainly rather than implying a trend.
- **Bing / other engines (optional).** Include only when the data is actually supplied; never pad the report with an empty engine.

## Reporting principles

These mirror the Reporting Standards in `knowledge/measurement-reporting.md`:

- **Honest first.** Report real organic results, good or bad. Never hide or spin a decline.
- **Explain the why.** Don't just show what moved — explain why in plain language, and trace any drop to its likely cause (an algorithm update, a technical regression, seasonality, lost pages).
- **Plain language.** Write for the client, not for a specialist. Define a term if you must use it.
- **Comparable over time.** Keep a consistent structure so month-to-month and quarter-to-quarter reports can be compared.
- **Data you can trust.** Use only the figures actually supplied. If a comparison period is missing or a property is unverified, mark it "n/a" and say why in the notes — never estimate or back-fill.

## What the report already shows for you (never restate it)

Your text is rendered into a branded PDF that Saerens builds around it. Two parts are produced automatically, so the written report must never duplicate them — this is the single biggest cause of a bloated, unpolished SEO report:

- **The cover** already shows the client/domain name, that this is the SEO report, the period, the date and the data source (Search Console). Do **not** open with a title, a subtitle, the client or domain name, the date, or an "Opgesteld door …" author line — start straight at the first section.
- **A "Organische zoekprestaties in beeld" charts block** is drawn automatically *above* your text: the top search terms by clicks, the branded-vs-non-branded split, and the top non-branded terms. Do **not** repeat these as tables or keyword lists — refer to what they show in prose instead. (A genuinely different table, e.g. a side-by-side comparison of two domains, is fine — it is not one of these charts.)

The report also goes out with a cover e-mail that carries the sender's signature, so the report body must contain **no greeting, salutation or sign-off** ("Beste …", "Met vriendelijke groeten", an author name) — end on the focus for next month.

## Structure of a report

The client report is **short and plain-language** — a one-glance read, not a technical to-do list, and it should read as tight and polished as the monthly Google Ads report. It has four sections and nothing more:

1. **Kerncijfers in één oogopslag** — open with one or two plain sentences on how the period went, then the metrics table: clicks, impressions, average position and CTR for the period, each with the change versus the comparison period (a clear up/down trend). Average position is a real 1-based rank; page speed, if mentioned at all, is a current-state snapshot, never a trend.
2. **Hoogtepunten van de maand** — two or three concrete wins or notable movements as **short bullet points** (one to two sentences each, not multi-paragraph write-ups), in plain language (e.g. "meer mensen vonden je via lokale zoekopdrachten"). Honest: if it was a quiet month, say so plainly.
3. **Waar we komende maand op focussen** — two or three focus points for the coming period as short bullets, written for the client, NOT as technical tasks. Describe the goal and the payoff ("we werken aan snellere productpagina's zodat bezoekers minder afhaken"), never the implementation ("LCP naar <2,5s, title tags herschrijven").
4. **Top zoektermen** — a **short written takeaway** on where the organic traffic comes from; the term-by-term detail is already in the charts above, so do not repeat it as a table. When a branded/non-branded split is supplied, lead with the non-branded picture — roughly how many clicks come from new, non-branded demand vs from people already searching the brand — and name one or two of the strongest non-branded themes in prose. State the branded share too, plainly. Keep the split **consistent with the on-page chart**: express branded and non-branded as their share of the branded + non-branded clicks, and do not introduce a separate "niet te classificeren" percentage in the client report.

Everything technical — per-page title tags, meta descriptions, headings, FAQ/schema markup, redirects/canonicals, Core Web Vitals fixes, crawl errors, per-keyword positions, the prioritized action list — belongs in the internal werklijst, NOT in the client report (see below).

Depth flexes with the period: a quiet month is a short update, a quarter a fuller trend read. The four sections stay the same so reports stay comparable. Keep the whole client write-up to about **one page of text** — it sits after the cover and the charts, so brevity is what makes it feel as polished as the Google Ads monthly report.

## Tone

Neutral and factual, with a light, reassuring undertone. Report the real numbers plainly; where results are positive, let them speak for themselves; where they dipped, state it calmly and point to the focus for next month. No hype, no spin, no emoji, no jargon.

## Interne werklijst (niet voor de klant)

All the technical, implementation-level detail lives here — the working document for the agency and the web developer, **never sent to the client**. Put it under a final heading titled exactly:

`## Interne werklijst (niet voor de klant)`

Everything under that heading is stripped from the client report (PDF + cover email) and kept as a separate internal werklijst. It holds the concrete actions, prioritized by impact and effort: per-page title/meta/H1 rewrites, internal-linking changes, FAQ/structured data, redirects and canonicals, Core Web Vitals fixes (LCP/CLS/TBT with targets), crawl errors to resolve, and anything needing human approval before it touches the live site. Be specific here — this is where the exact tasks and technical numbers belong.

## Client-facing completeness

The client report (the PDF and its cover email) must be **complete and self-contained** and contain only the four sections above. It must never contain placeholder markers ("[AAN TE VULLEN]", "TODO", empty fields), internal-only sections, or technical implementation detail. If a section cannot be completed from the available data, **omit it** rather than leaving a stub.

## Quality bar

- Every number traces back to real supplied data. If you can't source it, don't report it.
- Average position is a real rank; page speed is a current-state snapshot — never present either as something it isn't.
- No promises about future rankings or traffic.
- The client report stays short, plain-language and jargon-free; the concrete work lives in the internal werklijst.
- Anything implying a live-site or tracking change carries a **human approval** note in the internal werklijst.
