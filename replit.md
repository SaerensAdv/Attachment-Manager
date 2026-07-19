# Workspace Atlas: Replit Runtime Guide

## Role of this runtime

Replit hosts the Workspace Atlas read-only visual digital twin and small technical services for proven ClickUp capability gaps. It is not the customer master, business knowledge base, workflow owner, approval system or default AI execution layer.

## Canonical ownership

- **ClickUp:** work, clients, Docs, SOPs, Skills, Super Agents, Automations, approvals and reporting memory.
- **GitHub:** code, tests, CI/CD, schemas and implementation-specific technical configuration.
- **Replit:** deployed process, provider API calls, webhooks, retries, batch jobs, technical logs, graph snapshots and deterministic rendering.

## Run and validate

```bash
pnpm --filter @workspace/api-server dev
pnpm --filter @workspace/system-map dev
pnpm typecheck
pnpm run build
pnpm --filter @workspace/api-spec codegen
pnpm --filter @workspace/db push
```

Production smoke:

```bash
ATLAS_BASE_URL=https://your-deployment \
ATLAS_SESSION_TOKEN=... \
ATLAS_EXPECTED_SHA=$(git rev-parse HEAD) \
pnpm --filter @workspace/scripts atlas:smoke
```

## Deployment requirements

- Reserved VM/GCE deployment for scheduler and workers.
- `ATLAS_DEPLOYMENT_MODE=reserved-vm`.
- `GRAPH_OVERVIEW_UNLIMITED=false` in production.
- `DATABASE_BACKUP_LAST_SUCCESS_AT` updated after a verified backup.
- `DATABASE_RESTORE_REHEARSAL_AT` updated only after a successful restore rehearsal.
- API changes require a rebuild and process restart because the server is bundled.
- Matching repository checkout is not proof of matching frontend/API bundles; verify in System Health.

## Safety invariants

- Atlas graph and Knowledge/Agents projections are read-only.
- Node dragging never writes to ClickUp.
- Gmail approval creates a draft unless a separate provider-confirmed send contract exists.
- Live Google Ads writes remain disabled by default, dry-run first, explicitly confirmed and bounded.
- Failed graph sync preserves the last valid snapshot.
- Missing health evidence is unknown/degraded, never fabricated as healthy.

## Month-end reporting gate

Do not remove reporting connectors, templates, renderer code, client mappings or protected runtime sources until one complete Google Ads report and one complete SEO report have passed end to end and their final output is retained in ClickUp.

## Operational sequence

1. Merge green CI.
2. Rebuild and restart API and frontend workflows or redeploy the Reserved VM.
3. Run the authenticated production smoke test against the deployed URL and expected SHA.
4. Run graph sync, verify lens/source counts and inspect System Health.
5. Capture database backup evidence and rehearse restore in an isolated target.
6. Record evidence and incidents in ClickUp.
7. Continue the ClickUp migration only after reporting safety gates pass.
