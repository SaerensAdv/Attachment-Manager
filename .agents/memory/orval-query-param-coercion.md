---
name: Orval required query params coerce missing to "undefined"
description: Why a missing required query param does not fail generated zod validation, and how to return a correct 400.
---

The generated query-param zod schemas (in `lib/api-zod`) emit `zod.coerce.string()`
for required string query params (e.g. `GetDocContentQueryParams`).

**The trap:** `zod.coerce.string()` runs `String(input)`. When the param is absent,
`req.query.path` is `undefined`, and `String(undefined)` === `"undefined"` — a valid
non-empty string. So `safeParse(req.query)` SUCCEEDS with `path: "undefined"` instead
of failing. The handler then falls through to the not-found path and returns 404, not
the contract-required 400 for a missing required param.

**Fix / how to apply:** before relying on the coercing schema, add an explicit
presence guard in the route handler, e.g.
`if (typeof req.query.path !== "string" || req.query.path.length === 0) { 400 }`.
Then run `safeParse`. This applies to any required string query param across the
api-server routes, since they all share the same Orval codegen convention.
