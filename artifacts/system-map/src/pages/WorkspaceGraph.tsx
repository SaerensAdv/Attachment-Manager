import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, Loader2, MoreHorizontal, RefreshCw } from "lucide-react";
import {
  useGetGraphOverview,
  getGetGraphOverviewQueryKey,
  useGetGraphSyncStatus,
  getGetGraphSyncStatusQueryKey,
  useSyncGraph,
  getGraphNeighbors,
  getGetGraphNeighborsQueryKey,
  type GraphNode,
  type GraphEdge,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { deriveGraphState, indexById, isStale, mergeById, relativeTime, type FilterGroupId } from "@/components/workspace-graph/graph-model";
import WorkspaceGraphCanvas from "@/components/workspace-graph/WorkspaceGraphCanvas";
import NodeDetailPanel from "@/components/workspace-graph/NodeDetailPanel";
import GraphLegend from "@/components/workspace-graph/GraphLegend";
import AtlasShell from "@/components/atlas/AtlasShell";

export default function WorkspaceGraph() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hiddenGroups, setHiddenGroups] = useState<Set<FilterGroupId>>(() => new Set());
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [expNodes, setExpNodes] = useState<Map<string, GraphNode>>(() => new Map());
  const [expEdges, setExpEdges] = useState<Map<string, GraphEdge>>(() => new Map());

  const { data: overview, isLoading, isError, refetch } = useGetGraphOverview();
  const meta = overview?.meta;
  const viewNodes = useMemo(() => [...mergeById(indexById(overview?.nodes ?? []), [...expNodes.values()]).values()], [overview, expNodes]);
  const viewEdges = useMemo(() => [...mergeById(indexById(overview?.edges ?? []), [...expEdges.values()]).values()], [overview, expEdges]);
  const selectedNode = useMemo(() => viewNodes.find((node) => node.id === selectedNodeId) ?? null, [viewNodes, selectedNodeId]);

  const handleExpand = (data: { nodes: GraphNode[]; edges: GraphEdge[] }) => {
    setExpNodes((prev) => mergeById(prev, data.nodes));
    setExpEdges((prev) => mergeById(prev, data.edges));
  };
  const handlePick = async (id: string) => {
    if (!viewNodes.some((node) => node.id === id)) {
      try {
        const result = await queryClient.fetchQuery({ queryKey: getGetGraphNeighborsQueryKey(id), queryFn: ({ signal }) => getGraphNeighbors(id, { signal }) });
        if (result) handleExpand({ nodes: [...result.nodes], edges: [...result.edges] });
      } catch { /* Global search can still focus a node removed during a sync. */ }
    }
    setSelectedNodeId(id);
    setFocusRequest((prev) => ({ id, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  const lastHash = useRef<string | undefined>(undefined);
  useEffect(() => {
    const hash = meta?.contentHash ?? undefined;
    if (lastHash.current && hash !== lastHash.current) {
      setExpNodes(new Map());
      setExpEdges(new Map());
      setSelectedNodeId(null);
    }
    lastHash.current = hash;
  }, [meta?.contentHash]);

  const { data: syncStatus } = useGetGraphSyncStatus({ query: { queryKey: getGetGraphSyncStatusQueryKey(), refetchInterval: (query) => meta?.syncing || query.state.data?.meta.syncing ? 2500 : false } });
  const statusSyncing = syncStatus?.meta.syncing ?? false;
  const wasSyncing = useRef(false);
  useEffect(() => {
    if (wasSyncing.current && !statusSyncing) queryClient.invalidateQueries({ queryKey: getGetGraphOverviewQueryKey() });
    wasSyncing.current = statusSyncing;
  }, [statusSyncing, queryClient]);

  const sync = useSyncGraph({ mutation: {
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: getGetGraphOverviewQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetGraphSyncStatusQueryKey() });
      toast({ title: result.changed ? "Workspace synced" : "Workspace already current", description: result.note ?? undefined });
    },
    onError: (error) => {
      const status = (error as { status?: number } | null)?.status;
      toast(status === 409 ? { title: "Sync already running" } : { variant: "destructive", title: "Sync failed", description: "The last valid snapshot is still active." });
    },
  } });

  const isSyncing = Boolean(meta?.syncing || statusSyncing || sync.isPending);
  const state = deriveGraphState({ isLoading, isError, hasNodes: (overview?.nodes.length ?? 0) > 0, metaStatus: meta?.status });
  const stale = state === "ready" && !isSyncing && isStale(meta?.lastSyncedAt);
  const toggleGroup = (id: FilterGroupId) => setHiddenGroups((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const actions = <>
    <span className={`atlas-live ${stale ? "is-stale" : ""}`}><i />{stale ? "STALE SNAPSHOT" : `LIVE · ${relativeTime(meta?.lastSyncedAt).replace(" geleden", "")}`}</span>
    <button type="button" className="atlas-action" onClick={() => !isSyncing && sync.mutate()} disabled={isSyncing}>
      <RefreshCw className={isSyncing ? "atlas-rotating" : ""} />{isSyncing ? "Syncing" : "Sync now"}
    </button>
    <button type="button" className="atlas-icon-action" aria-label="More workspace actions"><MoreHorizontal /></button>
  </>;

  return (
    <AtlasShell title="Workspace Atlas" subtitle="Saerens Operating System" actions={actions}>
      <main className="atlas-stage">
        <div className="atlas-grid" aria-hidden="true" />
        {state === "loading" && <div className="atlas-state atlas-skeleton-state"><Loader2 className="atlas-rotating" /><span>Loading workspace</span></div>}
        {state === "error" && <div className="atlas-state is-error"><AlertTriangle /><strong>Workspace unavailable</strong><p>The last valid snapshot was not reachable.</p><button onClick={() => refetch()}>Try again</button></div>}
        {state === "empty" && <div className="atlas-state"><Activity /><strong>No graph snapshot yet</strong><p>Run the first read-only sync to map your workspace.</p><button onClick={() => sync.mutate()}>Start first sync</button></div>}
        {state === "ready" && overview && <WorkspaceGraphCanvas nodes={viewNodes} edges={viewEdges} hiddenGroups={hiddenGroups} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} fitKey={meta?.contentHash ?? undefined} focusRequest={focusRequest} />}
        <GraphLegend hiddenGroups={hiddenGroups} onToggleGroup={toggleGroup} onPick={handlePick} />
        {overview?.truncated && <div className="atlas-truncated">{overview.nodes.length} of {overview.totalNodes} nodes loaded, search covers all</div>}
      </main>
      <NodeDetailPanel node={selectedNode} onClose={() => setSelectedNodeId(null)} onSelectNode={handlePick} onExpand={handleExpand} />
    </AtlasShell>
  );
}
