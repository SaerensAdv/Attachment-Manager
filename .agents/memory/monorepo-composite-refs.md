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
