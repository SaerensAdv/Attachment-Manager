# Workflow: Monthly SEO / Website Results Report

<!-- deliverable: seo-report-email -->

## Goal

Produce a clear, honest **monthly** report on how the client's website performs in organic search and on the technical side — separate from the monthly Google Ads report. It reflects Saerens' promise of full transparency and no surprises: real organic numbers, plain explanations, and clear next steps for the site.

## When to use

The regular monthly SEO/website reporting cycle for a client with organic search or website health in scope. For the paid Google Ads report use `workflows/monthly-reporting.md`; for a one-off deep organic audit use `workflows/seo-audit.md`.

## Steps

1. Confirm the reporting period and comparison period (the previous month).
2. Review the client's goals and priority pages/services (`clients/<client>.md`).
3. Read the supplied Search Console data: clicks, impressions, average position, CTR — for the report month and the previous month, with the real deltas. When a branded vs non-branded split is supplied, read it too: how much organic traffic is non-branded (new demand SEO captures) vs branded (people already searching the brand).
4. Read the supplied technical crawl-health signals and note what changed since last time.
5. Read the supplied PageSpeed / Core Web Vitals current-state signals (these are a snapshot, not a delta).
6. Include Bing / other-engine organic signals only when supplied.
7. Explain the main movements in plain language, tracing any dip to its likely cause.
8. Recommend next steps: for the client, describe the goal and payoff in plain language; put the concrete technical actions in the internal werklijst.
9. Flag any data gaps or caveats (missing period, unverified property, tracking issues).

## Agents involved

- Orchestrator Agent (routes and briefs)
- Reporting Specialist (lead — turns organic data into a client-ready story)
- SEO Specialist (interprets organic movements, technical health, and next steps)

## Required output

Follow `knowledge/seo-reporting.md`. The CLIENT report is short and plain-language — four sections only:

- **Kerncijfers in één oogopslag** — clicks, impressions, average position, CTR with the month-over-month change (clear up/down trend)
- **Hoogtepunten van de maand** — two or three concrete wins or notable movements, in plain language
- **Waar we komende maand op focussen** — two or three focus points written for the client (the goal and payoff), NOT technical tasks
- **Top zoektermen** — a short written takeaway on where the organic traffic comes from. When the branded vs non-branded split is supplied, lead with the non-branded picture (the demand SEO actively wins) and name a strong non-branded theme or two in prose, then state the branded share plainly

The branded cover and the "Organische zoekprestaties in beeld" charts (top terms, branded-vs-non-branded split, top non-branded terms) are generated automatically — do **not** restate the title/domain/date/author or repeat those charts as tables, and add **no** signature or sign-off to the report body (the cover e-mail carries it). Keep the whole write-up tight and to about one page of text, as polished and concise as the Google Ads monthly report.

Tone: neutral and factual, with a light, reassuring undertone. No jargon, no technical implementation detail, no emoji.

Use only the period data actually supplied — never invent organic figures for a missing comparison period; mark it "n/a". The client-facing report must contain no placeholders, no internal-only sections and no technical jargon.

All technical, implementation-level detail (crawl errors, per-page title/meta/H1 rewrites, structured data, redirects/canonicals, Core Web Vitals fixes with targets, the prioritized action list, anything needing human approval) goes under a final section titled exactly `## Interne werklijst (niet voor de klant)`. Everything under that heading is stripped from the client PDF and email and kept as a separate internal werklijst for the agency and the web developer.
