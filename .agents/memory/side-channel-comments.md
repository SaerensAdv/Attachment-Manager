---
name: Agent side-channel HTML comments
description: Convention for passing internal-only structured data between agents via stripped HTML comments (monitor-list, handoff-brief).
---

# Agent side-channel HTML comments

Agents pass internal-only structured data alongside their visible prose by emitting a single trailing HTML comment. The frontend never renders it (DocPanel strips `<!--[\s\S]*?-->`; GenerationPanel/MarkdownView use react-markdown WITHOUT rehype-raw), and the engine parses + strips it before the deliverable/archive.

Two channels share this pattern:
- `<!-- monitor-list ... -->` — terms to keep watching.
- `<!-- handoff-brief { JSON } -->` — typed clean handoff between team agents.

**Why:** keeps an internal reliability/coordination layer that the client never sees, without a schema change or extra round-trips.

**How to apply (invariants — must never regress):**
- Parse defensively: malformed / empty / absent → the parser returns "nothing" (`brief: null`) but STILL strips every matching comment from the prose. A bad side-channel must never block or alter a run.
- Strip ALL occurrences globally (stray duplicates), parse only the FIRST for payload.
- Anything authored as a side-channel must be stripped on EVERY exit path (including abort), or it leaks into the archived markdown / deliverable.
- handoff-brief flags (`clientFacing`, `touchesLiveAccount`) source the QC gate but only REFINE the up-front plan: a brief can DOWNGRADE clientFacing (skip a *planned* Humanizer) but cannot synthesize an unplanned step; `touchesLiveAccount` is OR-merged (upgrade only, never downgrade). Routing's resolution is the fallback when briefs are silent.
- The handoff "recap" shown to the next agent deliberately excludes the internal flags — they drive the gate, not the next agent's writing.
- New agents learn the convention from the global rule in `AGENTS.md` (`## Global Agent Rules`); the instruction text itself lives in `HANDOFF_BRIEF_INSTRUCTION` (generate-context.ts) and is injected for executors only, never the QC passes.
- Surfacing for the reviewer: each parsed brief is persisted as JSON on its OWN audit step (generation_steps.handoff_brief), and the run-level *effective* gate flags are persisted on the generation row (client_facing / touches_live_account). These feed the archive UI (per-agent "Interne overdracht" panel + header flag chips) AND a live SSE `agent_brief` event (emitted in the stageLoop reconcile, after the step is parsed) so the same panel appears in GenerationPanel during a run. The panel + FlagChip are a shared component (components/HandoffBrief.tsx) reused by History + GenerationPanel. They are a SEPARATE column — never reconstructed from the markdown — so the markdown-strip invariant above is what keeps briefs out of deliverables/PDF/email; the persisted copy is internal-only.
