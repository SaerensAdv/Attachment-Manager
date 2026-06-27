import * as d3 from "d3-force";
import type { DocNode } from "@workspace/api-client-react";

// Level-of-detail. The doc graph is dense (~800 edges): drawn all at once the
// overview collapses into an unreadable hairball. Each edge class instead fades
// in as the viewport zooms, so far out only the orchestrator routing skeleton
// remains and the structural backbone reads cleanly; zooming in progressively
// reveals the fuller wiring (flow → reference → mention). Tuples are
// [fadeStart, fadeEnd] in viewport scale: at/below start the class is hidden,
// at/above end it is fully drawn. routing is the true backbone and never fades.
export const EDGE_LOD: Record<string, [number, number]> = {
  routing: [0, 0],
  flow: [0.5, 0.95],
  reference: [0.75, 1.1],
  mention: [1.0, 1.35],
};

// Non-anchor node labels fade with the same idea: far out the plates read as
// clean schematic marks; up close every plate is annotated. [fadeStart, fadeEnd]
// in viewport scale. Core docs and the central hub stay labelled at every zoom
// as orientation anchors.
export const LABEL_LOD: [number, number] = [0.55, 1.0];

// Linear ramp from 0 at `start` to 1 at `end`, clamped. end <= start ⇒ always 1.
export const lodFactor = (scale: number, start: number, end: number) => {
  if (end <= start) return 1;
  return Math.max(0, Math.min(1, (scale - start) / (end - start)));
};

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
