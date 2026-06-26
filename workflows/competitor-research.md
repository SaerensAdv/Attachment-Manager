# Workflow: Competitor Research

## Goal

Produce an honest, source-backed briefing on what a client's real competitors are doing right now — their offers, positioning, and (where visible) their advertising — so the team can sharpen the client's angle. Observation only: we report what is publicly visible, we never copy or impersonate.

## When to use

Onboarding a new client, preparing a pitch or audit, entering a new market or service line, or whenever the client asks "what is the competition doing?"

## Steps

1. Identify the real competitors from the client context (`clients/<client>.md`) and the local market — direct rivals first, then adjacent players. Confirm the geography (Belgian region, NL/FR language).
2. Map each competitor's public positioning: offer, pricing signals, unique claims, and tone, from their own website.
3. Where ad activity is publicly visible, note what they are running and the angles they lead with — via the public Meta Ad Library (manual lookup) and Google search results. Record sources and dates; flag anything you could not verify.
4. Optionally diff a competitor's landing page over time (Wayback Machine) to spot recent changes in offer or positioning.
5. Compare against the client: where the client is stronger, where there is a gap, and where there is a clear opening.
6. Turn findings into concrete, ethical recommendations for the client's angle — never "copy competitor X".

## Saerens emphasis

- **Public and ethical only.** Use sources anyone can access; never anything from a competitor's account. Follow `knowledge/market-competitive-research.md` for sources and their limits.
- **Belgian reality.** Account for NL/FR language and regional market differences (`knowledge/market-competitive-research.md`).
- **Honest gaps.** State clearly what could not be verified rather than inventing competitor data.

## Agents involved

- Orchestrator Agent (routes and briefs)
- Competitive Research Analyst (lead — gathers and synthesizes)
- Google Ads Strategist (turns findings into channel angle, where relevant)

## Required output

Use `templates/competitor-briefing.md`. Must include:

- Who the competitors are and why they were chosen
- Each competitor's positioning, offer, and visible advertising (with sources/dates)
- Where the client is stronger, weaker, and where the opening is
- Concrete, ethical recommendations for the client's angle
- Sources and verification gaps
- Human review required before use with the client
