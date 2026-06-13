# Workflow: Google Ads Campaign Setup

## Goal

Prepare a complete, implementation-ready Google Ads campaign setup for a client — from strategy to a structure a human can review and build.

## When to use

A client wants to launch a new campaign, enter a new channel (Search, Shopping, Performance Max), or rebuild an existing campaign from scratch.

## Steps

1. Understand the business and offer.
2. Review the client context (`clients/<client>.md`) and **gather what's needed from the client** — especially the **budget**, which drives how the campaign(s) are set up.
3. Confirm the campaign objective and the client's "world" (e-commerce or lead generation).
4. Define the campaign type(s), **starting bottom-of-funnel (BOFU)** to land the first leads/sales before broadening.
5. Define the account/campaign structure — **keep brand and non-brand separate from the start**.
6. Define targeting (locations, languages, audiences).
7. Prepare keyword themes / audiences and an initial keyword list with match types.
8. Prepare negative keywords.
9. Prepare ad copy (hand off to the Copywriter).
10. Prepare the conversion tracking checklist.
11. Apply naming conventions.
12. Prepare the human approval summary (budget, go-live, tracking).

## Saerens approach

- **Budget first.** The available budget drives how the campaign(s) are structured — confirm it before designing the setup.
- **Land then expand.** Start **bottom-of-funnel (BOFU)** to win the first leads/sales; early results build trust and naturally lead to expanding the account (more themes, higher-funnel, new campaign types).
- **Brand vs non-brand separated** from day one; thematic build-out comes as the account evolves.
- **Conversion tracking is the non-negotiable go-live gate** — a campaign does not go live without verified conversion tracking, full stop.

## Agents involved

- Orchestrator Agent (routes and briefs)
- Google Ads Strategist (objective, structure, budget split)
- Google Ads Setup Specialist (detailed buildout)
- Copywriter (ad copy)
- Analytics & Tracking Specialist (tracking review)

## Required output

Use `templates/google-ads-output.md`. Must include:

- Campaign objective
- Campaign structure and naming
- Ad group structure
- Keywords (with match types)
- Negative keywords
- Ad copy suggestions
- Assets / extensions
- Tracking checklist
- Open questions / missing information
- Human approval required (budget + go-live)

## Later upgrade paths

- **Bulk-CSV deliverable**: a future enhancement could package the approved structure
  (campaigns, ad groups, keywords, ads) as a Google Ads Editor-compatible bulk CSV —
  like `workflows/ad-copy.md` does for RSAs. That needs careful per-entity validation
  and policy checks, so it is intentionally **not** wired up yet; the reviewed
  `templates/google-ads-output.md` is the current deliverable.
