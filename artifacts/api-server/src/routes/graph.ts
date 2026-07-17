import { Router, type IRouter } from "express";
import {
  GetGraphOverviewResponse,
  GetGraphNeighborsResponse,
  SearchGraphResponse,
  SyncGraphResponse,
  GetGraphSyncStatusResponse,
} from "@workspace/api-zod";
import { isOwner } from "../middlewares/requireAuth";
import { buildGraph } from "../lib/graph/build";
import { collectGraphInput } from "../lib/graph/collect";
import {
  neighbors,
  reduceToOverview,
  searchNodes,
} from "../lib/graph/overview";
import {
  beginSync,
  completeSync,
  failSync,
  getActiveGraph,
  isSyncing,
  loadActiveIntoMemory,
  type SnapshotMeta,
} from "../lib/graph/snapshot-store";
import type { Graph } from "../lib/graph/types";

const router: IRouter = Router();

const EMPTY_GRAPH: Graph = { nodes: [], edges: [] };
const SEARCH_LIMIT_DEFAULT = 30;
const SEARCH_LIMIT_MAX = 100;

/** Build the client-facing cache meta from a stored snapshot (or "none"). */
function metaFrom(m: SnapshotMeta | null | undefined) {
  if (!m) {
    return {
      status: "none",
      nodeCount: 0,
      edgeCount: 0,
      contentHash: null,
      sourceUpdatedAt: null,
      lastSyncedAt: null,
      error: null,
      syncing: isSyncing(),
    };
  }
  return {
    status: m.status === "active" ? "active" : "none",
    nodeCount: m.nodeCount,
    edgeCount: m.edgeCount,
    contentHash: m.contentHash,
    sourceUpdatedAt: m.sourceUpdatedAt,
    lastSyncedAt: m.lastSyncedAt,
    error: m.error,
    syncing: isSyncing(),
  };
}

/** The active snapshot, hydrating the in-memory index from the DB on first use. */
async function readActive(): Promise<{ meta: SnapshotMeta; graph: Graph } | null> {
  return getActiveGraph() ?? (await loadActiveIntoMemory());
}

// GET /graph/overview — light, capped opening view (served from memory) --------
router.get("/graph/overview", async (_req, res): Promise<void> => {
  const active = await readActive();
  const graph = active?.graph ?? EMPTY_GRAPH;
  const ov = reduceToOverview(graph);
  res.json(
    GetGraphOverviewResponse.parse({
      nodes: ov.nodes,
      edges: ov.edges,
      meta: metaFrom(active?.meta),
      truncated: ov.truncated,
      totalNodes: ov.totalNodes,
      totalEdges: ov.totalEdges,
    }),
  );
});

// GET /graph/neighbors/:nodeId — a node's direct (1-hop) neighbourhood ---------
router.get("/graph/neighbors/:nodeId", async (req, res): Promise<void> => {
  const active = await readActive();
  const graph = active?.graph ?? EMPTY_GRAPH;
  const nb = neighbors(graph, req.params.nodeId);
  if (!nb) {
    res.status(404).json({ error: "Node not found in the active snapshot" });
    return;
  }
  res.json(
    GetGraphNeighborsResponse.parse({
      center: nb.center,
      nodes: nb.nodes,
      edges: nb.edges,
    }),
  );
});

// GET /graph/search?q=&limit= — search across the WHOLE graph ------------------
router.get("/graph/search", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  if (q.trim().length === 0) {
    res.status(400).json({ error: "Query parameter 'q' is required" });
    return;
  }
  let limit = SEARCH_LIMIT_DEFAULT;
  if (typeof req.query.limit === "string" && req.query.limit.trim() !== "") {
    const n = Number.parseInt(req.query.limit, 10);
    if (Number.isFinite(n)) limit = Math.min(SEARCH_LIMIT_MAX, Math.max(1, n));
  }

  const active = await readActive();
  const graph = active?.graph ?? EMPTY_GRAPH;
  const { results, total } = searchNodes(graph, q, limit);
  res.json(SearchGraphResponse.parse({ results, total }));
});

// POST /graph/sync — rebuild + atomically activate (owner-gated) ---------------
router.post("/graph/sync", async (req, res): Promise<void> => {
  if (!isOwner(req)) {
    res.status(403).json({ error: "Only the account owner can rebuild the graph" });
    return;
  }
  if (isSyncing()) {
    res.status(409).json({ error: "A graph sync is already in progress" });
    return;
  }

  const buildingId = await beginSync();
  if (buildingId === null) {
    // Either the lock was taken between the check and here, or the store is
    // unavailable — either way, ask the caller to retry shortly.
    res.status(409).json({ error: "The graph store is busy or unavailable" });
    return;
  }

  try {
    const collected = await collectGraphInput();
    if (!collected.ok) {
      await failSync(buildingId, collected.errors.join("; ").slice(0, 300) || "source crawl failed");
      res.status(502).json(
        SyncGraphResponse.parse({
          ok: false,
          changed: false,
          meta: metaFrom(getActiveGraph()?.meta),
          note: "Bronnen niet bereikbaar; vorige graph behouden.",
        }),
      );
      return;
    }

    const graph = buildGraph(collected.input);
    const { changed, meta } = await completeSync(buildingId, graph, {
      sourceUpdatedAt: collected.sourceUpdatedAt,
    });
    res.json(
      SyncGraphResponse.parse({
        ok: true,
        changed,
        meta: metaFrom(meta ?? getActiveGraph()?.meta),
        note:
          collected.errors.length > 0
            ? `Gedeeltelijk: ${collected.errors.length} bron(nen) overgeslagen.`
            : null,
      }),
    );
  } catch (err) {
    await failSync(buildingId, err instanceof Error ? err.message : "sync failed");
    req.log.error(
      { err: err instanceof Error ? err.message : String(err) },
      "graph sync failed",
    );
    res.status(502).json(
      SyncGraphResponse.parse({
        ok: false,
        changed: false,
        meta: metaFrom(getActiveGraph()?.meta),
        note: "Sync mislukt; vorige graph behouden.",
      }),
    );
  }
});

// GET /graph/sync-status — cache freshness + whether a sync is running ---------
router.get("/graph/sync-status", async (_req, res): Promise<void> => {
  const active = await readActive();
  res.json(GetGraphSyncStatusResponse.parse({ meta: metaFrom(active?.meta) }));
});

export default router;
