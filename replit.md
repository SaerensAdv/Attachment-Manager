# Saerens Advertising — AI Team

The documentation-first foundation ("AI brain") for Saerens Advertising's internal AI agent system: structured markdown defining agent roles, client context, workflows, output templates, and agency standards. No app yet — see `ROADMAP.md` for later phases.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `README.md` — what the AI team system is and how docs are organized
- `AGENTS.md` — the constitution: global agent rules, hierarchy, current + future agents
- `ROADMAP.md` — phased plan (documentation-first → tool integrations)
- `ARCHITECTURE.md` — the five-layer model and folder map
- `agents/` — one role file per AI agent
- `clients/` — client context (template + example); kept separate from agent files
- `workflows/` — repeatable agency processes
- `templates/` — reusable structured output formats
- `knowledge/` — agency standards (principles, tone, Google Ads, analytics, reporting, naming)
- The pnpm workspace scaffold (`artifacts/`, `lib/`) is unused by this documentation deliverable.

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

A documentation foundation that defines specialized AI agents for Saerens Advertising (a Belgian Google Ads agency). Each agent has a role, responsibilities, limits, required input, and a structured output format. Work is produced by combining: global rules + agent + client context + workflow + the user's request. MVP agents: Orchestrator, Google Ads Strategist, Setup Specialist, Optimization Specialist, Reporting Specialist, Copywriter.

## User preferences

- Builds and deploys exclusively on Replit. Do NOT recommend or assume external platforms (WordPress, Webflow, Squarespace, Vercel, Netlify, etc.). Keep all solutions native to Replit (its hosting, deployments, integrations, database).
- Thinks future-oriented — favor durable, forward-looking approaches over quick throwaway fixes.
- Communicate in Dutch (Vlaams).

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
