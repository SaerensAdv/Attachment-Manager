import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

const nodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["master", "hub", "registry", "object", "source", "runtime"]),
  label: z.string().min(1),
  parent: z.string().nullable(),
  order: z.number().int(),
  canonicalOwner: z.enum(["clickup", "github", "replit", "mixed"]),
  status: z.enum(["active", "paused", "deprecated", "archived"]),
  visibility: z.enum(["default", "advanced", "hidden"]),
});
const mappingSchema = z.object({ pattern: z.string().min(1), parent: z.string().min(1), canonicalOwner: z.enum(["clickup", "github", "replit", "mixed"]) });
const manifestSchema = z.object({ version: z.literal(1), rootId: z.string().min(1), nodes: z.array(nodeSchema), mappings: z.array(mappingSchema) });

export type BrainHierarchyNode = z.infer<typeof nodeSchema>;
export type BrainHierarchyManifest = z.infer<typeof manifestSchema>;
export interface BrainHierarchyIssue { code: string; message: string; nodeId?: string; source?: string }
export interface BrainHierarchyResult { manifest: BrainHierarchyManifest; nodes: Array<BrainHierarchyNode & { source?: string; runtimeId?: string }>; issues: BrainHierarchyIssue[]; sourceCount: number; mappedSourceCount: number }

function findManifestRoot(start = process.cwd()): string {
  let dir = start;
  while (true) {
    if (existsSync(join(dir, "brain-hierarchy.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("Could not locate brain-hierarchy.json");
    dir = parent;
  }
}

function matches(pattern: string, source: string): boolean {
  if (!pattern.includes("*")) return pattern === source;
  const [prefix, suffix] = pattern.split("*");
  return source.startsWith(prefix) && source.endsWith(suffix ?? "");
}

export function validateBrainHierarchy(manifest: BrainHierarchyManifest, sources: readonly string[]): BrainHierarchyResult {
  const issues: BrainHierarchyIssue[] = [];
  const ids = new Set<string>();
  for (const node of manifest.nodes) {
    if (ids.has(node.id)) issues.push({ code: "duplicate_id", message: `Duplicate hierarchy id: ${node.id}`, nodeId: node.id });
    ids.add(node.id);
  }
  if (!ids.has(manifest.rootId)) issues.push({ code: "missing_root", message: `Root node does not exist: ${manifest.rootId}` });
  for (const node of manifest.nodes) if (node.parent && !ids.has(node.parent)) issues.push({ code: "missing_parent", message: `Unknown parent ${node.parent}`, nodeId: node.id });
  for (const mapping of manifest.mappings) if (!ids.has(mapping.parent)) issues.push({ code: "mapping_parent_missing", message: `Mapping parent does not exist: ${mapping.parent}` });

  for (const node of manifest.nodes) {
    const seen = new Set<string>();
    let cursor: BrainHierarchyNode | undefined = node;
    while (cursor?.parent) {
      if (seen.has(cursor.id)) { issues.push({ code: "cycle", message: `Hierarchy cycle at ${cursor.id}`, nodeId: node.id }); break; }
      seen.add(cursor.id);
      cursor = manifest.nodes.find((candidate) => candidate.id === cursor?.parent);
    }
  }

  const sourceNodes: Array<BrainHierarchyNode & { source: string; runtimeId: string }> = [];
  for (const source of [...new Set(sources)].sort()) {
    const matchesForSource = manifest.mappings.filter((mapping) => matches(mapping.pattern, source));
    if (matchesForSource.length === 0) { issues.push({ code: "unmapped_source", message: `No hierarchy mapping for ${source}`, source }); continue; }
    if (matchesForSource.length > 1) { issues.push({ code: "ambiguous_source", message: `Multiple hierarchy mappings for ${source}`, source }); continue; }
    const mapping = matchesForSource[0];
    sourceNodes.push({ id: `source:${source}`, kind: "source", label: source.split("/").pop()?.replace(/\.md$/, "") ?? source, parent: mapping.parent, order: 100, canonicalOwner: mapping.canonicalOwner, status: "active", visibility: "default", source, runtimeId: source });
  }
  return { manifest, nodes: [...manifest.nodes, ...sourceNodes], issues, sourceCount: new Set(sources).size, mappedSourceCount: sourceNodes.length };
}

export function loadBrainHierarchy(sources: readonly string[], start = process.cwd()): BrainHierarchyResult {
  const root = findManifestRoot(start);
  const parsed = manifestSchema.parse(JSON.parse(readFileSync(join(root, "brain-hierarchy.json"), "utf8")));
  return validateBrainHierarchy(parsed, sources);
}
