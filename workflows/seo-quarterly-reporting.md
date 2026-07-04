# Workflow: Quarterly SEO / Website Results Report

<!-- deliverable: seo-report-email -->

## Goal

Produce a clear, honest **quarterly** report on how the client's website performs in organic search and on the technical side — separate from the monthly Google Ads report. Over a quarter the trend matters more than any single month: it reflects Saerens' promise of full transparency and no surprises, with real organic numbers, plain explanations, and clear next steps for the site.

## When to use

The regular quarterly SEO/website reporting cycle for a client with organic search or website health in scope, or when a client prefers a quarterly organic review over a monthly one. For the monthly cadence use `workflows/seo-monthly-reporting.md`; for a one-off deep organic audit use `workflows/seo-audit.md`.

## Steps

1. Confirm the reporting quarter and comparison period (the previous quarter).
2. Review the client's goals and priority pages/services (`clients/<client>.md`).
3. Read the supplied Search Console data: clicks, impressions, average position, CTR — for the report quarter and the previous quarter, with the real deltas. When a branded vs non-branded split is supplied, read it too: how much organic traffic is non-branded (new demand SEO captures over the quarter) vs branded (people already searching the brand).
4. Read the supplied technical crawl-health signals and note what changed over the quarter.
5. Read the supplied PageSpeed / Core Web Vitals current-state signals (these are a snapshot, not a delta).
6. Include Bing / other-engine organic signals only when supplied.
7. Explain the quarter's main movements and trend in plain language, tracing any decline to its likely cause.
8. Recommend concrete next steps for the site for the coming quarter.
9. Flag any data gaps or caveats (missing period, unverified property, tracking issues).

## Agents involved

- Orchestrator Agent (routes and briefs)
- Reporting Specialist (lead — turns organic data into a client-ready story)
- SEO Specialist (interprets organic movements, technical health, and next steps)

## Required output

Follow `knowledge/seo-reporting.md`. Must include:

- Headline — how the site's organic quarter went, in one or two sentences
- Key organic results (clicks, impressions, average position, CTR) with quarter-over-quarter change
- Branded vs non-branded organic split, where supplied — lead with the non-branded picture (the demand SEO actively wins) and name a strong non-branded theme or two in prose, then state the branded share plainly
- Technical health summary (crawl signals) and what changed over the quarter
- Page speed / Core Web Vitals current state
- Bing / other-engine signals, where available
- What drove the results — plain-language explanation of the quarter's trend
- What's planned next for the site
- Notes & caveats (data gaps, one-offs, unverified data)

The branded cover and the "Organische zoekprestaties in beeld" charts (top terms, branded-vs-non-branded split, top non-branded terms) are generated automatically — do **not** restate the title/domain/date/author or repeat those charts as tables, and add **no** signature or sign-off to the report body (the cover e-mail carries it). Keep the client write-up tight and plain-language, as polished and concise as the Google Ads report.

Use only the period data actually supplied — never invent organic figures for a missing comparison period; mark it "n/a". The client-facing report must contain no placeholders and no internal-only sections. Put anything needing internal follow-up or approval under a final `## Interne nota's (niet voor de klant)` section, which is stripped from the client PDF and email.
