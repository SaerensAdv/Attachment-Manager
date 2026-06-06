---
name: Adding an agent to the AI Team System Map
description: The convention for adding a new agent doc so it shows up correctly on the Kaart, routing, and generation.
---

# Adding an agent

Agents are plain markdown files in `agents/`. The api-server (`docs.ts`) reads
them from disk at request time, so a new/edited agent appears in the Kaart,
routing, and generation **without restarting the api-server**. (Backend code
changes still need a restart — dev = build+start, no watch.)

To add one and keep the graph consistent, touch four places:

1. `agents/<name>.md` — follow the canonical format every agent uses: H1 title;
   `> Inherits all global rules in AGENTS.md.`; `## Role`; `## Character & personality`
   (all persona fields); `## Responsibilities`; `## You are not responsible for`;
   `## Required input`; `## Output format` (numbered, **last item must be
   "Human approval required"**); `## Skills to draw on (build-time, Phase 2+)`.
2. `agents/orchestrator.md` routing table — add a row whose "Route to" cell is the
   **exact H1 title** of the new agent. Routing edges are derived by exact,
   case-sensitive title match inside the "Routing guide" section. The table also
   has a **Workflow** column: fill the new row's workflow cell with the backticked
   `workflows/<file>.md` path it owns (creates the orchestrator→workflow edge), or
   `—` if no dedicated workflow exists yet.
3. `AGENTS.md` — list it under "Additional Specified Agents" (and remove it from
   "Future Agents" if it was planned).
4. `ARCHITECTURE.md` folder map — add the filename.

**Why:** edges are content-derived. Reference edges come from backtick `path`
mentions, routing edges from exact-title mentions in the orchestrator table, so a
title mismatch silently drops an agent from routing even though it still renders
as a node.

**Gotcha — slash-style H1 titles are intentional, do NOT "normalize" them.** Some
agents' H1 titles differ from their shorter filenames (e.g. `agents/web-developer.md`
= "Web Developer / Builder"; `landing-page-specialist.md` = "Landing Page / Web
Design Specialist"; `sales-proposal-agent.md` = "Sales / Proposal Agent"). Workflow
and AGENTS.md labels match the H1, not the filename — that is correct, because edges
key off the exact H1. An audit that flags these as "label vs filename mismatch" is a
false positive; rewriting the label to match the filename would BREAK the edge.

**Deepen vs new (from AGENTS.md):** prefer giving an existing agent an extra
sub-specialty over a new agent; add a new agent only when the domain/output/boundary
is genuinely distinct (e.g. cross-cutting review/edit steps like QA Reviewer and
Humanizer that act on *any* agent's output).
