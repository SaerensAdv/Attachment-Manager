# Atlas v4 Backend Wave A contracts

Wave A hardens four backward-compatible contracts without a database migration:

1. **Generation SSE** is now a typed union. The HTTP boundary adds `correlationId`, monotonic `sequence`, and `emittedAt` to every event.
2. **Agent lifecycle** adds `lifecycle`, `pausedAt`, and `reason` while retaining the legacy `active` boolean.
3. **Todo reliability** retains the three legacy arrays and adds per-section `ok|unavailable` status plus a top-level `partial` flag.
4. **Knowledge reader** adds `GET /api/knowledge/item?nodeId=...` with provenance, canonical URL, freshness, relations, and `editable:false`.

## Compatibility

- Existing frontend fields and routes remain available.
- No generation, approval, ClickUp, scheduler, or database behavior changes.
- The old direct docs editor remains for compatibility, but Atlas v4 treats repository knowledge as read-only.

## Generated API clients

The new additive fields/endpoints are intentionally server-first in this branch. Before the Atlas frontend consumes them, mirror these contracts into `lib/api-spec/openapi.yaml` and regenerate Orval/Zod in Replit. The current frontend remains compatible because no existing response field was removed or renamed.

## Validation commands

```bash
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/api-server test
pnpm typecheck
```
