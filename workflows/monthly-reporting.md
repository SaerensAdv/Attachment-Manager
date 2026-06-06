# Workflow: Monthly Client Report

<!-- deliverable: monthly-report-email -->

## Goal

Produce a clear, honest monthly performance report that shows how the client's Google Ads performed against their goals — reflecting Saerens' promise of full transparency and no surprises.

## When to use

The regular monthly reporting cycle for an active client, or any ad-hoc performance summary request.

## Steps

1. Confirm the reporting period and comparison periods (previous period and the same month last year, where available).
2. Review the client's goals and KPIs (`clients/<client>.md`).
3. Gather performance data for both periods.
4. Calculate the metrics that matter for the client's world (ROAS/revenue for e-commerce; leads/CPL for lead gen) plus spend, conversions, CPC, CTR.
5. Identify the main movements and explain why they happened.
6. Note notable events (budget changes, seasonality, promotions, tracking changes).
7. Write the headline and key results in plain language.
8. Recommend next steps for the coming period.
9. Flag any data gaps or caveats.

## Agents involved

- Orchestrator Agent (routes and briefs)
- Reporting Specialist (lead)
- Google Ads Optimization Specialist (input on next steps)

## Required output

Use `templates/reporting-output.md`. Must include:

- Headline (performance vs goal)
- Key results with period-over-period **and** year-over-year change (same month last year, where available)
- Explanation of what drove the results
- What we did this period (work and optimizations carried out)
- What worked / what didn't (honest; trace any dip to its specific cause)
- What's planned next (recommended next steps for the coming period)
- Notes & caveats (data gaps, one-offs)
