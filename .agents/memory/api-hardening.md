---
name: API hardening (Block 1)
description: Boot env validation ordering, helmet/rate-limit posture, and the db-mock test pattern for the api-server.
---

# API server hardening

## Env validation must run before the app/db import graph
`validateEnv()` lives in `lib/env.ts`, but the app graph transitively imports the
`@workspace/db` client which **throws at import time** on a missing
`DATABASE_URL`. So `index.ts` validates env first, then pulls in `app`,
`semantic`, `scheduler` via **dynamic `await import(...)`** (top-level await).
**Why:** with static imports, ESM hoisting runs the db throw before
`validateEnv()`, so the friendly Dutch env message never fires.
**How to apply:** keep the dynamic-import ordering in `index.ts`; never convert
those back to static top-of-file imports. esbuild esm output supports TLA, so the
build stays fine.

## Rate limiter is intentionally global
`express-rate-limit` is mounted only on the LLM-cost endpoints (`/api/generate`,
`/api/route`) with `validate: { xForwardedForHeader: false }` and no
`trust proxy`. All traffic arrives via one Replit proxy IP, so this keys off the
socket IP and becomes a deliberate shared/global throttle.
**Why:** this is a single-team internal tool; cost control matters more than
per-client fairness.
**How to apply:** if this ever goes multi-tenant/public, switch to
`trust proxy` + forwarded-IP (or authenticated-user) keying, or one noisy client
throttles everyone.

## Helmet posture for a JSON API behind the proxy
`contentSecurityPolicy: false` (no HTML surface) and
`crossOriginResourcePolicy: "cross-origin"` so the `system-map` web artifact can
consume the API across the proxy origin. CORS already governs JS access.
**How to apply:** don't tighten CORP to same-origin without checking the web
artifact still reaches the API across the proxy.

## DB-mock test pattern (clients.test.ts)
Tests mock `@workspace/db` with a FIFO queue: each awaited drizzle chain dequeues
the next pre-queued result array (in handler await order). `drizzle-orm`'s
`eq`/`and` are `vi.hoisted` spies so tests can assert the **predicate shape**
(optimistic lock = `and(eq(id), eq(updatedAt))` folded into the UPDATE WHERE, not
a read-then-write).
**Why:** the FIFO queue is white-box/fragile on await order; the eq/and spies are
what actually guard against an optimistic-lock predicate regression.
**How to apply:** if a route's await sequence changes, re-queue results in the new
order; keep the predicate-shape assertions when touching the version logic.
