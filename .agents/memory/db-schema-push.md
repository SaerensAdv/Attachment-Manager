---
name: Syncing the dev DB schema
description: Why drizzle-kit push is unsafe in this repo and how to apply additive schema changes instead
---

The dev database drifts behind the drizzle schema (columns defined in code but
absent in the live table). Symptom: `db.select().from(table)` and inserts fail
at runtime/in tests with `column "X" does not exist`, even though X is in
`lib/db/src/schema/*`.

**Do NOT run `drizzle-kit push` / `push-force` to fix it.**
- It needs a TTY and errors out non-interactively ("Interactive prompts require
  a TTY").
- It prompts to resolve tables it doesn't know about. Several tables are
  self-bootstrapped OUTSIDE the drizzle schema (pgvector embedding cache,
  `crawl_snapshots`). A force push can DROP them.

**How to apply:** for additive, nullable columns just run idempotent DDL against
`DATABASE_URL`:
`alter table <t> add column if not exists <col> <type>` — safe, no data loss, no
prompts.

Separately, `@workspace/api-server`'s typecheck reads BUILT declarations of the
workspace libs (composite project refs, `emitDeclarationOnly` → `dist/`). After
a merge these go stale and you get bogus `has no exported member` errors (e.g.
`sessionsTable`, `AuthUser`) for members that plainly exist in source. Fix:
`npx tsc -b lib/db lib/api-zod` to refresh the declarations.
