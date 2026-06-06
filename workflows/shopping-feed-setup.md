# Workflow: Shopping & Feed Setup (Shopping / Performance Max)

## Goal

Plan and review a healthy product feed and Shopping / Performance Max structure for an e-commerce client, so the catalogue is advertisable and the campaigns are built on clean data. Advisory and review only — nothing is pushed live automatically.

## When to use

An e-commerce client launching Shopping or Performance Max, a feed that is being rejected or under-serving, or a periodic review of catalogue and feed health.

## Steps

1. Confirm the client is e-commerce, the platform/feed source, and the catalogue scope from `clients/<client>.md`.
2. Review **feed health first**: required attributes, titles and descriptions, GTINs, product categories, and common disapproval causes. A weak feed undermines everything downstream.
3. Map the campaign structure: how products are grouped (by margin, category, or performance) and how Shopping and Performance Max should divide the catalogue without cannibalizing each other.
4. Review settings against `knowledge/google-ads-standards.md` (bidding, priorities, exclusions) and confirm conversion tracking with values is sound before judging performance.
5. Identify the biggest feed and structure improvements, prioritized by impact and effort.
6. Prepare a clear summary of findings and recommended next steps for human review.

## Saerens emphasis

- **Feed before bids.** Most Shopping problems are feed problems; fix titles, attributes, and disapprovals before touching bidding.
- **Values, not just conversions.** E-commerce decisions need conversion *value* and ROAS, not bare conversion counts.
- **Honest and prioritized.** Quick wins vs bigger fixes, in plain language.

## Agents involved

- Orchestrator Agent (routes and briefs)
- Shopping & Feed Specialist (lead — feed and structure)
- Google Ads Strategist (campaign structure and bidding strategy)
- Reporting Specialist (client-facing summary, where needed)

## Required output

Use `templates/google-ads-output.md` (setup variant). Must include:

- Feed health findings (attributes, titles, disapprovals)
- Recommended Shopping / Performance Max structure and how the catalogue is divided
- Settings & tracking findings (including conversion values)
- Prioritized recommendations (impact / effort)
- Missing data needed for a fuller setup
- Human approval required before any changes go live
