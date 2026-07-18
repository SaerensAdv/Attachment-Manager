import { Router, type IRouter } from "express";
import { GetGraphOverviewResponse, GetGraphNeighborsResponse, SearchGraphResponse, SyncGraphResponse, GetGraphSyncStatusResponse } from "@workspace/api-zod";
import { isOwner } from "../middlewares/requireAuth";
import { buildGraph } from "../lib/graph/build";
import { collectGraphInput } from "../lib/graph/collect";
import { diagnoseGraph } from "../lib/graph/diagnostics";
import { applyHierarchyProjection } from "../lib/graph/hierarchy-projection";
import { neighbors, reduceToOverview, searchNodes } from "../lib/graph/overview";
import { beginSync, completeSync, failSync, getActiveGraph, isSyncing, loadActiveIntoMemory, type SnapshotMeta } from "../lib/graph/snapshot-store";
import { getRuntimeProvenance } from "../lib/runtime-provenance";
import { loadBrainHierarchy } from "../lib/brain-hierarchy";
import type { Graph } from "../lib/graph/types";
import type { GraphCollectionReport } from "../lib/graph/collection-policy";
const router: IRouter = Router(); const EMPTY_GRAPH: Graph = { nodes: [], edges: [] }; const unlimitedOverviewEnabled = () => process.env.GRAPH_OVERVIEW_UNLIMITED === "true";
function metaFrom(m: SnapshotMeta | null | undefined) { if (!m) return { status: "none", nodeCount: 0, edgeCount: 0, contentHash: null, sourceUpdatedAt: null, lastSyncedAt: null, error: null, syncing: isSyncing() }; return { status: m.status === "active" ? "active" : "none", nodeCount: m.nodeCount, edgeCount: m.edgeCount, contentHash: m.contentHash, sourceUpdatedAt: m.sourceUpdatedAt, lastSyncedAt: m.lastSyncedAt, error: m.error, syncing: isSyncing() }; }
async function readActive(): Promise<{ meta: SnapshotMeta; graph: Graph } | null> { return getActiveGraph() ?? (await loadActiveIntoMemory()); }
function exclusionCount(report: GraphCollectionReport | undefined): number { if (!report) return 0; return report.workspaces.excluded + report.spaces.excluded + report.lists.excluded + report.tasks.excludedByAge + report.tasks.excludedByListCap + report.tasks.excludedByGlobalCap + report.docs.excluded + report.pages.excluded + report.pushRecords.excluded; }
router.get("/graph/runtime-provenance", async (_req, res): Promise<void> => { const active = await readActive(); res.json({ runtime: getRuntimeProvenance(), active: active ? { snapshotId: active.meta.id, contentHash: active.meta.contentHash, diagnostics: diagnoseGraph(active.graph, getRuntimeProvenance()) } : null }); });
router.get("/graph/overview", async (_req, res): Promise<void> => { const active = await readActive(); const graph = active?.graph ?? EMPTY_GRAPH; const overview = unlimitedOverviewEnabled() ? { nodes: graph.nodes, edges: graph.edges, truncated: false, totalNodes: graph.nodes.length, totalEdges: graph.edges.length } : reduceToOverview(graph); res.json(GetGraphOverviewResponse.parse({ nodes: overview.nodes, edges: overview.edges, meta: metaFrom(active?.meta), truncated: overview.truncated, totalNodes: overview.totalNodes, totalEdges: overview.totalEdges })); });
router.get("/graph/neighbors/:nodeId", async (req, res): Promise<void> => { const active = await readActive(); const result = neighbors(active?.graph ?? EMPTY_GRAPH, req.params.nodeId); if (!result) { res.status(404).json({ error: "Node not found in the active snapshot" }); return; } res.json(GetGraphNeighborsResponse.parse({ center: result.center, nodes: result.nodes, edges: result.edges })); });
router.get("/graph/search", async (req, res): Promise<void> => { const q = typeof req.query.q === "string" ? req.query.q : ""; if (!q.trim()) { res.status(400).json({ error: "Query parameter 'q' is required" }); return; } const parsed = typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : 30; const limit = Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : 30; const active = await readActive(); res.json(SearchGraphResponse.parse(searchNodes(active?.graph ?? EMPTY_GRAPH, q, limit))); });
router.post("/graph/sync", async (req, res): Promise<void> => {
  if (!isOwner(req)) { res.status(403).json({ error: "Only the account owner can rebuild the graph" }); return; } if (isSyncing()) { res.status(409).json({ error: "A graph sync is already in progress" }); return; }
  const buildingId = await beginSync(); if (buildingId === null) { res.status(409).json({ error: "The graph store is busy or unavailable" }); return; }
  try {
    const collected = await collectGraphInput(); if (!collected.ok) { await failSync(buildingId, collected.errors.join("; ").slice(0, 300) || "source crawl failed"); res.status(502).json(SyncGraphResponse.parse({ ok: false, changed: false, meta: metaFrom(getActiveGraph()?.meta), note: "Bronnen niet bereikbaar; vorige graph behouden." })); return; }
    const hierarchy = loadBrainHierarchy(collected.input.docGraph.nodes.map((node) => node.path));
    if (hierarchy.issues.length) throw new Error(`hierarchy invalid: ${hierarchy.issues.map((issue) => issue.code).join(",")}`);
    const graph = applyHierarchyProjection(buildGraph(collected.input), hierarchy); const runtime = getRuntimeProvenance(); const candidate = diagnoseGraph(graph, runtime);
    if (candidate.invariantFailures.length) throw new Error(`graph invariants: ${candidate.invariantFailures.join(",")}`);
    const { changed, meta } = await completeSync(buildingId, graph, { sourceUpdatedAt: collected.sourceUpdatedAt }); const active = getActiveGraph(); const activeDiagnostics = diagnoseGraph(active?.graph ?? EMPTY_GRAPH, runtime);
    if (!active || active.meta.contentHash !== meta.contentHash || JSON.stringify(activeDiagnostics.nodesByType) !== JSON.stringify(candidate.nodesByType)) throw new Error("active graph diagnostics do not match candidate");
    const excluded = exclusionCount(collected.report); const notes: string[] = [];
    if (excluded > 0) notes.push(`Begrensd: ${graph.nodes.length} nodes opgenomen, ${excluded} bronitems uitgesloten.`); if (collected.errors.length > 0) notes.push(`Gedeeltelijk: ${collected.errors.length} bron(nen) niet bereikbaar.`);
    notes.push(`Build ${runtime.gitSha?.slice(0, 8) ?? "unknown"}; lenses S${candidate.nodesByLens.structure} K${candidate.nodesByLens.knowledge} A${candidate.nodesByLens.agents} W${candidate.nodesByLens.active} F${candidate.nodesByLens.flows}.`);
    res.json(SyncGraphResponse.parse({ ok: true, changed, meta: metaFrom(meta), note: notes.join(" ") }));
  } catch (error) { await failSync(buildingId, error instanceof Error ? error.message : "sync failed"); req.log.error({ err: error instanceof Error ? error.message : String(error), runtime: getRuntimeProvenance() }, "graph sync failed"); res.status(502).json(SyncGraphResponse.parse({ ok: false, changed: false, meta: metaFrom(getActiveGraph()?.meta), note: `Sync mislukt op build ${getRuntimeProvenance().gitSha?.slice(0, 8) ?? "unknown"}; vorige graph behouden.` })); }
});
router.get("/graph/sync-status", async (_req, res): Promise<void> => { const active = await readActive(); res.json(GetGraphSyncStatusResponse.parse({ meta: metaFrom(active?.meta) })); });
export default router;
