import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

const ownerSchema = z.enum(["clickup", "github", "replit", "mixed"]);
const nodeSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._:-]*$/, "Hierarchy IDs must be stable lowercase slugs"),
  kind: z.enum(["master", "hub", "registry", "object", "source", "runtime"]),
  label: z.string().min(1), parent: z.string().nullable(), order: z.number().int(), canonicalOwner: ownerSchema,
  status: z.enum(["active", "paused", "deprecated", "archived"]), visibility: z.enum(["default", "advanced", "hidden"]),
  aliases: z.array(z.string().min(1)).optional().default([]),
});
const mappingSchema = z.object({ pattern: z.string().min(1), parent: z.string().min(1), canonicalOwner: ownerSchema });
const manifestSchema = z.object({ version: z.literal(1), rootId: z.string().min(1), nodes: z.array(nodeSchema), mappings: z.array(mappingSchema) });

export type BrainHierarchyNode = z.infer<typeof nodeSchema>;
export type BrainHierarchyManifest = z.infer<typeof manifestSchema>;
export interface BrainHierarchyIssue { code: string; message: string; nodeId?: string; source?: string }
export interface BrainHierarchyResult { manifest: BrainHierarchyManifest; nodes: Array<BrainHierarchyNode & { source?: string; runtimeId?: string }>; issues: BrainHierarchyIssue[]; sourceCount: number; mappedSourceCount: number }

const REQUIRED_HUBS = ["constitution", "architecture", "clients", "workflows", "knowledge", "templates", "runs", "integrations", "product", "archive"] as const;

export function findBrainHierarchyRoot(start = process.cwd()): string {
  let dir = start;
  while (true) { if (existsSync(join(dir, "brain-hierarchy.json"))) return dir; const parent = dirname(dir); if (parent === dir) throw new Error("Could not locate brain-hierarchy.json"); dir = parent; }
}
function matches(pattern: string, source: string): boolean { if (!pattern.includes("*")) return pattern === source; const [prefix, suffix] = pattern.split("*"); return source.startsWith(prefix) && source.endsWith(suffix ?? ""); }
function pushUnique(issues: BrainHierarchyIssue[], issue: BrainHierarchyIssue): void { if (!issues.some((current) => current.code === issue.code && current.nodeId === issue.nodeId && current.source === issue.source && current.message === issue.message)) issues.push(issue); }

export function validateBrainHierarchy(manifest: BrainHierarchyManifest, sources: readonly string[]): BrainHierarchyResult {
  const issues: BrainHierarchyIssue[] = [];
  const byId = new Map<string, BrainHierarchyNode>();
  const aliasOwner = new Map<string, string>();
  for (const node of manifest.nodes) {
    if (byId.has(node.id)) pushUnique(issues, { code: "duplicate_id", message: `Duplicate hierarchy id: ${node.id}`, nodeId: node.id });
    else byId.set(node.id, node);
    for (const alias of node.aliases ?? []) {
      if (alias === node.id || byId.has(alias) || aliasOwner.has(alias)) pushUnique(issues, { code: "alias_collision", message: `Hierarchy alias collides: ${alias}`, nodeId: node.id });
      else aliasOwner.set(alias, node.id);
    }
  }

  const root = byId.get(manifest.rootId);
  if (!root) pushUnique(issues, { code: "missing_root", message: `Root node does not exist: ${manifest.rootId}` });
  else {
    if (root.kind !== "master") pushUnique(issues, { code: "invalid_root_kind", message: "Root node must be kind master", nodeId: root.id });
    if (root.parent !== null) pushUnique(issues, { code: "root_has_parent", message: "Root node cannot have a parent", nodeId: root.id });
  }
  const masters = manifest.nodes.filter((node) => node.kind === "master");
  if (masters.length !== 1) pushUnique(issues, { code: "master_count", message: `Expected exactly one master node, found ${masters.length}` });

  for (const id of REQUIRED_HUBS) if (!byId.has(id)) pushUnique(issues, { code: "required_hub_missing", message: `Required hierarchy hub is missing: ${id}`, nodeId: id });
  for (const node of manifest.nodes) if (node.parent && !byId.has(node.parent)) pushUnique(issues, { code: "missing_parent", message: `Unknown parent ${node.parent}`, nodeId: node.id });
  for (const mapping of manifest.mappings) if (!byId.has(mapping.parent)) pushUnique(issues, { code: "mapping_parent_missing", message: `Mapping parent does not exist: ${mapping.parent}` });

  for (const node of manifest.nodes) {
    const seen = new Set<string>();
    let cursor: BrainHierarchyNode | undefined = node;
    while (cursor) {
      if (seen.has(cursor.id)) { pushUnique(issues, { code: "cycle", message: `Hierarchy cycle at ${cursor.id}`, nodeId: node.id }); break; }
      seen.add(cursor.id);
      if (cursor.parent === null) { if (cursor.id !== manifest.rootId) pushUnique(issues, { code: "detached_tree", message: `Node does not reach root ${manifest.rootId}`, nodeId: node.id }); break; }
      cursor = byId.get(cursor.parent);
      if (!cursor) break;
    }
  }

  const siblingOrders = new Map<string, Set<number>>();
  for (const node of manifest.nodes) {
    if (!node.parent) continue;
    const orders = siblingOrders.get(node.parent) ?? new Set<number>();
    if (orders.has(node.order)) pushUnique(issues, { code: "duplicate_sibling_order", message: `Duplicate order ${node.order} under ${node.parent}`, nodeId: node.id });
    orders.add(node.order); siblingOrders.set(node.parent, orders);
  }

  const sourceNodes: Array<BrainHierarchyNode & { source: string; runtimeId: string }> = [];
  for (const source of [...new Set(sources)].sort()) {
    const candidates = manifest.mappings.filter((mapping) => matches(mapping.pattern, source));
    if (candidates.length === 0) { pushUnique(issues, { code: "unmapped_source", message: `No hierarchy mapping for ${source}`, source }); continue; }
    if (candidates.length > 1) { pushUnique(issues, { code: "ambiguous_source", message: `Multiple hierarchy mappings for ${source}`, source }); continue; }
    const mapping = candidates[0];
    sourceNodes.push({ id: `source:${source}`, kind: "source", label: source.split("/").pop()?.replace(/\.md$/, "") ?? source, parent: mapping.parent, order: 100, canonicalOwner: mapping.canonicalOwner, status: "active", visibility: "default", aliases: [], source, runtimeId: source });
  }

  for (const mapping of manifest.mappings) if (!sources.some((source) => matches(mapping.pattern, source))) pushUnique(issues, { code: "unused_mapping", message: `Mapping matches no source: ${mapping.pattern}`, source: mapping.pattern });
  return { manifest, nodes: [...manifest.nodes, ...sourceNodes], issues, sourceCount: new Set(sources).size, mappedSourceCount: sourceNodes.length };
}

export function parseBrainHierarchy(raw: unknown): BrainHierarchyManifest { return manifestSchema.parse(raw); }
export function loadBrainHierarchy(sources: readonly string[], start = process.cwd()): BrainHierarchyResult { const root = findBrainHierarchyRoot(start); return validateBrainHierarchy(parseBrainHierarchy(JSON.parse(readFileSync(join(root, "brain-hierarchy.json"), "utf8"))), sources); }
