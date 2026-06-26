# Workflow: Client Onboarding ("Day 1 Dossier")

## Goal

Turn a newly added client into a rich starter dossier in one pass, so the account team begins from real context instead of a blank page. Glues together the building blocks the brain already has (briefing, website intake, live data where available, a first competitor look) into one ready-made dossier.

## When to use

The moment a new client is added, or when an existing client's dossier is thin and needs a proper baseline before any work starts.

## Steps

1. Capture the briefing basics into `clients/<client>.md`: business type (lead gen or e-commerce), goals, services, geography, language (NL/FR), and brand restrictions.
2. Read the client's own website (website intake) to ground services, tone, and proof points in their real wording — never invented.
3. Where a Google Ads customer id is configured, pull a live, read-only baseline of the account's current state. Where it is not, note it as missing rather than guessing.
4. Run a first, light competitor look (`workflows/competitor-research.md`) for early positioning context.
5. Account for the Belgian market context (`knowledge/market-competitive-research.md`): language, regional differences, and seasonality that will shape the plan.
6. Assemble everything into one starter dossier and flag the open questions a human must confirm before work begins.

## Saerens emphasis

- **Real context only.** Everything is grounded in the client's own materials and live data; gaps are named, not filled with assumptions (`knowledge/agency-foundations.md`).
- **A baseline, not a plan.** The dossier sets the stage; the actual strategy comes from the relevant channel workflow afterwards.

## Agents involved

- Orchestrator Agent (routes and briefs)
- Client Onboarding Agent (lead — assembles the dossier)
- Competitive Research Analyst (first competitor look)
- Google Ads Strategist (initial read of the channel opportunity)

## Required output

Use `templates/onboarding-dossier.md`. Must include:

- Client basics (business type, goals, services, geography, language)
- Website-grounded summary of offer, tone, and proof points
- Baseline of any live account data (or a clear note that it is missing)
- First competitor snapshot
- Belgian-market notes that will shape the plan
- Open questions for the human before work begins
