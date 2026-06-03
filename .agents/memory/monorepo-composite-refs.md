---
name: Monorepo composite project refs
description: New workspace libs must emit dist declarations before api-server typecheck passes.
---

# Adding a new workspace lib referenced by api-server

When you add a new `lib/<pkg>` (composite TS project) and reference it from
`artifacts/api-server/tsconfig.json` + root `tsconfig.json`, the api-server
`typecheck` (`tsc -p ... --noEmit`) fails with **TS6305: Output file
'.../dist/index.d.ts' has not been built from source file ...** until the
referenced project's declarations exist.

**Fix:** build the lib's declarations once: `pnpm exec tsc -b lib/<pkg>/tsconfig.json`
(the existing libs db/api-zod/api-client-react all have a `dist/`).

**Why:** project references resolve types from the referenced project's emitted
`.d.ts`, not its source. Runtime/dev is unaffected (api-server bundles from
source via esbuild build.mjs), so the endpoint can work end-to-end while
typecheck still fails — don't be fooled into thinking it's fine just because the
server runs.

## After a task merge: refresh codegen + composite builds

If api-server typecheck fails with a missing export from `@workspace/api-zod`
(or api-client-react) right after a merge — even though the runtime works — the
generated client/zod files or their composite build outputs are stale. **Fix:**
`pnpm --filter @workspace/api-spec run codegen` (runs orval from
`lib/api-spec/openapi.yaml`, then `tsc --build` across libs). The OpenAPI spec
is the source of truth; never hand-edit `lib/*/src/generated/*`. Note orval
*cleans then regenerates*, so during the run vite may briefly log
"Failed to load .../generated/api.ts" — transient, gone once codegen finishes.
