import { db, generationsTable, generationStepsTable, improvementProposalsTable } from "@workspace/db";
import type { BrainHierarchyResult } from "./brain-hierarchy";
import { loadBrainHierarchy } from "./brain-hierarchy";
import { listDocFiles } from "./docs";
import { resolveBrainSource, type SourceMatch } from "./source-resolver";

export type HistoricalSourceKind = "agent" | "workflow" | "client" | "proposal";
export interface HistoricalSourceReference { kind: HistoricalSourceKind; value: string; recordId?: string }
export interface HistoricalSourceResolution extends HistoricalSourceReference {
  status: "resolved" | "runtime_dynamic" | "unresolved";
  hierarchyId: string | null;
  canonicalPath: string | null;
  matchedBy: SourceMatch | null;
}
export interface HistoricalCompatibilityAudit {
  total: number;
  resolved: number;
  runtimeDynamic: number;
  unresolved: number;
  aliasHits: number;
  references: HistoricalSourceResolution[];
}

function uniqueReferences(references: readonly HistoricalSourceReference[]): HistoricalSourceReference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.kind}:${reference.value}`;
    if (!reference.value.trim() || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function parseStringArray(raw: string): string[] {
  try { const value = JSON.parse(raw); return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
  catch { return []; }
}
function isRuntimeDynamic(value: string): boolean {
  return /^clients\/db\/\d+\.md$/.test(value);
}

export function auditHistoricalReferences(references: readonly HistoricalSourceReference[], hierarchy: BrainHierarchyResult): HistoricalCompatibilityAudit {
  const resolvedReferences = uniqueReferences(references).map((reference): HistoricalSourceResolution => {
    if (reference.kind === "client" && isRuntimeDynamic(reference.value)) return { ...reference, status: "runtime_dynamic", hierarchyId: null, canonicalPath: reference.value, matchedBy: null };
    const resolution = resolveBrainSource(reference.value, hierarchy);
    if (!resolution) return { ...reference, status: "unresolved", hierarchyId: null, canonicalPath: null, matchedBy: null };
    return { ...reference, status: "resolved", hierarchyId: resolution.hierarchyId, canonicalPath: resolution.canonicalPath, matchedBy: resolution.matchedBy };
  });
  return {
    total: resolvedReferences.length,
    resolved: resolvedReferences.filter((reference) => reference.status === "resolved").length,
    runtimeDynamic: resolvedReferences.filter((reference) => reference.status === "runtime_dynamic").length,
    unresolved: resolvedReferences.filter((reference) => reference.status === "unresolved").length,
    aliasHits: resolvedReferences.filter((reference) => reference.matchedBy === "alias").length,
    references: resolvedReferences,
  };
}

export async function auditStoredHistoricalSources(): Promise<HistoricalCompatibilityAudit> {
  const [generations, steps, proposals] = await Promise.all([
    db.select({ id: generationsTable.id, clientPath: generationsTable.clientPath, workflowPath: generationsTable.workflowPath, leadAgentPath: generationsTable.leadAgentPath, teamPaths: generationsTable.teamPaths }).from(generationsTable),
    db.select({ id: generationStepsTable.id, agentPath: generationStepsTable.agentPath }).from(generationStepsTable),
    db.select({ id: improvementProposalsTable.id, targetPath: improvementProposalsTable.targetPath }).from(improvementProposalsTable),
  ]);
  const references: HistoricalSourceReference[] = [];
  for (const generation of generations) {
    const recordId = `generation:${generation.id}`;
    references.push({ kind: "client", value: generation.clientPath, recordId }, { kind: "workflow", value: generation.workflowPath, recordId }, { kind: "agent", value: generation.leadAgentPath, recordId });
    for (const path of parseStringArray(generation.teamPaths)) references.push({ kind: "agent", value: path, recordId });
  }
  for (const step of steps) references.push({ kind: step.agentPath.startsWith("workflows/") ? "workflow" : "agent", value: step.agentPath, recordId: `step:${step.id}` });
  for (const proposal of proposals) references.push({ kind: "proposal", value: proposal.targetPath, recordId: `proposal:${proposal.id}` });
  const files = listDocFiles();
  const hierarchy = loadBrainHierarchy(files.map((file) => file.path));
  return auditHistoricalReferences(references, hierarchy);
}
