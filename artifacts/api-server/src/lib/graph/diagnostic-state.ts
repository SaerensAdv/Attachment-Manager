import type { GraphDiagnostics } from "./diagnostics";
import type { RuntimeProvenance } from "../runtime-provenance";

export type GraphDiagnosticState = "healthy" | "degraded" | "failed" | "unknown";
export interface GraphDiagnosticEvidence {
  state: GraphDiagnosticState;
  checkedAt: string;
  snapshotId: number | null;
  contentHash: string | null;
  runtime: RuntimeProvenance;
  candidate: GraphDiagnostics | null;
  active: GraphDiagnostics | null;
  serialized: GraphDiagnostics | null;
  sourceErrors: string[];
  parity: { candidateToActive: boolean | null; activeToSerialized: boolean | null };
}

let evidence: GraphDiagnosticEvidence | null = null;
export function setGraphDiagnosticEvidence(next: GraphDiagnosticEvidence): void { evidence = next; }
export function getGraphDiagnosticEvidence(): GraphDiagnosticEvidence | null { return evidence; }
export function resetGraphDiagnosticEvidenceForTests(): void { evidence = null; }
export function diagnosticsEqual(a: GraphDiagnostics, b: GraphDiagnostics): boolean {
  return a.totalNodes === b.totalNodes && a.totalEdges === b.totalEdges && JSON.stringify(a.nodesBySource) === JSON.stringify(b.nodesBySource) && JSON.stringify(a.nodesByType) === JSON.stringify(b.nodesByType) && JSON.stringify(a.nodesByLens) === JSON.stringify(b.nodesByLens) && JSON.stringify(a.edgesByRelation) === JSON.stringify(b.edgesByRelation);
}
export function diagnosticState(input: { diagnostics: GraphDiagnostics; sourceErrors: string[]; parity: boolean }): GraphDiagnosticState {
  if (input.diagnostics.invariantFailures.length || !input.parity) return "failed";
  return input.sourceErrors.length ? "degraded" : "healthy";
}
