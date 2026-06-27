---
name: Kaart level-of-detail (Blueprint overview)
description: Why the system-map Kaart shows only the routing skeleton and reveals the dense wiring strictly on demand (not by zoom).
---

The Blueprint Kaart (GraphViewer organic/d3-force default) was an unreadable,
laggy "hairball". Root cause is the edge mix, not node count: the doc graph is
~83 nodes / ~837 edges where the dominant class is **flow (~417)** and it is
purely **combinatorial** (`agent→client` + `client→workflow` + `workflow→template`
— "every X relates to every Y"), plus reference (~278) and mention (~122). The
only genuinely structural backbone is **routing (~20)**: orchestrator → each agent.

**Rule:** the overview renders ONLY the routing skeleton (+ core and the single
highest-degree hub labelled). The dense flow / reference / mention wiring is shown
**strictly on demand** — it is no longer faded in by zoom at all. It appears only
when (1) a hover/selection reveals an endpoint's own wiring, (2) a live run is
active and an edge sits between two `involvedNodeIds`, or (3) a service-line lens
is active and an edge is wholly inside the lit cluster. Non-revealed non-routing
edges are **culled** (`return null`), not merely dimmed — dimming still rendered
the whole hairball every frame, which was the zoom lag.

**Why:** flow is the bulk of the edges but carries no readable structure at
overview scale, and zoom-revealing it painted hundreds of crossing SVG paths +
beads every frame (the lag the user complained about). Routing is small and
meaningful, so it reads as a clean radial skeleton on its own. Showing wiring on
demand keeps both legibility and performance.

**How to apply:** the reveal gate lives in `GraphViewer.tsx`:
`revealed = isRouting || isEdgeHighlighted || runEdge || lensEdge; if (!revealed) return null;`
followed by a lens cull that hides anything (incl. the backbone) outside the lit
cluster unless highlighted. Precedence: `lensActive = !runActive && ...`, so a
live run overrides the lens. Two reveal overrides must never regress: hover/
selection reveals an endpoint's edges at any zoom; a run forces edges between two
involved nodes visible (+ animated beads). LOD applies in **organic mode only** —
the **layered (dagre)** view keeps full wiring because its cross-layer edges *are*
the structure dagre draws. Zoom-based LOD now applies ONLY to non-anchor node
**labels** (`LABEL_LOD` + `lodFactor()` in `graph-viewer-utils.ts`); the per-kind
edge `EDGE_LOD` table was removed. Animated flow "beads" only ever attach to
revealed edges, so they no longer drive ambient repaint cost.
