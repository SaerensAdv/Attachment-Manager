import { useMemo } from "react";
import { ExternalLink, ArrowRight, ArrowLeft, Network } from "lucide-react";
import type { GraphNode, GraphEdge } from "@workspace/api-client-react";
import { useGetGraphNeighbors } from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  nodeColorVar,
  relativeTime,
  SOURCE_TYPE_ICON,
  SOURCE_TYPE_LABEL,
  SOURCE_LABEL,
  RELATION_LABEL,
} from "./graph-model";

export interface NodeDetailPanelProps {
  node: GraphNode | null;
  onClose: () => void;
  /** Re-centre the panel on a clicked neighbour. */
  onSelectNode: (id: string) => void;
  /** Bring the node's neighbourhood onto the canvas (wired in G5.7). */
  onExpand?: (data: { nodes: GraphNode[]; edges: GraphEdge[] }) => void;
}

interface NeighbourRow {
  edge: GraphEdge;
  other: GraphNode;
  outgoing: boolean;
}

function PanelBody({
  node,
  onSelectNode,
  onExpand,
}: {
  node: GraphNode;
  onSelectNode: (id: string) => void;
  onExpand?: NodeDetailPanelProps["onExpand"];
}) {
  const { data, isLoading } = useGetGraphNeighbors(node.id);

  const Icon = SOURCE_TYPE_ICON[node.sourceType];
  const color = nodeColorVar(node);

  const rows: NeighbourRow[] = useMemo(() => {
    if (!data) return [];
    const byId = new Map(data.nodes.map((n) => [n.id, n]));
    const out: NeighbourRow[] = [];
    for (const edge of data.edges) {
      const outgoing = edge.sourceId === node.id;
      const otherId = outgoing ? edge.targetId : edge.sourceId;
      const other = byId.get(otherId);
      if (!other) continue;
      out.push({ edge, other, outgoing });
    }
    // Live-flows first, then the rest — the data streams are the headline.
    return out.sort((a, b) => a.edge.relation.localeCompare(b.edge.relation));
  }, [data, node.id]);

  const metaEntries = useMemo(() => {
    const m = node.metadata as Record<string, unknown> | undefined;
    if (!m) return [];
    return Object.entries(m)
      .filter(
        ([, v]) =>
          (typeof v === "string" && v.length > 0) || typeof v === "number",
      )
      .slice(0, 8) as [string, string | number][];
  }, [node.metadata]);

  return (
    <div className="flex flex-col gap-5 px-1">
      {/* Identity */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className="gap-1.5 font-['Space_Mono'] text-[10px] uppercase tracking-wider"
          style={{ borderColor: color, color }}
        >
          <Icon className="w-3 h-3" />
          {SOURCE_TYPE_LABEL[node.sourceType]}
        </Badge>
        <Badge
          variant="secondary"
          className="font-['Space_Mono'] text-[10px] uppercase tracking-wider"
        >
          {SOURCE_LABEL[node.source]}
        </Badge>
        {node.status && (
          <Badge
            variant="outline"
            className="font-['Space_Mono'] text-[10px] uppercase tracking-wider"
          >
            {node.status}
          </Badge>
        )}
      </div>

      {/* Meta line */}
      <div className="text-xs text-muted-foreground font-['Space_Mono']">
        {node.updatedAt
          ? `Bijgewerkt ${relativeTime(node.updatedAt)}`
          : "Geen wijzigingsdatum"}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {node.url && (
          <Button asChild variant="outline" size="sm" className="gap-2">
            <a href={node.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5" />
              Openen in bron
            </a>
          </Button>
        )}
        {onExpand && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={isLoading || !data}
            onClick={() =>
              data && onExpand({ nodes: [...data.nodes], edges: [...data.edges] })
            }
            data-testid="button-expand-neighbours"
          >
            <Network className="w-3.5 h-3.5" />
            Toon buren op de kaart
          </Button>
        )}
      </div>

      {/* Metadata */}
      {metaEntries.length > 0 && (
        <div className="border-t border-border pt-4">
          <h3 className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
            Details
          </h3>
          <dl className="grid grid-cols-1 gap-1.5">
            {metaEntries.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 text-xs">
                <dt className="text-muted-foreground truncate">{k}</dt>
                <dd className="text-foreground text-right break-all">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Relations */}
      <div className="border-t border-border pt-4">
        <h3 className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
          Relaties {data ? `(${rows.length})` : ""}
        </h3>
        {isLoading && (
          <p className="text-xs text-muted-foreground">Relaties laden…</p>
        )}
        {!isLoading && rows.length === 0 && (
          <p className="text-xs text-muted-foreground">Geen directe relaties.</p>
        )}
        <ul className="flex flex-col gap-1">
          {rows.map(({ edge, other, outgoing }) => {
            const OtherIcon = SOURCE_TYPE_ICON[other.sourceType];
            const otherColor = nodeColorVar(other);
            return (
              <li key={edge.id}>
                <button
                  type="button"
                  onClick={() => {
                    // Bring the neighbour (and its connecting edge) onto the
                    // canvas so the new selection is visible, then select it.
                    onExpand?.({ nodes: [other], edges: [edge] });
                    onSelectNode(other.id);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-foreground/5 border border-transparent hover:border-border transition-colors"
                  data-testid={`neighbour-${other.id}`}
                >
                  {outgoing ? (
                    <ArrowRight className="w-3 h-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <ArrowLeft className="w-3 h-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="font-['Space_Mono'] text-[9px] uppercase tracking-wider text-muted-foreground shrink-0 w-24 truncate">
                    {RELATION_LABEL[edge.relation]}
                  </span>
                  <OtherIcon
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: otherColor }}
                  />
                  <span className="text-xs truncate">{other.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// Sheet on desktop, Drawer on mobile (§7.6). The panel stays mounted so the
// neighbours query keeps its cache between selections; open state is driven by
// whether a node is selected. Escape / overlay click close it (Radix default).
export default function NodeDetailPanel({
  node,
  onClose,
  onSelectNode,
  onExpand,
}: NodeDetailPanelProps) {
  const isMobile = useIsMobile();
  const open = node != null;
  const title = node?.label ?? "";
  const subtitle = node ? SOURCE_TYPE_LABEL[node.sourceType] : "";

  const onOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="wg-canvas max-h-[85vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-['Playfair_Display'] text-xl break-words">
              {title}
            </DrawerTitle>
            <DrawerDescription className="sr-only">{subtitle}</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-8">
            {node && (
              <PanelBody
                node={node}
                onSelectNode={onSelectNode}
                onExpand={onExpand}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="wg-canvas w-full sm:max-w-md overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="font-['Playfair_Display'] text-2xl break-words pr-6">
            {title}
          </SheetTitle>
          <SheetDescription className="sr-only">{subtitle}</SheetDescription>
        </SheetHeader>
        <div className="mt-4">
          {node && (
            <PanelBody
              node={node}
              onSelectNode={onSelectNode}
              onExpand={onExpand}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
