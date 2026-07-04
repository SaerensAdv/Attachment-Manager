---
name: In-app scheduler
description: How scheduled autonomous runs work after n8n was dropped; the firing model and its deploy constraint.
---

# In-app scheduler (replaces n8n)

The app owns its own *in-app* scheduled runs: schedules live in a DB table, the
api-server runs a 60s tick loop (croner) that finds due rows and calls the existing
generation engine with `triggerSource:"scheduled"`. Results archive + count in KPIs
like any run.

NOTE (corrected): the earlier "n8n has no public API / was dropped" blocker was
about the n8n *Cloud* trial only. Self-hosted n8n Community Edition is free for
commercial use with a full API and unlimited runs — so n8n remains the intended
external real-world executor (see system-architecture-direction.md). The in-app
croner scheduler is the in-app trigger fallback, not a replacement for that vision.

**Firing model / invariants (do not regress):**
- Double-fire prevention is a compare-and-set claim on `nextRunAt`
  (`WHERE id AND enabled AND nextRunAt=expected`), not just the in-process tick
  mutex. Both must stay — the CAS is what makes it safe under overlapping sweeps.
- Timezone is `Europe/Brussels` end to end: croner computes `nextRunAt` with the
  row's timezone; the frontend formats with the same `timeZone`.
- `run-now` (and any future fire path) MUST wrap the generation in try/catch and
  still `markRun(..., lastStatus:"failed")` on throw — never leave a run without
  bookkeeping.

**Deploy constraint (tell the user):** the scheduler only fires while the server
process is alive. True 24/7 automation requires publishing as a **Reserved VM**
(always-on), not an autoscale/scale-to-zero deployment. This is surfaced in the
Planning page warning banner.

**Priming a one-off run by inserting a row directly (SQL):** works — set
`enabled=true` and `next_run_at` in the past, the next tick claims + fires it once
(claim advances `next_run_at` to the cron's next occurrence), records
`last_generation_id`/`last_status`, then delete the row. BUT `next_run_at` must have
≤ millisecond precision. The claim CAS is an exact `eq(nextRunAt, expected)` where
`expected` is a JS Date (ms precision) drizzle read back from `listDue`. A
microsecond value (e.g. straight `now()`, which stores `.NNNNNN`) is truncated by
JS Date, so the CAS never matches: the row shows `is_due=true` forever but is never
claimed/fired (and `next_run_at` stays unchanged — the tell-tale). Fix: insert with
`date_trunc('second', now())` (or `'milliseconds'`). Diagnosis time-sink; check this
first if a hand-inserted schedule refuses to fire.
