# Workspace Atlas v4: Wave E migration readiness

Wave E closes the last contract and delivery gaps before the React frontend migration. It does not replace the frontend and it does not activate live ClickUp writes automatically.

## Delivered

- additive typed React clients for System Status, Operations, Companies master sync, push history and dead-letter recovery;
- Zod contracts and regression tests for the new Atlas response surfaces;
- an OpenAPI Wave E overlay merged into the legacy spec before Orval codegen;
- truthful approval semantics: approval creates a Gmail draft and never claims the client email was sent;
- GitHub CI for codegen, workspace typecheck, API/frontend tests and both production builds;
- a read-only-by-default runtime smoke script;
- explicit opt-in gates for the first Companies sync and denied-workspace webhook signature smoke.

## Replit validation

```bash
git fetch origin
git switch brain/atlas-v4-migration-readiness-wave-e
git pull origin brain/atlas-v4-migration-readiness-wave-e
pnpm --filter @workspace/api-spec codegen:check
pnpm typecheck
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/system-map test
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/api-server build
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/system-map build
```

Codegen refreshes generated files in the working tree for the remaining validation commands. A failed generation restores the last committed generated clients automatically, so one bad spec cannot break the checkout.

## Runtime smoke, safe default

With the deployed app URL and an owner session token:

```bash
ATLAS_BASE_URL=https://your-app.example \
ATLAS_SESSION_TOKEN=... \
pnpm --filter @workspace/scripts atlas:smoke
```

This only reads health, operations, Companies mirror and sync status.

## Controlled first Companies sync

This writes only to the local mirror/runtime client cache. It never writes Companies back to ClickUp:

```bash
ATLAS_BASE_URL=https://your-app.example \
ATLAS_SESSION_TOKEN=... \
ATLAS_CONFIRM_COMPANIES_SYNC=SYNC_CLICKUP_COMPANIES \
pnpm --filter @workspace/scripts atlas:smoke -- --companies-sync
```

Inspect `companyCount`, `linkedClientUpdates`, `missingLinkedCompanies` and the mirrored Companies before frontend work starts.

## Signed webhook smoke

This sends a correctly signed event with a deliberately forbidden workspace and fake task. It proves raw-body HMAC intake and durable queue acceptance while guaranteeing the worker rejects it before task lookup or Gmail draft creation:

```bash
ATLAS_BASE_URL=https://your-app.example \
ATLAS_SESSION_TOKEN=... \
CLICKUP_WEBHOOK_SECRET=... \
pnpm --filter @workspace/scripts atlas:smoke -- --webhook-signature-smoke
```

## Frontend migration gate

Start the Atlas React branch only after codegen, typecheck, tests and builds are green, the controlled Companies sync has been inspected, and the denied-workspace webhook smoke is visible in Operations without a Gmail action. Legacy routes remain available until each Atlas lens reaches parity and rollback is verified.
