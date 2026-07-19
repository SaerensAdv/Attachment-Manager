import { describe, expect, it } from "vitest";
import { diagnosticState, diagnosticsEqual } from "./diagnostic-state";
import type { GraphDiagnostics } from "./diagnostics";
const base: GraphDiagnostics = { totalNodes: 2, totalEdges: 1, nodesBySource: { clickup: 2 }, nodesByType: { workspace: 1, integration: 1 }, nodesByLens: { structure: 1, knowledge: 0, agents: 0, active: 0, flows: 1 }, edgesByRelation: { reads_from: 1 }, invariantFailures: [] };
describe("graph diagnostic state", () => {
  it("compares the full safe graph composition", () => { expect(diagnosticsEqual(base, { ...base })).toBe(true); expect(diagnosticsEqual(base, { ...base, totalEdges: 2 })).toBe(false); });
  it("distinguishes healthy, degraded and failed", () => { expect(diagnosticState({ diagnostics: base, sourceErrors: [], parity: true })).toBe("healthy"); expect(diagnosticState({ diagnostics: base, sourceErrors: ["docs:timeout"], parity: true })).toBe("degraded"); expect(diagnosticState({ diagnostics: base, sourceErrors: [], parity: false })).toBe("failed"); });
});
