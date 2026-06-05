---
name: In-app scheduler
description: How scheduled autonomous runs work after n8n was dropped; the firing model and its deploy constraint.
---

# In-app scheduler (replaces n8n)

n8n was abandoned (their trial has no public API). Scheduled runs are now owned
entirely by the app: schedules live in a DB table, the api-server runs a 60s tick
loop (croner) that finds due rows and calls the existing generation engine with
`triggerSource:"scheduled"`. Results archive + count in KPIs like any run.

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
