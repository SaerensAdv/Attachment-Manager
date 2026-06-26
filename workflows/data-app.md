# Workflow: Data App Build

<!-- deliverable: data-app-prompt -->

## Goal

Turn a reporting need into a paste-ready Replit build prompt for a **data app** — an interactive dashboard or reporting tool the Replit Agent builds (Data Visualization artifact) with built-in refresh, PDF/CSV export, light/dark mode, and an analysis summary. A human connects the real data, reviews, and publishes; nothing goes live automatically. This workflow's deliverable is a Replit prompt; write it per `knowledge/replit-builds.md`, `knowledge/replit-builds.md`, `knowledge/measurement-reporting.md`, and `knowledge/measurement-reporting.md`.

## When to use

A client or the team needs an interactive dashboard: a performance dashboard (Google Ads / GA4 / Search Console), a client-facing reporting tool, a data-exploration interface, or a monitoring panel — and we want it buildable by the Replit Agent.

## Steps

1. Identify the goal: what decision the dashboard supports and what it must track (`clients/<client>.md`).
2. Pin the data source and how to connect it (Replit DB, a warehouse connector, an external API, or an uploaded file) — never invent a data source.
3. Define the metrics/KPIs to surface, grounded in the team's reporting work and `knowledge/measurement-reporting.md`; never fabricate data.
4. Choose chart types per metric and the filters/interactivity (date range, campaign/region selector, search, drill-downs).
5. Set layout and branding: tile grouping/priority, applying the Saerens house style (`knowledge/saerens-brand.md`) — it is an agency reporting tool, like the Saerens report. Pre-fill what the agency already knows; mark only genuinely unknown items as placeholders.
6. Confirm built-in needs (refresh/auto-refresh, PDF export, chart-to-CSV, analysis summary). Prepare the human approval summary.

## Agents involved

- Orchestrator Agent (routes and briefs)
- Web Developer / Builder (lead — assembles the build spec)
- Reporting Specialist (metrics, KPIs, what to show and how to read it)
- Analytics & Tracking Specialist (data sources and connection integrity)

## Required output

Follow `templates/task-output.md`. Must include:

- Dashboard goal and the decision it supports
- Data source(s) and connection method (no invented sources)
- Metrics/KPIs with definitions, and the chart type for each
- Filters and interactivity
- Layout and branding (grouping, colours, light/dark)
- Open questions / missing data (as placeholders)
- Human approval required (a human connects real data, reviews, and publishes — nothing goes live automatically)
