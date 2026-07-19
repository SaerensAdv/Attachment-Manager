# Workspace Atlas and Saerens Integration Runtime

This repository contains two deliberately separate products:

1. **Workspace Atlas**, the read-only visual digital twin of the Saerens Operating System.
2. **Thin technical services** for proven gaps such as provider APIs, webhooks, retries, batch processing, reporting renderers and deterministic transformations.

ClickUp is the operating system and canonical owner of work, clients, business knowledge, approvals, Skills, Super Agents, Automations and reporting memory. GitHub owns source code, tests, schemas and implementation-specific technical configuration. Replit runs only the visualization and retained technical services.

## Workspace Atlas

Atlas preserves the immersive system map:

- bounded ClickUp, GitHub and runtime projections;
- Structure, Knowledge, Agents, Active and Flows lenses;
- 45 FPS Explore mode with reduced-motion support;
- contextual inspector, source links, provenance and diagnostics;
- read-only Agents and Knowledge projections;
- Health evidence for build identity, workers, graph snapshots and connectors.

Atlas must never become a second writable ClickUp. Node movement is viewport-only. Business configuration opens in its canonical ClickUp source.

## Retained technical capabilities

Custom code remains only where ClickUp cannot reliably provide the capability, including:

- external marketing and analytics APIs;
- signed webhooks, idempotency, retries and dead letters;
- Google Ads safety gates and bounded provider mutations;
- report/PDF/email packaging required for month-end reporting;
- technical logs, runtime health and deterministic rendering.

Client communication, live account changes, finance and destructive actions remain human-gated.

## Repository map

- `artifacts/api-server`: Express API, connectors, workers, reporting and observability.
- `artifacts/system-map`: Workspace Atlas frontend.
- `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`: browser API contracts.
- `lib/db`: technical persistence schemas.
- `agents/`, `workflows/`, `knowledge/`, `templates/`: temporary or implementation-specific runtime sources under active ClickUp migration. They are not the business system of record.
- `scripts/src/atlas-smoke.ts`: authenticated production smoke test.

## Validate

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/system-map test
pnpm run build
```

After deployment:

```bash
ATLAS_BASE_URL=https://your-deployment \
ATLAS_SESSION_TOKEN=... \
ATLAS_EXPECTED_SHA=$(git rev-parse HEAD) \
pnpm --filter @workspace/scripts atlas:smoke
```

The production graph must use `GRAPH_OVERVIEW_UNLIMITED=false`. Search and neighbor expansion still reach the complete active snapshot.

## Production readiness

A release is ready only when:

- frontend and API report the expected Git SHA;
- `/api/system/status` is not down and reports independent checks;
- the graph has an active bounded snapshot and diagnostics;
- scheduler and webhook heartbeat evidence is current where enabled;
- backup evidence is fresh and a restore rehearsal is recorded;
- one Google Ads and one SEO month-reporting run pass before reporting runtime is reduced further.

See ClickUp for the current architecture decision, operating procedures and migration status. Historical repository docs remain evidence, not governing business truth.
