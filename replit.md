# Saerens Advertising — AI Team

A documentation-first **AI brain** for Saerens Advertising (a Belgian, Google Partner Google Ads agency) **and** the running application built on top of it. The markdown in `agents/`, `workflows/`, `knowledge/`, `templates/` and `clients/` defines the AI team; the app reads that markdown at runtime to assemble prompts, route work, and produce reviewable deliverables. The docs are the configuration; the app is the engine.

## Run & Operate

Each artifact runs as its own Replit workflow (managed for you — no need to start them by hand). Useful commands:

- `pnpm --filter @workspace/api-server run dev` — build + run the API server ("the brain")
- `pnpm --filter @workspace/system-map run dev` — run the Operations Atlas frontend (Vite)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec (run after changing the spec or after a merge)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string. Live integrations and AI use Replit-managed secrets/connectors (see `environment-secrets` and `integrations` skills).

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **API ("brain"):** Express 5, Pino logging, Helmet + express-rate-limit, esbuild (CJS bundle)
- **Frontend ("Operations Atlas"):** React + Vite, Dagre graph layout, CodeMirror, Mermaid, Shiki
- **AI:** Anthropic SDK via the Replit AI integrations proxy (`@workspace/integrations-anthropic-ai`)
- **DB:** PostgreSQL + Drizzle ORM; Zod (`zod/v4`) + `drizzle-zod` validation
- **Retrieval:** Orama (BM25) fused with local Transformers.js embeddings (RRF); embeddings persisted in a self-bootstrapped pgvector table
- **Deliverables:** pdfkit / jspdf / docx (PDFs, invoices, reports), sharp (images), object storage (`@google-cloud/storage`)
- **Scheduling:** in-app `croner` tick (n8n was dropped)
- **API codegen:** Orval (from OpenAPI spec). **Tests:** Vitest + supertest

## Where things live

This is a pnpm monorepo. The root markdown is the AI brain; `artifacts/` and `lib/` are the running app.

- `README.md` — what the AI team system is and how the docs are organized
- `AGENTS.md` — the constitution: global agent rules + the agency organisation (departments/owners)
- `ARCHITECTURE.md` — the layer model, folder/artifact map, and runtime flow
- `ROADMAP.md` — what is shipped and what remains (plus longer-term direction notes)
- `agents/` (24), `workflows/` (27), `knowledge/` (32), `templates/` (10), `clients/` — the brain, read at runtime
- `artifacts/api-server` — the API ("brain"): orchestrator + generation engine, SSE streaming, deliverables, live integrations, scheduler, email, client DB, billing
- `artifacts/system-map` — the React frontend ("Operations Atlas" / the Kaart): doc-graph view, generation command bar, doc reader, client register, team page, dashboard, planning, history
- `artifacts/audit-car-audio-*`, `artifacts/saerens-audit-deck-template` — slide-deck artifacts
- `artifacts/mockup-sandbox` — design/canvas preview sandbox
- `lib/` — shared workspace libraries: `api-spec` (OpenAPI), `api-zod`, `api-client-react`, `brand`, `db` (Drizzle schema), `integrations-anthropic-ai`
- `deck-templates/` (repo root, outside `artifacts/`) — uncounted deck source kept out of the 7-artifact cap

## Architecture decisions

- **The app is the brain; the markdown is its configuration.** Agents, workflows, knowledge and client dossiers live as root markdown and are read at runtime — no app restart needed to change an agent. This keeps roles, client data, and processes editable in one place.
- **Read-only live integrations only.** Google Ads, GA4, Search Console, PageSpeed, Places, Business Profile, competitor ads (SerpApi), Bing Webmaster and the Screaming Frog crawl intake all pull data; nothing writes to a live account. Anything that would touch live spend or the client goes through a **human approval** checkpoint.
- **Deliverable layer on top of markdown.** A workflow opts into a typed end product via an HTML-comment marker (`<!-- deliverable: kind -->`); the team's markdown is always preserved even if the deliverable step fails (best-effort).
- **In-app scheduler instead of n8n.** A 60s `croner` tick fires due runs with a compare-and-set guard against double-firing; 24/7 operation needs a Reserved VM deployment.
- **Every run is archived.** The generation engine persists runs + per-step records (status = worst step) on every exit path for an audit trail; autonomous runs are gated behind `AUTONOMOUS_TRIGGER_SECRET`.

## Product

An AI agency team for Saerens Advertising: specialized agents (Orchestrator, Google Ads strategist/setup/optimization, Reporting, Copywriter, SEO, Meta, web/landing, analytics, client success, sales, QA & compliance, humanizer, and more) organised into departments. A request is answered by combining global rules + the routed agent + client dossier + workflow + the user's ask into structured markdown, then optionally turned into a concrete deliverable (Replit build prompt, Google Ads / negative-keyword CSV, monthly report email, branded PDF, invoice/proposal). Live read-only account data enriches the work; the human is the single quality-control gate.

## User preferences

- Builds and deploys exclusively on Replit. Do NOT recommend or assume external platforms (WordPress, Webflow, Squarespace, Vercel, Netlify, etc.). Keep all solutions native to Replit (its hosting, deployments, integrations, database).
- Thinks future-oriented — favor durable, forward-looking approaches over quick throwaway fixes.
- Communicate in Dutch (Vlaams).
- No emojis anywhere — not in generated output (reports, copy), not in the app UI, not in any deliverable (e.g. website builds). Keep the tone professional and businesslike.
- North star: "AI medewerkers" that handle nearly all agency work end-to-end, with the user as the single human quality-control gate. Output quality is a top priority — prefer higher-quality results over more features.
- Rapportage-mails (Google Ads én SEO) moeten voortaan onder Axels eigen handtekening staan — niet die van een andere medewerker (bv. Elke). Nog te implementeren als vaste afzender-identiteit voor rapporten (afgesproken juli 2026, uit te werken bij de volgende rapportronde).
- Ideaal dagritme (doel: minder mentale last, consistenter werken):
  - Voormiddag 09:00–13:00 = deep work — geplande taken uitvoeren.
  - Namiddag 13:00–17:00 = meetings; geen meetings → vrije tijd. Mails/berichten die 's namiddags binnenkomen worden door AI behandeld (bv. antwoord-draft opstellen) zodat de user ze de volgende ochtend reviewt en doorstuurt.
  - De user slaapt moeilijk in en staat vaak later op — wees flexibel met harde kloktijden (denk eerder in "ochtendblok / namiddagblok" dan in exacte uren).

## Gotchas

- **Changing the OpenAPI spec or a shared lib requires codegen/build.** Run `pnpm --filter @workspace/api-spec run codegen` after spec changes; composite project refs need built `dist` (`tsc -b`) or `api-server` typecheck fails (TS6305) — especially after a task merge.
- **The api-server dev build is bundled (`dist/`).** Route changes need a restart of the `API Server` workflow to take effect; `tsx watch` does not reload them.
- **Two schemas are self-bootstrapped outside Drizzle** (the pgvector embeddings table and `crawl_snapshots`); `pnpm db push` does not manage them. They are best-effort with in-memory/no-op fallbacks.
- **Container `curl` egress is blocked** (returns HTTP 000); test outbound calls via the code-execution sandbox `fetch()` or workspace `node`, not `curl`.
- **Decks live within a 7-artifact cap.** Template source stays in repo-root `deck-templates/` (uncounted); generated decks reuse a shared demo artifact slot.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `ARCHITECTURE.md` for the runtime flow and `ROADMAP.md` for what is shipped vs. outstanding
