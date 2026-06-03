---
name: Team heads / reporting line
description: The second team grouping (leadership heads / reporting line) and how it relates to the function-layer hierarchy.
---

# Heads (reporting line) vs function layers

The team has TWO independent groupings, both parsed from AGENTS.md, both with
Dutch display metadata owned by `team.ts` (English doc → Dutch labels live in code):

- **Function layers** — "## Agent Hierarchy" section → what *kind* of work an agent does.
- **Reporting-line heads** — "## Leadership & reporting line (heads)" section → *who reports to whom* (CEO → Orchestrator → head → specialists).

Both parsers join by the leading number of each list item = the layer/head `order`
(`layerSlugsFromAgents` / `headSlugsFromAgents`). `extractSection` stops at the next
heading, so the two sections never bleed into each other.

**Rule:** heads are **organizational only** — no runtime/routing/generation change.
Heads are NOT invoked. If heads ever become an active workflow step, that is a
separate future change (ROADMAP), not part of this layer.

**An agent's head and function-layer are independent.** e.g. `humanizer` is
function-layer-*unlisted* (cross-cutting, `<!-- unlisted -->`) yet still
head-assigned (Content & Creative). Assigning a head does not require a function layer.

**Why the difference in validation:** function layers allow a deliberate opt-out
marker; **heads do not** — every agent must have a reporting line. `validate-docs`
emits `headless-agent` (no marker exception) so a new agent can't silently fall into
the "Nog geen rapportagelijn" fallback head (this exact silent-fallback bit
`reporting-specialist` during the build).

**How to apply:** to add/move an agent's head, edit ONLY the AGENTS.md
"Leadership & reporting line" list — never hardcode membership in `team.ts`
(team.ts = display metadata only, same split as function layers).
