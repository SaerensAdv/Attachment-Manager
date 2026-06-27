---
name: Operator alerts + "Te doen" overview
description: How silent best-effort failures surface in-app (system_alerts) and the single operator to-do aggregator; the never-throw + dedupe invariants.
---

The app runs many BEST-EFFORT background paths (scheduler fire, inbound-email poller / processThread, deliverable execution, run archival / persistRun) whose failures previously only hit the logs — invisible to the solo operator. `system_alerts` + the `/todo` surface make them visible.

## system_alerts table — self-bootstrapped, NOT via drizzle
`ensureAlertsTable()` runs `CREATE TABLE IF NOT EXISTS` (+ indexes) at boot, memoized with retry. **Why not a drizzle migration:** this project never runs `drizzle-kit push` (TTY + it can drop out-of-band tables); same self-bootstrap pattern as the pgvector embeddings cache and `crawl_snapshots`. The table is typed in drizzle for query ergonomics, but creation is owned by the bootstrap, not a migration.

## recordAlert invariants (do not regress)
- **Fire-and-forget, never throws into the caller.** Every call site is `void recordAlert(...)` INSIDE its own catch block. An alert-write failure must NEVER mask or escalate the original failure — `recordAlert` self-swallows (own try/catch + warn). If it ever threw, it would turn a logged best-effort failure into a crash.
- **Dedupe by fingerprint via a partial unique index.** A recurring failure bumps `occurrences`/`lastSeenAt` on the existing UNRESOLVED row (one row, not a flood). Resolving sets `resolvedAt`; the next occurrence opens a fresh row. Callers pass a stable `context.key` as the fingerprint seed (e.g. `schedule:<id>`, `thread:<id>`, `scheduler-tick`, `inbound-tick`).
- **Context = IDs + short error strings only.** No secrets/PII; errors sliced to 500 chars. (Generation alerts may include a client NAME for operator readability — acceptable on the authenticated in-app surface only.)

## In-app only — NO email alerts
Alerts surface ONLY in the app ("Te doen" page + nav badge). **Why no email:** an email-send failure that itself emails an alert can loop/recurse; in-app alerting deliberately avoids that.

## /todo aggregator
`GET /todo` is a BEST-EFFORT `Promise.all` of three independent sources (pending file proposals, pending approvals, unresolved alerts), each with `.catch(() => [])` — one failing source must not blank the whole overview. `pendingDelivery.kind` is parsed tolerantly (absent ⇒ monthly-report, the same backward-compat union as the approval path). The frontend "Te doen" page links each item into History/approval; the nav badge polls the count.

## Where alerts are wired
Highest-value silent catch sites: scheduler tick + per-schedule fire (INCLUDING the `resolveGenerationContext` `!ok` branch, not just thrown errors), inbound poller tick + per-thread processing, deliverable execution, and run archival / persistRun. Add a `recordAlert` at any NEW best-effort catch that would otherwise only log.
