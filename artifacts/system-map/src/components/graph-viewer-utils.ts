import * as d3 from "d3-force";
import type { DocNode } from "@workspace/api-client-react";

// The architecture flows top-to-bottom through these layers. The "Gelaagd"
// (dagre) layout ranks nodes by this order so the structural backbone reads as
// a clean hierarchy; edges crossing layers are oriented downward so dagre keeps
// the ranks aligned with the layer order rather than with arbitrary link
// direction. Categories not listed here fall to the bottom rank.
export const LAYER_ORDER = ["core", "agent", "client", "workflow", "template", "knowledge"];

export const layerRank = (category: string) => {
  const i = LAYER_ORDER.indexOf(category);
  return i === -1 ? LAYER_ORDER.length : i;
};

export type LayoutMode = "organic" | "layered";

// Below this zoom level labels are hidden to keep the dense overview readable;
// zooming in past it fades them in so individual nodes can be inspected. The
// per-node focus zoom (1.4) and a small manual zoom both clear this threshold.
export const LABEL_VISIBLE_SCALE = 1.15;

// Turn a node id into a value safe for an SVG element id / clipPath reference.
export const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "-");

// Visual style per relationship kind. routing (orchestrator hand-off) and flow
// (five-layer pipeline) get their own colors so the structural backbone reads
// distinctly from generic references and incidental mentions.
export const EDGE_STYLE: Record<
  string,
  { color: string; width: number; dash: string; opacity: number; marker: string }
> = {
  routing: { color: "hsl(var(--cat-agent))", width: 1.75, dash: "none", opacity: 0.7, marker: "arrow-routing" },
  flow: { color: "hsl(var(--cat-core))", width: 1.75, dash: "none", opacity: 0.65, marker: "arrow-flow" },
  reference: { color: "hsl(var(--foreground))", width: 1, dash: "none", opacity: 0.26, marker: "arrow-reference" },
  mention: { color: "hsl(var(--foreground))", width: 1, dash: "3,5", opacity: 0.14, marker: "arrow-mention" },
};

export const edgeStyleFor = (kind: string) => EDGE_STYLE[kind] ?? EDGE_STYLE.mention;

export interface SimNode extends d3.SimulationNodeDatum, DocNode {
  x?: number;
  y?: number;
}

export interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
  kind: string;
}

// Map category to CSS variable color
export const getCategoryColor = (categoryId: string) => {
  return `hsl(var(--cat-${categoryId}))`;
};

// Schematic "plate" node geometry. Labels render in Space Mono (a monospace
// face), so a node's plate width can be derived from its character count —
// letting both layout engines space the plates correctly without measuring
// text in the DOM, and keeping render + layout in exact agreement.
export const PLATE = {
  charW: 7.2, // advance per glyph at 11px + tracking-wider
  padX: 14,
  height: 28,
  minW: 64,
} as const;

export const plateWidth = (title: string) =>
  Math.max(
    PLATE.minW,
    Math.round(PLATE.padX * 2 + title.toUpperCase().length * PLATE.charW),
  );
