---
name: Triggering autonomous/long runs reliably
description: How to fire long multi-agent runs server-side from the agent shell, and why polling too early looks like failure
---

# Triggering long multi-agent runs (foundation/team/report runs)

Long multi-agent runs (web-build, monthly/SEO report, etc.) routinely exceed the
bash tool's 120s ceiling and any practical curl `--max-time`. They must run
INSIDE the api-server (which has external egress + the LLM proxy); a plain
bash/tsx process has NO external egress in this container, so anything that
fetches Google/Bing/PageSpeed (e.g. `fetchSeoReportSnapshot`) HANGS from the
shell. (Internal endpoints — the LLM proxy and Postgres — ARE reachable from
bash.)

**`POST /api/generate/autonomous` DOES survive client disconnect (corrected).**
- The route is secret-gated (`x-trigger-secret` == `AUTONOMOUS_TRIGGER_SECRET`)
  and auth-exempt. It runs `runGeneration(...)` with an AbortController it NEVER
  aborts and NO `req.on('close')` wiring, so when the triggering curl is torn
  down the server logs `request aborted` (just the HTTP layer) but the run keeps
  going and completes to an archived row + HELD `pendingDelivery` ~run-duration
  later (observed ~6 min for an SEO report).
- **Why the old note said "no archived row": polling too early.** Generations
  become visible/archived only at the END of the run; there is no in-flight row
  and the engine doesn't log per-step LLM activity to pino. Earlier sessions gave
  up before the run finished. Fix = be patient and poll by max-id delta.
- So: fire the autonomous POST (a detached curl is fine even though the tool
  reaps it after the command returns — the request is already in flight), then
  poll `SELECT ... FROM generations WHERE id > <preTriggerMax>` every ~90s for
  several minutes until a `completed` row with `pending_delivery` appears.

**Scheduler is an equivalent fallback.** `scheduler.ts` `fire()` runs
server-side, fully client-independent; tick every 60s (+5s initial delay),
`ticking` guard. Insert an enabled `schedules` row whose `next_run_at` is in the
past (cron_expr must be valid croner) and it fires on the next tick, recording
`last_generation_id`. `POST /api/schedules/:id/run-now` awaits in the request
handler, so it has the same client-timeout caveat as autonomous. Delete the
throwaway row after it fires, or its cron re-fires on the next real occurrence.

**Gotcha — `next_run_at` MUST be millisecond precision when inserted via raw
SQL.** `claim()` is a compare-and-set that matches the row with `eq(nextRunAt,
expected)` where `expected` is the JS `Date` read back from the row (JS Dates are
millisecond precision). `now()` / `now() - interval '2 minutes'` yields a
MICROSECOND timestamp (e.g. `...11.016715`); the round-trip truncates it to
`.016`, so `eq` never matches by value → `listDue` keeps finding the row but
`claim` silently returns 0 rows and it NEVER fires, with NO log line. Symptom:
`is_due=t` yet `next_run_at` stays put and `last_run_at` empty across many ticks.
Fix: insert `date_trunc('milliseconds', now()) - interval '5 minutes'`. Schedules
created through the app avoid this because `computeNextRun` returns a ms-precision
JS Date.

**Gotcha — the cron_expr must have a REAL next occurrence.** A never-matching
expression (e.g. `0 0 31 2 *`, Feb 31) makes croner yield no `next`, and the
tick silently skips the row (never claims, no log). For one-off triggers use a
far-off but valid cron like `0 3 1 1 *` and delete the row after it fires.

**Rendering a report PDF locally without Gmail:** trigger the report deliverable
server-side (autonomous or scheduler) with the client's `report_email` temporarily
set so the hold path builds a full payload; it stops at the approval hold (never
sends). Then render the PDF from that generation's `pending_delivery` with a
DB-only script (see `scripts/render-seo-pdf.ts`: getGeneration →
parseSeoReportDeliveryPayload → renderReportPdf) — no external egress needed.
Afterwards restore `report_email` to its original value and delete the throwaway
generation (+ its `generation_steps`) so no held approval lingers.
