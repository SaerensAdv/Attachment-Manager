# Atlas v4 Backend Wave C

Wave C makes ClickUp Companies the customer master without writing back to ClickUp:

- local `clickup_companies` mirror for every Company task;
- owner-authenticated full sync and status endpoints;
- linked client cache upserts for `name`, `website`, and `currentState`;
- field ownership metadata on every client response;
- server-side 409 guard against local overwrites of ClickUp-owned fields;
- technical integration configuration remains Replit-owned;
- no automatic creation of delivery clients from prospects/unlinked companies.

Endpoints:

```plain
POST /api/clickup/companies/sync
GET  /api/clickup/companies/sync-status
GET  /api/clickup/companies
```

The mirror contains all Companies. The `clients` table remains the runtime/delivery cache. Unlinked Companies are visible for review but are not silently promoted to active delivery clients.

Validation:

```bash
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/api-server test
pnpm typecheck
```
