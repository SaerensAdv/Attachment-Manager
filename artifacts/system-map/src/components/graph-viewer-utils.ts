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

// --- Department overlay geometry -------------------------------------------
// The Kaart can draw the agency departments (the single org model) as soft
// "blobs" wrapping each department's member plates, with handoff arrows between
// department centroids. These helpers are pure geometry so they can be unit
// tested and kept out of the render component.

export interface Pt {
  x: number;
  y: number;
}

/** Centroid (average position) of a set of points. */
export const centroidOf = (points: Pt[]): Pt => {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
};

/** Andrew's monotone-chain convex hull; returns hull vertices (no extra dep). */
export const convexHull = (points: Pt[]): Pt[] => {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length <= 2) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
};

/** Push each vertex outward from the centroid by `pad` px. */
const expandHull = (points: Pt[], pad: number): Pt[] => {
  const c = centroidOf(points);
  return points.map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * pad, y: p.y + (dy / len) * pad };
  });
};

/** Smooth closed SVG path through `points` (midpoint-quadratic → organic blob). */
const smoothClosedPath = (points: Pt[]): string => {
  const n = points.length;
  if (n === 0) return "";
  const mid = (a: Pt, b: Pt): Pt => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });
  const start = mid(points[n - 1], points[0]);
  let d = `M${start.x.toFixed(1)},${start.y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const curr = points[i];
    const m = mid(curr, points[(i + 1) % n]);
    d += ` Q${curr.x.toFixed(1)},${curr.y.toFixed(1)} ${m.x.toFixed(1)},${m.y.toFixed(1)}`;
  }
  return d + " Z";
};

/** Rounded-rectangle path, used when a department has too few nodes for a hull. */
const roundedRectPath = (
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string =>
  [
    `M${x + r},${y}`,
    `H${x + w - r}`,
    `A${r},${r} 0 0 1 ${x + w},${y + r}`,
    `V${y + h - r}`,
    `A${r},${r} 0 0 1 ${x + w - r},${y + h}`,
    `H${x + r}`,
    `A${r},${r} 0 0 1 ${x},${y + h - r}`,
    `V${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}`,
    "Z",
  ].join(" ");

export interface HullMember {
  x: number;
  y: number;
  title: string;
}

/**
 * A soft closed path enclosing a department's member node plates. Uses every
 * plate's four corners so the blob wraps the rectangles (not just centers); for
 * one or two members a convex hull is degenerate, so a rounded bounding box is
 * used instead.
 */
export const departmentHullPath = (members: HullMember[], pad = 26): string => {
  if (members.length === 0) return "";
  const corners: Pt[] = [];
  for (const m of members) {
    const hw = plateWidth(m.title) / 2;
    const hh = PLATE.height / 2;
    corners.push(
      { x: m.x - hw, y: m.y - hh },
      { x: m.x + hw, y: m.y - hh },
      { x: m.x + hw, y: m.y + hh },
      { x: m.x - hw, y: m.y + hh },
    );
  }
  if (members.length <= 2) {
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    const r = Math.min(28, (maxX - minX) / 2, (maxY - minY) / 2);
    return roundedRectPath(minX, minY, maxX - minX, maxY - minY, r);
  }
  return smoothClosedPath(expandHull(convexHull(corners), pad));
};

/** Topmost point of a set, for placing a department's label above its blob. */
export const topMostPoint = (points: Pt[]): Pt => {
  let top = points[0] ?? { x: 0, y: 0 };
  for (const p of points) if (p.y < top.y) top = p;
  return top;
};

/** A gently bowed path between two department centroids for a handoff arrow. */
export const departmentHandoffPath = (a: Pt, b: Pt): string => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Pull endpoints in a little so the arrow sits between the blobs, not inside.
  const trim = Math.min(len * 0.32, 90);
  const x1 = a.x + ux * trim;
  const y1 = a.y + uy * trim;
  const x2 = b.x - ux * trim;
  const y2 = b.y - uy * trim;
  const bow = Math.min(len * 0.12, 60);
  const cx = (x1 + x2) / 2 - uy * bow;
  const cy = (y1 + y2) / 2 + ux * bow;
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
};
