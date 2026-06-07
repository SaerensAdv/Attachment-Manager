// Shared sample dataset for the "Kaart" (AI-team system map) redesign variants.
// Every variant renders THIS data so only the visual treatment differs.
// Prefixed with "_" so the mockup plugin does not treat it as a preview target.

export type Cat =
  | "core"
  | "agent"
  | "client"
  | "workflow"
  | "template"
  | "knowledge";

export interface MapNode {
  id: string;
  label: string;
  cat: Cat;
}

export type EdgeKind = "routing" | "flow" | "reference" | "mention";

export interface MapEdge {
  source: string;
  target: string;
  kind: EdgeKind;
}

// Saerens "Newsroom" palette — category colors as used in the real app.
export const CAT_META: Record<
  Cat,
  { label: string; labelNl: string; color: string }
> = {
  core: { label: "Core", labelNl: "Fundament", color: "hsl(243 75% 60%)" },
  agent: { label: "Agents", labelNl: "Agents", color: "hsl(188 90% 38%)" },
  client: { label: "Clients", labelNl: "Klanten", color: "hsl(330 75% 50%)" },
  workflow: { label: "Workflows", labelNl: "Workflows", color: "hsl(24 90% 48%)" },
  template: { label: "Templates", labelNl: "Sjablonen", color: "hsl(42 95% 42%)" },
  knowledge: { label: "Knowledge", labelNl: "Kennis", color: "hsl(142 65% 36%)" },
};

// Layer order top -> bottom, matching the real "Gelaagd" layout.
export const LAYER_ORDER: Cat[] = [
  "core",
  "agent",
  "client",
  "workflow",
  "template",
  "knowledge",
];

export const NODES: MapNode[] = [
  // Core / Fundament
  { id: "core-agents", label: "AGENTS", cat: "core" },
  { id: "core-arch", label: "ARCHITECTURE", cat: "core" },

  // Agents
  { id: "a-orch", label: "Orchestrator", cat: "agent" },
  { id: "a-ads-strat", label: "Google Ads Strateeg", cat: "agent" },
  { id: "a-ads-setup", label: "Ads Setup Specialist", cat: "agent" },
  { id: "a-ads-opt", label: "Ads Optimalisatie", cat: "agent" },
  { id: "a-seo", label: "SEO Specialist", cat: "agent" },
  { id: "a-copy", label: "Copywriter", cat: "agent" },
  { id: "a-report", label: "Reporting Specialist", cat: "agent" },
  { id: "a-track", label: "Analytics & Tracking", cat: "agent" },
  { id: "a-meta", label: "Meta Ads Strateeg", cat: "agent" },
  { id: "a-design", label: "Creative Designer", cat: "agent" },
  { id: "a-success", label: "Client Success", cat: "agent" },
  { id: "a-research", label: "Competitive Research", cat: "agent" },

  // Clients / Klanten
  { id: "c-saerens-agency", label: "Saerens.agency", cat: "client" },
  { id: "c-saerens-adv", label: "Saerens Advertising", cat: "client" },
  { id: "c-demo", label: "Demo Klant", cat: "client" },

  // Workflows
  { id: "w-campaign", label: "campaign-setup", cat: "workflow" },
  { id: "w-optimize", label: "account-optimization", cat: "workflow" },
  { id: "w-report", label: "monthly-reporting", cat: "workflow" },
  { id: "w-seo", label: "seo-audit", cat: "workflow" },
  { id: "w-web", label: "web-build", cat: "workflow" },
  { id: "w-adcopy", label: "ad-copy", cat: "workflow" },

  // Templates / Sjablonen
  { id: "t-report", label: "report-template", cat: "template" },
  { id: "t-proposal", label: "proposal-template", cat: "template" },
  { id: "t-email", label: "email-template", cat: "template" },

  // Knowledge / Kennis
  { id: "k-ads-std", label: "google-ads-standards", cat: "knowledge" },
  { id: "k-naming", label: "naming-conventions", cat: "knowledge" },
  { id: "k-brand", label: "brand-guidelines", cat: "knowledge" },
  { id: "k-report-std", label: "reporting-standards", cat: "knowledge" },
];

export const EDGES: MapEdge[] = [
  // Core feeds the orchestrator (backbone flow)
  { source: "core-agents", target: "a-orch", kind: "flow" },
  { source: "core-arch", target: "a-orch", kind: "flow" },

  // Orchestrator routes to specialist agents (routing hand-offs)
  { source: "a-orch", target: "a-ads-strat", kind: "routing" },
  { source: "a-orch", target: "a-ads-setup", kind: "routing" },
  { source: "a-orch", target: "a-ads-opt", kind: "routing" },
  { source: "a-orch", target: "a-seo", kind: "routing" },
  { source: "a-orch", target: "a-copy", kind: "routing" },
  { source: "a-orch", target: "a-report", kind: "routing" },
  { source: "a-orch", target: "a-track", kind: "routing" },
  { source: "a-orch", target: "a-meta", kind: "routing" },
  { source: "a-orch", target: "a-design", kind: "routing" },
  { source: "a-orch", target: "a-success", kind: "routing" },
  { source: "a-orch", target: "a-research", kind: "routing" },

  // Agents drive workflows (backbone flow)
  { source: "a-ads-strat", target: "w-campaign", kind: "flow" },
  { source: "a-ads-opt", target: "w-optimize", kind: "flow" },
  { source: "a-report", target: "w-report", kind: "flow" },
  { source: "a-seo", target: "w-seo", kind: "flow" },
  { source: "a-copy", target: "w-adcopy", kind: "flow" },
  { source: "a-design", target: "w-web", kind: "flow" },

  // Workflows reference templates + knowledge
  { source: "w-campaign", target: "k-ads-std", kind: "reference" },
  { source: "w-campaign", target: "k-naming", kind: "reference" },
  { source: "w-optimize", target: "k-ads-std", kind: "reference" },
  { source: "w-report", target: "t-report", kind: "reference" },
  { source: "w-report", target: "k-report-std", kind: "reference" },
  { source: "w-adcopy", target: "t-email", kind: "reference" },
  { source: "w-seo", target: "k-brand", kind: "reference" },

  // Agents reference knowledge + templates
  { source: "a-copy", target: "k-brand", kind: "reference" },
  { source: "a-track", target: "k-ads-std", kind: "reference" },
  { source: "a-success", target: "t-email", kind: "reference" },
  { source: "a-success", target: "t-proposal", kind: "reference" },

  // Clients enter through workflows
  { source: "c-saerens-agency", target: "w-seo", kind: "reference" },
  { source: "c-saerens-agency", target: "w-web", kind: "reference" },
  { source: "c-saerens-adv", target: "w-campaign", kind: "reference" },
  { source: "c-demo", target: "w-report", kind: "reference" },

  // Faint incidental mentions
  { source: "a-meta", target: "a-design", kind: "mention" },
  { source: "a-research", target: "a-ads-strat", kind: "mention" },
  { source: "a-design", target: "t-email", kind: "mention" },
  { source: "k-naming", target: "core-arch", kind: "mention" },
];

export interface XY {
  x: number;
  y: number;
}

const degreeMap: Record<string, number> = (() => {
  const d: Record<string, number> = {};
  for (const n of NODES) d[n.id] = 0;
  for (const e of EDGES) {
    d[e.source] = (d[e.source] ?? 0) + 1;
    d[e.target] = (d[e.target] ?? 0) + 1;
  }
  return d;
})();

export const degreeOf = (id: string): number => degreeMap[id] ?? 0;

// Deterministic clustered "organic" layout: each category gets a center on a
// ring around the canvas; its nodes spread around that center. The orchestrator
// and core sit near the middle as the structural hub.
export function organicLayout(width: number, height: number): Record<string, XY> {
  const cx = width / 2;
  const cy = height / 2;
  const ring = Math.min(width, height) * 0.33;
  const cats: Cat[] = ["agent", "client", "workflow", "template", "knowledge"];
  const catCenter: Record<string, XY> = {};
  cats.forEach((cat, i) => {
    const a = (i / cats.length) * Math.PI * 2 - Math.PI / 2;
    catCenter[cat] = { x: cx + Math.cos(a) * ring, y: cy + Math.sin(a) * ring };
  });
  catCenter["core"] = { x: cx, y: cy };

  const pos: Record<string, XY> = {};
  const byCat: Record<string, MapNode[]> = {};
  for (const n of NODES) (byCat[n.cat] ??= []).push(n);

  for (const cat of Object.keys(byCat)) {
    const list = byCat[cat];
    const c = catCenter[cat];
    const spread = 40 + list.length * 16;
    list.forEach((n, i) => {
      if (n.id === "a-orch") {
        pos[n.id] = { x: cx + (c.x - cx) * 0.32, y: cy + (c.y - cy) * 0.32 };
        return;
      }
      if (n.cat === "core") {
        pos[n.id] = { x: cx + (i === 0 ? -70 : 70), y: cy - 30 };
        return;
      }
      const ang = i * 2.399963; // golden angle
      const r = spread * Math.sqrt((i + 1) / list.length);
      pos[n.id] = { x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r };
    });
  }
  return pos;
}

// Top-to-bottom layered layout: one row per layer in LAYER_ORDER.
export function layeredLayout(width: number, height: number): Record<string, XY> {
  const pos: Record<string, XY> = {};
  const padX = 80;
  const padY = 70;
  const rows = LAYER_ORDER.length;
  const rowH = (height - padY * 2) / (rows - 1);
  LAYER_ORDER.forEach((cat, r) => {
    const list = NODES.filter((n) => n.cat === cat);
    const colW = (width - padX * 2) / Math.max(list.length, 1);
    list.forEach((n, i) => {
      pos[n.id] = {
        x: padX + colW * i + colW / 2,
        y: padY + rowH * r,
      };
    });
  });
  return pos;
}

// Radial layout: core at center, each subsequent layer on a wider ring.
export function radialLayout(width: number, height: number): Record<string, XY> {
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(width, height) / 2 - 60;
  const pos: Record<string, XY> = {};
  LAYER_ORDER.forEach((cat, r) => {
    const list = NODES.filter((n) => n.cat === cat);
    const radius = (r / (LAYER_ORDER.length - 1)) * maxR;
    list.forEach((n, i) => {
      if (radius === 0) {
        pos[n.id] = { x: cx + (i === 0 ? -60 : 60), y: cy };
        return;
      }
      const a = (i / list.length) * Math.PI * 2 - Math.PI / 2;
      pos[n.id] = { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
    });
  });
  return pos;
}
