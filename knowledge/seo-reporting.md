# SEO / Website Results Reporting

How Saerens reports **organic search and website health** to clients. This is the recurring SEO/website report — separate from the monthly Google Ads report (`knowledge/measurement-reporting.md`), which covers paid performance. Both share the same honesty promise and client-facing conventions; this note defines what an organic report contains and how to read its data.

The Reporting Specialist leads the client-facing write-up; the SEO Specialist interprets the organic movements, technical health, and next steps. It runs on two cadences — **monthly** (`workflows/seo-monthly-reporting.md`) and **quarterly** (`workflows/seo-quarterly-reporting.md`).

## Data sources

- **Google Search Console (primary).** The organic source of truth: clicks, impressions, average position, and CTR, with the real change against the comparison period (previous month or previous quarter). Position is a real 1-based rank — never scale or invent it.
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

## Structure of a report

1. **Headline** — how the site's organic period went, in one or two sentences.
2. **Key organic results** — clicks, impressions, average position, CTR for the period and the comparison period, with the change.
3. **Technical health** — crawl signals and what changed since last time.
4. **Page speed / Core Web Vitals** — current-state snapshot (flag it as a state, not a delta).
5. **Bing / other engines** — where supplied.
6. **What drove the results** — plain-language explanation of the main movements or trend.
7. **What's planned next** — concrete next steps for the site for the coming period.
8. **Notes & caveats** — data gaps, one-offs, unverified data.

Depth flexes with the period: a quiet month warrants a short update, a quarter usually warrants a fuller trend read. The sections stay the same so reports stay comparable.

## Client-facing completeness

The report that goes to the client (the PDF and its cover email) must be **complete and self-contained** — the same bar as the Ads report. It must never contain placeholder markers ("[AAN TE VULLEN]", "TODO", empty fields) or internal-only sections. If a section cannot be completed from the available data, **omit it** rather than leaving a stub. Anything needing internal follow-up or human approval goes only under a final section titled exactly:

`## Interne nota's (niet voor de klant)`

Everything under that heading is stripped from the client PDF and email.

## Quality bar

- Every number traces back to real supplied data. If you can't source it, don't report it.
- Average position is a real rank; page speed is a current-state snapshot — never present either as something it isn't.
- No promises about future rankings or traffic.
- End with clear, actionable next steps for the site.
- Anything implying a live-site or tracking change carries a **human approval** note in the internal section.
