---
name: Service-line lens (Kaart)
description: The opt-in "service-lijn" lens that untangles the Operations Atlas hairball by lighting one service line; how membership is derived and how it composes with existing dim layers.
---

# Service-line lens (the answer to the Kaart hairball)

The Kaart is a single force/dagre graph that reads as a hairball at overview zoom
(see kaart-lod.md — the ~417 flow edges are the mesh). The lens is the user-facing
"untangle" lever: pick ONE higher-level service line and the map dims down to that
line's cluster. It is **opt-in, frontend-only, additive, and reversible** — default
(no line) renders exactly today's full map, so checkpoint rollback is a clean escape.

**Backbone = the department model, not a new taxonomy.** Selectable lines are the
departments of kind `delivery` | `client` (Paid Media, SEO & Web, Content & Creatie,
Klant & Groei), sorted by `order`. Direction + Quality are cross-cutting **hubs**
that stay lit in every line (never their own line). Source of truth is `GET /api/team`
(`departments` + `employees`); `member.path` === graph node id.

**Membership derivation (lensNodeIds), the part worth remembering:**
seed = agents whose `department.id` === selected line → 1 hop to
workflows/templates/knowledge over **NON-flow** edges only → 2nd hop to
templates/knowledge from those workflows → + direction/quality hub agents.
**Why skip flow edges:** flow is the combinatorial layer mesh; walking it would drag
the whole graph back in and re-create the hairball. The walk uses full `graphData`
(not the category-filtered `activeNodes`) so membership is stable regardless of which
legend categories are toggled.

**Composition with existing dim layers (precedence matters):**
a live run wins over the lens — `lensActive = !runActive && lensNodeIds?.size`.
In `isNodeDimmed`: hover → run → lens → selection → search. Lens reveals intra-cluster
wiring at `lod=1` and culls edges leaving the cluster (unless hover/selection reveals
them). The lens only **restyles** (opacity/edge cull); it never mutates the node/edge
sets, so the layout does NOT reflow on toggle — verified by e2e (positions stable,
different line = different cluster, "Overzicht" restores full view).
