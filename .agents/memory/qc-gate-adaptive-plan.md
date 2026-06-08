---
name: QC gate & adaptive department-aware plan
description: Invariants for the closing quality gate (reviewer + humanizer) and the orchestrator's parallel-stage routing plan.
---

# QC gate & adaptive department-aware plan

## Final QC gate — invariants (must hold)
- **QC agents are gate-only, never team executors.** The QA & Compliance
  Reviewer and the Humanizer must be stripped from any team list at BOTH the
  routing layer and the context-resolution layer, and rejected even as the
  primary agent — otherwise the model can smuggle a QC role into the team and
  there is no closing pass left.
- **Best-effort is the hard rule.** A QC failure may push a failed quality step
  and flip the run to `partial`, but it must NEVER discard the team's markdown,
  surface an error to the client, or stop the run from completing.
- **Reviewer verdict is held back; humanizer rewrite feeds forward.** The
  humanizer's rewrite is appended to prior work and DOES feed the
  deliverable/report; the reviewer's verdict is appended LAST (after deliverable
  + monthly-report sections) so it never contaminates client-facing output. Snapshot
  the deliverable source *between* the two passes.
- **The QC prompt must actually contain the team draft.** The draft block is
  built from the `qc` selection, not from team membership — a lone QC agent has
  no `team`, so gating the draft block on team membership silently runs QC with
  no work to review. (This was a real regression; `generate-context.test.ts`
  guards it.)
  **Why:** the whole point of the gate is a final pass *over the team's output*;
  without the draft in the prompt it just re-guesses from the request text.

## Adaptive plan — invariants
- The orchestrator returns agent groups + `clientFacing` + `touchesLiveAccount`
  + a team sized to the request. The plan is honoured ONLY when its groups cover
  the team exactly once; otherwise fall back to fully sequential. This must hold
  at the routing layer AND be re-validated in the engine, because a user can edit
  the team after routing and leave a stale plan that no longer matches.
  **Why:** a malformed/stale plan must never silently drop or double-run an agent.
- Independent disciplines that both build on the same prior work belong in ONE
  concurrent stage; a real chain (each builds on the previous) stays sequential.

## Frontend contract
- The routing result carries the plan; the stream emits a plan event the client
  uses to pre-create the QC steps as queued "quality" segments and to set the
  progress denominator. Keep the displayed total in lockstep with the engine's
  team + QC total.
