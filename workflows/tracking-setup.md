# Workflow: Tracking Setup & Review

## Goal

Define or review how a client's conversions are measured — across GA4, Google Ads, and Meta — so every other agent works from trustworthy, consistent data. The output is a clear measurement plan and tracking spec that a human implements.

## When to use

When onboarding a new client, before launching a new campaign or landing page, when reported numbers look wrong or inconsistent, or before trusting reporting and optimization decisions.

## Steps

1. Identify the client, business type (lead gen or e-commerce), and primary goal (`clients/<client>.md`).
2. List the conversion actions that matter and their value.
3. Review the current setup: GA4, Google Ads conversions, Meta Pixel / Conversions API, and tag-manager structure.
4. Check data integrity per `knowledge/measurement-reporting.md`: duplicate conversions, missing events, attribution settings, and consent/cookie basics.
5. Define the measurement plan (events and KPIs) so Optimization and Reporting use the same definitions.
6. Write a recommended tracking spec: events, parameters, and where each fires.
7. Note dependencies — what the Web Developer or a human must implement.
8. Flag tracking risks and what must be verified before the data can be trusted.

## Agents involved

- Orchestrator Agent (routes and briefs)
- Analytics & Tracking Specialist (lead)
- Web Developer / Builder (implements the spec on pages, where relevant)
- Google Ads Optimization Specialist & Reporting Specialist (consumers of the data)

## Required output

Follow `templates/task-output.md` and `knowledge/measurement-reporting.md`. Must include:

- Measurement plan (events and KPIs that matter)
- Tracking review (current setup, gaps, issues)
- Recommended tracking spec (events, parameters, where they fire)
- Data integrity checks (duplicates, attribution, consent basics)
- Dependencies (what a human / Web Developer must implement)
- Open questions / missing data
- Human approval required (anything affecting live tracking or accounts)
