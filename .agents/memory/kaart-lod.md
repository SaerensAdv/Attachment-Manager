---
name: Kaart level-of-detail (Blueprint overview)
description: Why the system-map Kaart overview shows only the routing skeleton, and how zoom-based LOD declutters the dense doc graph.
---

The Blueprint Kaart (GraphViewer organic/d3-force default) was an unreadable
"hairball" at fit-zoom. Root cause is the edge mix, not node count: the doc graph
is ~83 nodes / ~837 edges where the dominant class is **flow (~417)** and it is
purely **combinatorial** (`agent→client` + `client→workflow` + `workflow→template`
— "every X relates to every Y"), plus reference (~278) and mention (~122). The
only genuinely structural backbone is **routing (~20)**: orchestrator → each agent.

**Rule:** the far-out overview should render only the routing skeleton (+ core and
the single highest-degree hub labelled); flow → reference → mention and the rest of
the labels fade in progressively as the viewport zooms (level-of-detail), and any
node's full wiring is always revealed on hover/selection.

**Why:** flow is the bulk of the edges but carries no readable structure at
overview scale — drawing it all at once destroys legibility. routing is small and
meaningful, so it reads as a clean radial skeleton.

**How to apply:** LOD lives in `graph-viewer-utils.ts` as per-kind
`EDGE_LOD[kind] = [fadeStart, fadeEnd]` (viewport scale; routing `[0,0]` = always
on), `LABEL_LOD`, and `lodFactor()`. LOD applies in **organic mode only** — the
**layered (dagre)** view keeps full wiring because its cross-layer edges *are* the
structure dagre draws. Two reveal overrides must never regress: (1) hover/selection
reveals an endpoint's edges at any zoom; (2) during a live run, edges between two
`involvedNodeIds` are forced visible so the working team's wiring reads at the
spotlight's far framings. Animated flow "beads" must scale with the same lod or
they render without their line.
