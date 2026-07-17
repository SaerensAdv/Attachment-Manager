import { Router, type IRouter } from "express";
import { GetGraphOverviewResponse, GetGraphNeighborsResponse, SearchGraphResponse, SyncGraphResponse, GetGraphSyncStatusResponse } from "@workspace/api-zod";
import { isOwner } from "../middlewares/requireAuth";
import { buildGraph } from "../lib/graph/build";
import { collectGraphInput } from "../lib/graph/collect";
import { neighbors, reduceToOverview, searchNodes } from "../lib/graph/overview";
import { beginSync, completeSync, failSync, getActiveGraph, isSyncing, loadActiveIntoMemory, type SnapshotMeta } from "../lib/graph/snapshot-store";
import type { Graph } from "../lib/graph/types";
import type { GraphCollectionReport } from "../lib/graph/collection-policy";

const router: IRouter = Router();
const EMPTY_GRAPH: Graph = { nodes: [], edges: [] };
const SEARCH_LIMIT_DEFAULT = 30;
const SEARCH_LIMIT_MAX = 100;
function metaFrom(m: SnapshotMeta | null | undefined) {
  if (!m) return { status: "none", nodeCount: 0, edgeCount: 0, contentHash: null, sourceUpdatedAt: null, lastSyncedAt: null, error: null, syncing: isSyncing() };
  return { status: m.status === "active" ? "active" : "none", nodeCount: m.nodeCount, edgeCount: m.edgeCount, contentHash: m.contentHash, sourceUpdatedAt: m.sourceUpdatedAt, lastSyncedAt: m.lastSyncedAt, error: m.error, syncing: isSyncing() };
}
async function readActive(): Promise<{ meta: SnapshotMeta; graph: Graph } | null> { return getActiveGraph() ?? (await loadActiveIntoMemory()); }
function exclusionCount(report: GraphCollectionReport | undefined): number {
  if (!report) return 0;
  return report.workspaces.excluded + report.spaces.excluded + report.lists.excluded + report.tasks.excludedByAge + report.tasks.excludedByListCap + report.tasks.excludedByGlobalCap + report.docs.excluded + report.pages.excluded + report.pushRecords.excluded;
}

router.get("/graph/overview", async (_req, res): Promise<void> => {
  const active = await readActive(); const graph = active?.graph ?? EMPTY_GRAPH; const overview = reduceToOverview(graph);
  res.json(GetGraphOverviewResponse.parse({ nodes: overview.nodes, edges: overview.edges, meta: metaFrom(active?.meta), truncated: overview.truncated, totalNodes: overview.totalNodes, totalEdges: overview.totalEdges }));
});
router.get("/graph/neighbors/:nodeId", async (req, res): Promise<void> => {
  const active = await readActive(); const result = neighbors(active?.graph ?? EMPTY_GRAPH, req.params.nodeId);
  if (!result) { res.status(404).json({ error: "Node not found in the active snapshot" }); return; }
  res.json(GetGraphNeighborsResponse.parse({ center: result.center, nodes: result.nodes, edges: result.edges }));
});
router.get("/graph/search", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  if (!q.trim()) { res.status(400).json({ error: "Query parameter 'q' is required" }); return; }
  let limit = SEARCH_LIMIT_DEFAULT;
  if (typeof req.query.limit === "string" && req.query.limit.trim()) { const parsed = Number.parseInt(req.query.limit, 10); if (Number.isFinite(parsed)) limit = Math.min(SEARCH_LIMIT_MAX, Math.max(1, parsed)); }
  const active = await readActive(); const result = searchNodes(active?.graph ?? EMPTY_GRAPH, q, limit);
  res.json(SearchGraphResponse.parse(result));
});
router.post("/graph/sync", async (req, res): Promise<void> => {
  if (!isOwner(req)) { res.status(403).json({ error: "Only the account owner can rebuild the graph" }); return; }
  if (isSyncing()) { res.status(409).json({ error: "A graph sync is already in progress" }); return; }
  const buildingId = await beginSync();
  if (buildingId === null) { res.status(409).json({ error: "The graph store is busy or unavailable" }); return; }
  try {
    const collected = await collectGraphInput();
    if (!collected.ok) {
      await failSync(buildingId, collected.errors.join("; ").slice(0, 300) || "source crawl failed");
      res.status(502).json(SyncGraphResponse.parse({ ok: false, changed: false, meta: metaFrom(getActiveGraph()?.meta), note: "Bronnen niet bereikbaar; vorige graph behouden." })); return;
    }
    const graph = buildGraph(collected.input);
    const { changed, meta } = await completeSync(buildingId, graph, { sourceUpdatedAt: collected.sourceUpdatedAt });
    const excluded = exclusionCount(collected.report);
    const notes: string[] = [];
    if (excluded > 0) notes.push(`Begrensd: ${graph.nodes.length} nodes opgenomen, ${excluded} bronitems uitgesloten.`);
    if (collected.errors.length > 0) notes.push(`Gedeeltelijk: ${collected.errors.length} bron(nen) niet bereikbaar.`);
    res.json(SyncGraphResponse.parse({ ok: true, changed, meta: metaFrom(meta ?? getActiveGraph()?.meta), note: notes.length ? notes.join(" ") : null }));
  } catch (error) {
    await failSync(buildingId, error instanceof Error ? error.message : "sync failed");
    req.log.error({ err: error instanceof Error ? error.message : String(error) }, "graph sync failed");
    res.status(502).json(SyncGraphResponse.parse({ ok: false, changed: false, meta: metaFrom(getActiveGraph()?.meta), note: "Sync mislukt; vorige graph behouden." }));
  }
});
router.get("/graph/sync-status", async (_req, res): Promise<void> => { const active = await readActive(); res.json(GetGraphSyncStatusResponse.parse({ meta: metaFrom(active?.meta) })); });
export default router;
