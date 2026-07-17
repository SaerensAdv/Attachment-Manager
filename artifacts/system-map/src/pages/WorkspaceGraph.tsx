import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Network, RefreshCw, AlertTriangle, Sparkles } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { useToast } from "@/hooks/use-toast";
import {
  deriveGraphState,
  relativeTime,
  isStale,
  indexById,
  mergeById,
  type GraphViewState,
  type FilterGroupId,
} from "@/components/workspace-graph/graph-model";
import WorkspaceGraphCanvas from "@/components/workspace-graph/WorkspaceGraphCanvas";
import NodeDetailPanel from "@/components/workspace-graph/NodeDetailPanel";
import GraphLegend from "@/components/workspace-graph/GraphLegend";

// Fase 3.5 §7 — the Workspace Graph: a read-only, dark editorial atlas of the
// whole Saerens operation (ClickUp structure, docs, agents, live flows) served
// from the backend snapshot cache. This shell owns data orchestration, the
// dark-canvas surface, the sync control and the loading/empty/error states; the
// interactive canvas mounts inside the "ready" branch.
export default function WorkspaceGraph() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hiddenGroups, setHiddenGroups] = useState<Set<FilterGroupId>>(
    () => new Set(),
  );
  // A bumped nonce re-triggers the canvas to pan to `focusId` even on a repeat
  // pick of the same node (search → centre it).
  const [focusRequest, setFocusRequest] = useState<{
    id: string;
    nonce: number;
  } | null>(null);

  // Progressive disclosure (§7.5): the live view is the overview UNION every
  // expanded neighbourhood, accumulated here as stable-id maps.
  const [expNodes, setExpNodes] = useState<Map<string, GraphNode>>(
    () => new Map(),
  );
  const [expEdges, setExpEdges] = useState<Map<string, GraphEdge>>(
    () => new Map(),
  );

  const handleExpand = (data: { nodes: GraphNode[]; edges: GraphEdge[] }) => {
    setExpNodes((prev) => mergeById(prev, data.nodes));
    setExpEdges((prev) => mergeById(prev, data.edges));
  };

  const toggleGroup = (id: FilterGroupId) => {
    setHiddenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePick = async (id: string) => {
    // Search spans the WHOLE graph, which is larger than the truncated overview.
    // If the pick isn't on the current view, pull its 1-hop neighbourhood first
    // so the panel resolves and the canvas has a node to pan to; otherwise the
    // pick would be a silent no-op.
    if (!viewNodes.some((n) => n.id === id)) {
      try {
        const nb = await queryClient.fetchQuery({
          queryKey: getGetGraphNeighborsQueryKey(id),
          queryFn: ({ signal }) => getGraphNeighbors(id, { signal }),
        });
        if (nb) handleExpand({ nodes: nb.nodes, edges: nb.edges });
      } catch {
        // Best-effort: still select so at least the id is remembered.
      }
    }
    setSelectedNodeId(id);
    setFocusRequest((prev) => ({ id, nonce: (prev?.nonce ?? 0) + 1 }));
  };

  const {
    data: overview,
    isLoading,
    isError,
    refetch,
  } = useGetGraphOverview();

  const meta = overview?.meta;
  const overviewSyncing = meta?.syncing ?? false;

  // The rendered view = overview UNION accumulated expansions (§7.5).
  const viewNodes = useMemo(
    () => [...mergeById(indexById(overview?.nodes ?? []), [...expNodes.values()]).values()],
    [overview, expNodes],
  );
  const viewEdges = useMemo(
    () => [...mergeById(indexById(overview?.edges ?? []), [...expEdges.values()]).values()],
    [overview, expEdges],
  );

  const selectedNode = useMemo(
    () => viewNodes.find((n) => n.id === selectedNodeId) ?? null,
    [viewNodes, selectedNodeId],
  );

  // A new snapshot (contentHash change) invalidates prior expansions; clear them
  // so removed nodes don't linger. The first load (undefined → hash) is not a
  // change, so nothing is cleared then.
  const lastHashRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const h = meta?.contentHash ?? undefined;
    if (lastHashRef.current !== undefined && h !== lastHashRef.current) {
      setExpNodes(new Map());
      setExpEdges(new Map());
    }
    lastHashRef.current = h;
  }, [meta?.contentHash]);

  // Poll the freshness endpoint ONLY while a sync is running, so the view is
  // otherwise quiet; when the running sync clears, pull the fresh overview once.
  const { data: syncStatus } = useGetGraphSyncStatus({
    query: {
      queryKey: getGetGraphSyncStatusQueryKey(),
      // Keep polling while EITHER the cached overview or the latest freshness
      // read says a sync is running. The function form reads the live query
      // data, so a sync started elsewhere (409 "already running") also keeps the
      // poll alive until it clears — not just syncs kicked off from this view.
      refetchInterval: (query) =>
        overviewSyncing || (query.state.data?.meta.syncing ?? false)
          ? 2500
          : false,
    },
  });
  const statusSyncing = syncStatus?.meta.syncing ?? false;

  const wasSyncing = useRef(false);
  useEffect(() => {
    if (wasSyncing.current && !statusSyncing) {
      queryClient.invalidateQueries({ queryKey: getGetGraphOverviewQueryKey() });
    }
    wasSyncing.current = statusSyncing;
  }, [statusSyncing, queryClient]);

  const sync = useSyncGraph({
    mutation: {
      onSuccess: (res) => {
        queryClient.invalidateQueries({ queryKey: getGetGraphOverviewQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetGraphSyncStatusQueryKey() });
        toast({
          title: res.changed ? "Werkruimte gesynchroniseerd" : "Al up-to-date",
          description: res.note ?? undefined,
        });
      },
      onError: (err) => {
        // 409 = a sync is already running. That's information, not an error.
        const status = (err as { status?: number } | null)?.status;
        if (status === 409) {
          toast({
            title: "Synchronisatie loopt al",
            description: "Even geduld — de vorige sync is nog bezig.",
          });
          queryClient.invalidateQueries({ queryKey: getGetGraphSyncStatusQueryKey() });
          return;
        }
        toast({
          variant: "destructive",
          title: "Synchroniseren mislukt",
          description: "Er ging iets mis bij het ophalen van de werkruimte.",
        });
      },
    },
  });

  const isSyncing = overviewSyncing || statusSyncing || sync.isPending;
  const state: GraphViewState = deriveGraphState({
    isLoading,
    isError,
    hasNodes: (overview?.nodes.length ?? 0) > 0,
    metaStatus: meta?.status,
  });

  // §7.6 status banners — only meaningful once a graph is on screen.
  const showTruncated = state === "ready" && (overview?.truncated ?? false);
  const showStale =
    state === "ready" && !isSyncing && isStale(meta?.lastSyncedAt);

  const triggerSync = () => {
    if (isSyncing) return;
    sync.mutate();
  };

  return (
    <div className="wg-canvas fixed inset-0 bg-background text-foreground overflow-hidden">
      {/* Top-left masthead. The centred TabNav floats above (z-50); this sits
          just below it and never covers the centre. */}
      <header className="absolute top-3 sm:top-5 left-3 sm:left-5 z-40 flex items-center gap-2.5 pointer-events-none">
        <div className="flex items-center gap-2 bg-card/80 backdrop-blur-sm border border-border px-3 py-2 pointer-events-auto">
          <Network className="w-4 h-4 text-[hsl(var(--wg-structure))]" />
          <div className="leading-tight">
            <div className="font-['Space_Mono'] text-[11px] uppercase tracking-widest text-foreground">
              Werkruimte
            </div>
            {meta?.lastSyncedAt && (
              <div className="font-['Space_Mono'] text-[9px] uppercase tracking-wider text-muted-foreground">
                gesynct {relativeTime(meta.lastSyncedAt)}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Top-right sync control. Single-tenant: the logged-in user is the owner. */}
      <div className="absolute top-3 sm:top-5 right-3 sm:right-5 z-40">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={triggerSync}
          disabled={isSyncing}
          className="gap-2 font-['Space_Mono'] text-[11px] uppercase tracking-widest"
          data-testid="button-graph-sync"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">
            {isSyncing ? "Synchroniseren…" : "Synchroniseren"}
          </span>
        </Button>
      </div>

      {/* Status banners — centred below the floating TabNav (z-50). */}
      {(showTruncated || showStale) && (
        <div className="absolute top-16 sm:top-[4.5rem] left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 pointer-events-none">
          {showTruncated && (
            <div
              className="flex items-center gap-2 bg-card/90 backdrop-blur-sm border border-border px-3 py-1.5 text-[11px] font-['Space_Mono'] uppercase tracking-wide text-muted-foreground"
              data-testid="banner-truncated"
            >
              <Network className="w-3.5 h-3.5 text-[hsl(var(--wg-structure))]" />
              <span>
                Toont {overview?.nodes.length ?? 0} van {overview?.totalNodes ?? 0} knopen
              </span>
            </div>
          )}
          {showStale && (
            <div
              className="flex items-center gap-2 bg-[hsl(var(--wg-execution)/0.12)] border border-[hsl(var(--wg-execution)/0.35)] px-3 py-1.5 text-[11px] font-['Space_Mono'] uppercase tracking-wide text-[hsl(var(--wg-execution))]"
              data-testid="banner-stale"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>
                Snapshot &gt; 24 u oud
                {meta?.lastSyncedAt ? ` — ${relativeTime(meta.lastSyncedAt)}` : ""}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ---- States -------------------------------------------------------- */}
      {state === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <p className="font-['Space_Mono'] text-xs uppercase tracking-widest">
            Werkruimte laden…
          </p>
        </div>
      )}

      {state === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-sm w-full border border-border bg-card p-6 text-center">
            <AlertTriangle className="w-6 h-6 mx-auto text-destructive" />
            <h2 className="mt-3 font-['Playfair_Display'] text-lg">
              Werkruimte niet bereikbaar
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              De graaf kon niet geladen worden. Probeer het opnieuw.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4 gap-2"
              onClick={() => refetch()}
              data-testid="button-graph-retry"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Opnieuw proberen
            </Button>
          </div>
        </div>
      )}

      {state === "empty" && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <Empty className="max-w-md border border-border bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Sparkles />
              </EmptyMedia>
              <EmptyTitle>Nog geen werkruimte-snapshot</EmptyTitle>
              <EmptyDescription>
                Synchroniseer om de ClickUp-structuur, documenten, agents en live
                flows in één kaart te brengen. Dit leest alleen — er wordt niets
                gewijzigd.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                type="button"
                onClick={triggerSync}
                disabled={isSyncing}
                className="gap-2"
                data-testid="button-graph-sync-empty"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Synchroniseren…" : "Synchroniseren"}
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      )}

      {state === "ready" && overview && (
        <>
          <WorkspaceGraphCanvas
            nodes={viewNodes}
            edges={viewEdges}
            hiddenGroups={hiddenGroups}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            fitKey={meta?.contentHash ?? undefined}
            focusRequest={focusRequest}
          />
          <GraphLegend
            hiddenGroups={hiddenGroups}
            onToggleGroup={toggleGroup}
            onPick={handlePick}
          />
        </>
      )}

      <NodeDetailPanel
        node={selectedNode}
        onClose={() => setSelectedNodeId(null)}
        onSelectNode={setSelectedNodeId}
        onExpand={handleExpand}
      />
    </div>
  );
}
