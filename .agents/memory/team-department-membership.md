---
name: Team department membership source
description: Where the team page + system map's agent→department grouping comes from, and the display-vs-membership split.
---

# Team department membership

The team is ONE agency org model: numbered **departments** (orders 0..N), each
with a single named **owner** (head) and explicit **handoff** lines. There is no
separate "hierarchy" and "leadership" taxonomy anymore — they were consolidated
into this single model. Two things are deliberately kept in different places:

- **Display metadata** (stable department `id`, `order`, `kind`, Dutch
  `title`/`description`, and `handsTo` topology) lives in `TEAM_DEPARTMENTS` in
  `artifacts/api-server/src/lib/team.ts`. AGENTS.md is English, so the Dutch
  labels cannot come from it. `receivesFrom` is **derived** from every other
  department's `handsTo` (so a handoff is declared in one place only).
- **Membership + owner** (which agent slug is in which department, and who owns
  it) is parsed at request time from the numbered list in the `## Agency
  organisation` section of `AGENTS.md`. Each numbered item has `Owner:`,
  `Agents:` and `Handoff:` lines listing `agents/<slug>.md` refs; the leading
  number is matched to a `TEAM_DEPARTMENTS` entry by `order`.

**Why:** membership/owner used to be hardcoded slug lists in `team.ts`, so a new
agent silently fell into the fallback department. Deriving from AGENTS.md keeps
the page + map correct as the team grows.

**How to apply:**
- To move/add an agent's department or change an owner, edit only the AGENTS.md
  `## Agency organisation` list — do NOT touch `team.ts`.
- Department `order` is the join key between AGENTS.md item numbers and
  `TEAM_DEPARTMENTS`; keep them aligned (0..N).
- Every agent MUST belong to exactly one department — there is **no opt-out**.
  The fallback department (`id="other"`) only catches accidental omissions.
- Doc validation (`validate-docs.ts`) enforces this: `undepartmented-agent` flags
  any `agents/<slug>.md` missing from the org list; `ownerless-department` flags a
  department whose owner can't be resolved. The old `<!-- unlisted -->` opt-out
  marker is gone.
- Listing agents adds NO new doc-graph edges: AGENTS.md already references every
  agent in its inventory lists.
- This whole layer is **structure/presentation only** — it shapes docs, the team
  page, and the system-map department overlay (hulls + handoff arrows in
  `GraphViewer`, gated off while a run is live). It does NOT change generation
  runtime; the Orchestrator still routes Orchestrator→specialist directly.
