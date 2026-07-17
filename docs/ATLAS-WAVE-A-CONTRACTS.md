# Atlas v4 Backend Wave A contracts

Wave A hardens four backward-compatible contracts without a database migration:

1. **Generation SSE** is a typed union. The HTTP boundary adds `correlationId`, monotonic `sequence`, and `emittedAt` to every event.
2. **Agent lifecycle** adds `lifecycle`, `pausedAt`, and `reason` while retaining `active`.
3. **Todo reliability** retains the legacy arrays and adds per-section `ok|unavailable` status plus `partial`.
4. **Knowledge reader** adds `GET /api/knowledge/item?nodeId=...` with provenance, canonical URL, freshness, relations, and `editable:false`.

## Frontend consumption

`@workspace/api-client-react` exports additive Wave A types and clients from `atlas-wave-a.ts`:

- `getAtlasTodo`
- `getAtlasTeam`
- `getAtlasKnowledgeItem`

This keeps the branch immediately consumable without editing large generated files by hand. `lib/api-spec/atlas-wave-a.openapi.yaml` records the additive schema fragment for the next normal Orval/Zod regeneration and merge into the canonical OpenAPI document.

## Compatibility

- No existing response field or route was removed.
- No generation, approval, ClickUp, scheduler, or DB behavior changed.
- The old direct docs editor remains for compatibility, while Atlas treats repository knowledge read-only.

## Validation

```bash
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/api-client-react typecheck
pnpm typecheck
```
