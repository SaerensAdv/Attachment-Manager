---
name: Team layer membership source
description: Where the team page's agent→layer grouping comes from, and the split between display metadata and membership.
---

# Team hierarchy layer membership

The team page groups agents into hierarchy layers. Two things are deliberately
kept in different places:

- **Display metadata** (stable layer `id`, `order`, Dutch `title`/`description`)
  lives in `TEAM_LAYERS` in `artifacts/api-server/src/lib/team.ts`. AGENTS.md is
  English, so the Dutch labels cannot come from it.
- **Membership** (which agent slug is in which layer) is parsed at request time
  from the numbered list in the "Agent Hierarchy" section of `AGENTS.md`. Each
  numbered item lists its agents as `agents/<slug>.md` references; the leading
  number is matched to a `TEAM_LAYERS` entry by `order`.

**Why:** membership used to be a hardcoded slug list in `team.ts`, so a new
agent silently fell into the "Overig" (fallback) layer until someone remembered
to edit the file. Deriving it from AGENTS.md keeps the page correct as the team
grows.

**How to apply:**
- To move/add an agent's layer, edit only the AGENTS.md hierarchy list — do NOT
  touch `team.ts`.
- Layer `order` is the join key between AGENTS.md item numbers and `TEAM_LAYERS`;
  keep them aligned (1..N).
- An agent not listed under any hierarchy item correctly falls to "Overig"
  (e.g. `humanizer`, a cross-cutting step with no fixed layer).
- Doc validation (`validate-docs.ts`, `unlayered-agent` warning) flags any
  `agents/<slug>.md` missing from the hierarchy so accidental omissions surface.
  A deliberately layer-less agent opts out with an HTML-comment marker at the top
  of its file: `<!-- unlisted: <reason> -->` (matched by `/<!--\s*unlisted\b/i`,
  reuses the existing comment-marker convention; DocPanel strips HTML comments so
  it never renders). `hierarchySlugs()` in `team.ts` flattens the listed slugs.
- Listing agents in the hierarchy adds NO new doc-graph edges: AGENTS.md already
  references every agent in its "Current MVP / Additional Specified" inventory
  lists.
