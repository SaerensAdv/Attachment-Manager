# Replit Data Apps — Building Dashboards with the Agent

A "how to use it" reference for handing data-app (data-visualization) work to the Replit Agent. Saerens turns a reporting need into an interactive dashboard that the Replit Agent builds from a prompt. Pair this with `knowledge/replit-prompting.md` (general prompting), `knowledge/reporting-standards.md`, and `knowledge/analytics-standards.md`.

## What a Replit data app is

- An **interactive dashboard or reporting tool**: describe the goal and where the data lives, and the Agent selects KPIs, chart types, and layout and builds a complete dashboard in one shot.
- **Connected data sources**: the project's Replit Database, **warehouse connectors** (BigQuery, Databricks, Snowflake) set up via Integrations, external APIs, or uploaded files (e.g. CSV).
- **Built-in features in every dashboard**: refresh and auto-refresh, export to PDF, export individual chart data to CSV, and light/dark mode.
- **Analysis summary**: the Agent generates insights from the request and the resulting data, and can produce a more detailed analysis document on request.
- Can share the same backend/database as other artifacts (web app, slide deck) in the same project.
- **Availability**: data visualization requires a paid Replit plan.

## What to put in a data-app prompt

- **Goal** — what decision the dashboard supports and what it must track (e.g. "Google Ads performance for one client: spend, leads, CPL, by campaign and over time").
- **Data source & connection** — exactly where the data lives and how to connect (Replit DB, a named warehouse connector, an API, or an uploaded file). Never invent a data source.
- **Metrics / KPIs** — the specific numbers to surface, grounded in the team's reporting work and `knowledge/reporting-standards.md`.
- **Chart types** — which visual for which metric (trend line, bar by campaign, table, single-stat tile).
- **Filters & interactivity** — e.g. date-range filter, campaign/region selector, search, drill-downs.
- **Layout & branding** — grouping and priority of tiles; colours/typography to match the client brand; light/dark.

## Good prompting habits for data apps

- State the goal and the data source first; the Agent uses parallel multi-agent search to explore a warehouse schema, so name the dataset/tables when you know them.
- Be explicit about metric definitions so the dashboard computes what you mean.
- Add filters and drill-downs in follow-up prompts after the first build.
- Never fabricate metrics, rows, or connections — mark anything unconfirmed as **[AAN TE VULLEN: …]**.

## What it is good for

Analytics dashboards (revenue, signups, engagement over time), client-facing reporting tools that stakeholders can filter without database access, data-exploration interfaces, monitoring panels for near-real-time data.

## How Saerens uses this

- Use for client performance dashboards (Google Ads / GA4 / Search Console) and internal reporting. Ground every dashboard in the real data source and the team's approved metrics; never invent data.
- No emojis or decorative symbols, in the prompt or in the dashboard.
- **Recommend, don't deploy**: the prompt prepares the build; a human connects the real data, reviews, and publishes. Nothing goes live automatically.
