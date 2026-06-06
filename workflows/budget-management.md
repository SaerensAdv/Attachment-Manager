# Workflow: Budget Management (Pacing & Calendar)

## Goal

Keep each client's spend on track against their agreed budget and proactively adjust around predictable Belgian peaks and lulls — so budget is neither left on the table nor overspent. Advisory: the team recommends, a human approves any change.

## When to use

A mid-month pacing check, an upcoming seasonal peak (e.g. *bouwverlof*, Black Friday, sector sales periods), a budget change request, or when spend is drifting from plan.

## Steps

1. Confirm the client's agreed monthly budget and goal from `clients/<client>.md`. If no budget is on file, flag it as missing — never invent a target.
2. Read the live, read-only spend data and the automatic signals already computed (spend-without-conversions, CPA outliers) before judging pacing.
3. Assess pacing against `knowledge/budget-management-standards.md`: month-to-date spend vs the agreed budget and the days remaining, projected to month-end. Call out under- and over-pacing with the concrete euro gap.
4. Overlay the Belgian budget calendar (`knowledge/belgian-market-context.md`): upcoming holidays, *bouwverlof*, and sector seasonality that should raise or lower budget *before* the peak.
5. Recommend specific budget moves (which campaigns, how much, when) prioritized by impact, with the reasoning.
6. Note what needs human approval and what data is missing for a fuller call.

## Saerens emphasis

- **Never invent a target.** Pacing is only meaningful against a real agreed budget; if it is missing, say so.
- **Proactive, not reactive.** Adjust *ahead* of known peaks, not after the spend report shows the miss.
- **Tracking first.** Do not chase pacing on blind data — confirm conversions are measured before reallocating.

## Agents involved

- Orchestrator Agent (routes and briefs)
- Google Ads Strategist (lead — allocation and pacing strategy)
- Google Ads Optimization Specialist (campaign-level moves)
- Reporting Specialist (client-facing summary, where needed)

## Required output

Use `templates/google-ads-output.md` (pacing variant). Must include:

- Current pacing vs agreed budget (month-to-date, projected, euro gap)
- Relevant automatic signals (spend-without-conversions, CPA outliers)
- Upcoming calendar peaks/lulls and their budget implication
- Recommended budget moves (campaign, amount, timing, reasoning)
- Missing data (e.g. agreed budget not on file)
- Human approval required before any change
