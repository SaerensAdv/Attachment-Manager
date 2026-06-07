---
name: Triggering autonomous/long runs reliably
description: Why HTTP-client triggers of long multi-agent runs fail in this env, and the reliable path
---

# Triggering long multi-agent runs (foundation/team runs)

Long multi-agent runs (e.g. web-build with 3 agents + deliverable) routinely
exceed the bash tool's 120s ceiling and any practical curl `--max-time`.

**What does NOT work reliably from the agent shell:**
- Backgrounding curl with `nohup ... &`: the Replit bash tool tears down detached
  child processes (and their `/tmp` redirect files) when the command returns, so
  the request is often never even sent. No generation row appears.
- Foreground `curl --max-time N`: the request IS sent, but when curl disconnects
  the server logs `request aborted` for `POST /api/generate/autonomous`. Even
  though `autonomous.ts` builds an AbortController that it never aborts, in
  practice no archived generation appeared after the client disconnect — do not
  trust client-disconnect to leave the server run running.

**Reliable path: fire server-side via the scheduler.**
- The scheduler (`scheduler.ts`) `fire()` calls `runGeneration(...)` entirely
  server-side, fully decoupled from any HTTP client lifetime, and `markRun`s the
  outcome. Tick is every 60s with an initial 5s delay; a `ticking` guard skips
  overlapping ticks.
- `POST /api/schedules/:id/run-now` ALSO runs synchronously in the request
  handler (awaits `runGeneration` then responds) — so it has the SAME client
  timeout problem as autonomous. Prefer creating an enabled schedule whose cron
  is due now and letting the 60s tick fire it, then poll `GET /api/generations`
  for the new archived row (compare against the pre-trigger max id).

**Verifying completion:** generations only become visible via `/api/generations`
once archived at the end of the run; there is no in-flight progress over that
endpoint, and the engine does not log per-step LLM activity to pino (only request
logs + a final "Scheduled run finished"). So poll by max-id delta, be patient
(several minutes), and check the api-server log for `Scheduled run finished` /
`Scheduled run threw`.

**Why:** burned multiple attempts (Jun 2026) on backgrounded + foreground curl
that produced zero archived rows; the scheduler is the only client-independent
trigger.
