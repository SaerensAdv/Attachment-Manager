---
name: Fan-out-with-selection (creative lead)
description: How the opt-in fan-out orchestration mode works in the generate engine, and the invariants that must not regress.
---

# Fan-out-with-selection

Opt-in orchestration mode for creative workflows (ad-copy, ad-creatives): the
LEAD agent (teamPaths index 0) runs N times in parallel with distinct diversity
seeds, then a best-of selection LLM pass picks ONE winner whose text becomes the
lead's contribution. Only the winner flows downstream into the existing
deliverable/QC pipeline; losing candidates are discarded.

**Opt-in:** workflow marker `<!-- fanout: N -->` (min 2, clamped to `MAX_FANOUT`).
`parseFanout()` returns 0 for any non-opted/garbled workflow. A numeric request
body `fanout` overrides the marker (value <2 ⇒ off). 0 = lead runs once exactly
as before, so non-opted workflows are byte-for-byte unchanged.

**Why these design choices:**
- Fan-out only fires for index 0 and only when `fanout >= 2`. Downstream agents
  build on the winner via the normal `priorWork` hand-off — no change needed there.
- Candidate deltas are NOT streamed to the UI (they'd interleave under one
  index); only the winner's text is sent via `send({content, index:0})`.
- The selection pass is a separate `anthropic.messages.create` (non-streaming)
  with a `WINNER: <n>` / `RATIONALE:` contract parsed by regex.
- Selection step is recorded as its own audit step with `role: "selection"` and
  `agentPath = workflowPath` so it never pollutes agent KPIs. Step ordering uses
  a `postTeamStepOrder` cursor that QC/deliverable steps continue from.
- Rationale is appended to the archived markdown AFTER the deliverable snapshot
  (`## Fan-out — interne selectie`), so it is audit-only and never feeds the
  deliverable.
- Per-loser reasons: the selection contract adds a `REASONS:` block (lines like
  `- Variant 2: weaker hook`) parsed into a map keyed by 1-based variant number;
  attached as a `reason` field on each non-winner candidate snapshot (winner +
  single/abort/fail branches get `""`). RATIONALE regex must stop before
  `REASONS:` (non-greedy). The `reason` field flows through the whole chain:
  candidate snapshot → persisted JSON → `parseFanoutCandidates` → openapi.yaml
  candidate schema → generated client types → GenerationPanel/History display.
  Missing reason is best-effort (empty string), never breaks display.

**Invariants (must not regress):**
- Best-effort: a candidate or selection failure NEVER discards team work or
  sinks the run — falls back to first usable candidate, marks run `partial`.
- All-candidates-failed (real errors) is fatal like a blown lead stream
  (contextFailed/streamFailed) so the outer loop archives + reports it.
- Single usable candidate ⇒ skip the selection model call entirely.
- `runLeadFanout` mirrors `runMember`'s MemberOutcome contract exactly so the
  stage reconcile + archival logic is identical.

**Test note:** the engine test mock's stream `finalMessage()` returns no
content, so text MUST be accumulated from `content_block_delta` events. The
selection `create` call is driven by a hoisted `h.createImpl` returning a
`{content:[{type:"text",text}]}` shape; reset in `beforeEach`.
