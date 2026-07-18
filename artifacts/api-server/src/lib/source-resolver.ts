import type { BrainHierarchyResult } from "./brain-hierarchy";

export type SourceMatch = "hierarchy_id" | "canonical_path" | "alias";
export interface SourceResolution { input: string; hierarchyId: string; canonicalPath: string; runtimeId: string; matchedBy: SourceMatch }
export interface SourceResolutionTelemetry { attempts: number; resolved: number; unresolved: number; byMatch: Record<SourceMatch, number> }

const telemetry: SourceResolutionTelemetry = { attempts: 0, resolved: 0, unresolved: 0, byMatch: { hierarchy_id: 0, canonical_path: 0, alias: 0 } };
function record(result: SourceResolution | null): SourceResolution | null {
  telemetry.attempts += 1;
  if (!result) telemetry.unresolved += 1;
  else { telemetry.resolved += 1; telemetry.byMatch[result.matchedBy] += 1; }
  return result;
}
export function getSourceResolutionTelemetry(): SourceResolutionTelemetry {
  return { attempts: telemetry.attempts, resolved: telemetry.resolved, unresolved: telemetry.unresolved, byMatch: { ...telemetry.byMatch } };
}
export function resetSourceResolutionTelemetry(): void {
  telemetry.attempts = 0; telemetry.resolved = 0; telemetry.unresolved = 0;
  telemetry.byMatch.hierarchy_id = 0; telemetry.byMatch.canonical_path = 0; telemetry.byMatch.alias = 0;
}

export function resolveBrainSource(input: string, hierarchy: BrainHierarchyResult): SourceResolution | null {
  const normalized = input.trim();
  if (!normalized || hierarchy.issues.length) return record(null);
  for (const node of hierarchy.nodes) {
    if (node.kind !== "source" || !node.source || !node.runtimeId) continue;
    if (node.id === normalized) return record({ input, hierarchyId: node.id, canonicalPath: node.source, runtimeId: node.runtimeId, matchedBy: "hierarchy_id" });
    if (node.source === normalized || node.runtimeId === normalized) return record({ input, hierarchyId: node.id, canonicalPath: node.source, runtimeId: node.runtimeId, matchedBy: "canonical_path" });
    if ((node.sourceAliases ?? []).includes(normalized)) return record({ input, hierarchyId: node.id, canonicalPath: node.source, runtimeId: node.runtimeId, matchedBy: "alias" });
  }
  return record(null);
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
