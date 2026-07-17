# Atlas v4 Backend Wave B

Wave B adds truthful runtime observability without changing frontend visuals:

- `GET /api/system/status`: process, DB, graph, scheduler and configuration checks.
- `GET /api/operations/status`: approvals, proposals, alerts, push queue, scheduler and graph freshness.
- `GET /api/clickup/pushes`: push history with correlation, attempts, retry and dead-letter state.
- `POST /api/clickup/pushes/:id/requeue`: operator requeue for retryable/terminal records.
- Scheduler heartbeat and scoped correlation IDs.
- ClickUp push retry classification with exponential next-attempt time and dead-letter after five attempts.

The requeue endpoint resets the durable ledger; because historical rows do not store sensitive payload bodies, the original idempotent producer must offer the push again. This is intentional: report bodies and client data are not duplicated into an observability queue.

Validation:

```bash
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/api-server test
pnpm typecheck
```
