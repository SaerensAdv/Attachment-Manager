---
name: Run archival & audit-trail consistency
description: Invariants for archiving generation runs and keeping run-level status consistent with the per-agent step trail.
---

# Run archival & audit-trail consistency

The generation flow records a per-agent step trail (one step per agent + a
deliverable step) alongside the run row, so any run — including failed, aborted,
truncated, and autonomous runs nobody watched — is reviewable afterward.

**Single source of truth:** the team loop + deliverable + persistRun live in ONE
engine shared by both the interactive SSE route and the autonomous trigger route.
Never fork this logic per-route — the archival/status invariants below must hold
identically for every trigger source. The engine takes a `sink` (SSE writer vs
no-op) and an `AbortSignal`; routes only format output.

## Invariants (must hold)
- **Archive on any recorded work.** A run is persisted when it has produced
  markdown OR has ≥1 recorded step. Never gate archival on non-empty final
  markdown alone, or early/first-step failures vanish.
- **Persist on every exit path**, not just the happy path: client disconnect /
  abort, mid-stream throw, and context-load failure must all still archive the
  partial run + trail. persistRun is idempotent (a `persisted` flag), so calling
  it from multiple exit branches is safe.
- **Run status must match its step trail.** Any non-`completed` step —
  `truncated`, `failed`, `aborted`, or a non-completed deliverable — must flip
  run status to `partial`. A `completed` run containing a non-completed step is a
  consistency bug (breaks KPIs + archival semantics).

**Why:** The whole point of the audit trail is faithful after-the-fact review of
autonomous runs; silent drops or a green run-level status over a broken step
defeat it.

**How to apply:** When touching the generate streaming loop, keep step->run
status derivation in lockstep at every place a step is pushed. Mid-step real
failures push a `failed` step (with error message + measured duration + partial
tokens/chars), append partial output, then rethrow so the outer catch persists
and reports. AbortError/clientGone falls through to the aborted-step + break path.
