import type { BrainHierarchyResult } from "./brain-hierarchy";

export type SourceMatch = "hierarchy_id" | "canonical_path" | "alias";
export interface SourceResolution { input: string; hierarchyId: string; canonicalPath: string; runtimeId: string; matchedBy: SourceMatch }

export function resolveBrainSource(input: string, hierarchy: BrainHierarchyResult): SourceResolution | null {
  const normalized = input.trim();
  if (!normalized || hierarchy.issues.length) return null;
  for (const node of hierarchy.nodes) {
    if (node.kind !== "source" || !node.source || !node.runtimeId) continue;
    if (node.id === normalized) return { input, hierarchyId: node.id, canonicalPath: node.source, runtimeId: node.runtimeId, matchedBy: "hierarchy_id" };
    if (node.source === normalized || node.runtimeId === normalized) return { input, hierarchyId: node.id, canonicalPath: node.source, runtimeId: node.runtimeId, matchedBy: "canonical_path" };
    if ((node.sourceAliases ?? []).includes(normalized)) return { input, hierarchyId: node.id, canonicalPath: node.source, runtimeId: node.runtimeId, matchedBy: "alias" };
  }
  return null;
}

export function buildSourceResolutionIndex(hierarchy: BrainHierarchyResult): Map<string, SourceResolution> {
  const index = new Map<string, SourceResolution>();
  if (hierarchy.issues.length) return index;
  for (const node of hierarchy.nodes) {
    if (node.kind !== "source" || !node.source || !node.runtimeId) continue;
    const values: Array<[string, SourceMatch]> = [[node.id, "hierarchy_id"], [node.source, "canonical_path"], ...(node.sourceAliases ?? []).map((alias): [string, SourceMatch] => [alias, "alias"])];
    for (const [value, matchedBy] of values) index.set(value, { input: value, hierarchyId: node.id, canonicalPath: node.source, runtimeId: node.runtimeId, matchedBy });
  }
  return index;
}
