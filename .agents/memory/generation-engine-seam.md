---
name: Generation engine module seam
description: How runGeneration is decomposed across the generate-engine facade + orchestrator + effect-returning runners, and who owns the audit-trail ordering.
---

The generation engine is split so a deliverable/agent's behavior can change without touching the run lifecycle:

- `generate-engine.ts` is a THIN re-export facade only (public surface: `runGeneration`, `resolveGenerationContext`, `parseStages`/`parseFanout`/`MAX_FANOUT`, `QC_REVIEWER_PATH`/`QC_HUMANIZER_PATH`, the pure text reducers, and the shared types). Consumers import from here — never widen it casually.
- `generation-orchestrator.ts` holds `runGeneration` and is the SOLE owner of the audit trail's ordering: it alone does `steps.push`, assigns `stepOrder` (via the `nextStepOrder`/`postTeamStepOrder` cursors), folds `runStatus` to `"partial"`, and records `pendingApproval`/`approvalStatus`. Persistence/archival + the terminal `done` event also live here. `runLeadFanout` stays an in-orchestrator closure (too coupled to the parallel stage-loop step ordering).
- `generation-agent-runner.ts` (`runMember`, `runQcStep`) and `generation-deliverable-executor.ts` (`runDeliverableStep`, `runReportEmailAction`, `runEmailReplyAction`) are functional cores: they stream + emit SSE through an injected `send`, but DO NOT mutate run state. They RETURN effects — `{ step: Omit<StepRecord,"stepOrder"> | null, downgrade, approval? }` — and the orchestrator applies them in sequence.

**Why:** keeps SSE order, step-order numbering, archival-on-every-exit, approval gating, and "best-effort QC/deliverable never discards the team markdown" provable in ONE place; a runner change can't silently break the lifecycle.

**How to apply:** when adding an agent step or deliverable, RETURN an effect from the runner and let the orchestrator push/number/fold/record it — never push steps or set `runStatus`/approval from inside a runner. The shared contexts (`AgentRunContext`, `DeliverableExecContext`) are read-only BY CONVENTION only; they carry live array refs (`clientDocs`, the `steps` view) so don't assume deep immutability. Parity is guarded by `generate-engine.test.ts`, which mocks collaborators BY MODULE PATH — any new flat `src/lib/` module must reuse the same `./…` specifiers to stay intercepted by those mocks.
