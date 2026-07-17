---
name: Agent lifecycle (active/paused)
description: How agents are paused/reactivated via .md frontmatter and how paused agents flow through routing, roster, and validation.
---

# Agent lifecycle (active/paused)

Pausing an agent is **opt-in** via a leading YAML frontmatter block at the very
top of its `agents/*.md` file: `active: false` (plus optional `paused_date` /
`reason`). A missing block, or a block without an `active` key, means active.
Only an explicit `active: false` pauses.

**Why:** the owner wanted to shrink the live team to a few agents without
deleting the others' docs (keep them recoverable and visible on the team page).

**How to apply:**
- `splitFrontmatter` + `parseActiveFlag` (both exported from `docs.ts`) are the
  single source of truth. Strip the frontmatter **before** deriving
  title/summary/fanout/embeddings, or the block pollutes those + the reader.
- The single most fragile invariant: **`writeDocFile` must re-prepend the
  on-disk frontmatter when the incoming content lacks one.** Editors (persona
  edit, doc edit, learning-loop re-apply) receive the *stripped* body; if you
  write it back naked you silently reactivate a paused agent. Pinned by the
  "keeps an agent paused after its body is rewritten" test in `docs.test.ts`.
- Reactivation is intentionally an API-level action: write content that itself
  carries `active: true` (or no block) to flip it back.
- Routing: paused agents are dropped **silently** from `teamPaths`; if *all*
  requested agents are paused, return a distinct 400 ("Deze agent is
  gepauzeerd…") vs the generic unknown-agent 400. `agents/orchestrator.md` is
  force-active. `route.ts` guards twice: candidate filter (`active !== false`)
  and `resolve()` returns null for a paused pick.
- Roster still lists paused agents (`team.ts` exposes `TeamMember.active`), so
  the team page shows the full roster; the generation picker
  (`useGeneration.ts`) hides `active === false`.
- `validate-docs.ts` skips the "unrouted-agent" warning for paused nodes (they
  are intentionally not in the routing table).
- `DocNode` + `TeamMember` carry a required `active` boolean in `openapi.yaml`;
  every DocFile construction site must set it (scanFiles from frontmatter,
  clientToDoc = true).

**Known accepted gap:** `orchestrator.md`'s routing-table prose still names the
paused agents verbatim, and `buildRoutingPrompt` injects it unmodified. A user
asking for a paused domain (e.g. Meta ads) may get the model to pick the paused
agent → `resolve()` nulls it → generic "kon niet bepalen welke specialist"
clarification rather than a "dit domein is gepauzeerd" message. Safe (never
routes to a paused agent), just a slightly vague message. Optional follow-up:
annotate paused rows in the injected table or detect the paused-pick case.
