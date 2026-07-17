/**
 * Pure Workspace Graph builder (Fase 3.5 G2, brief §7.3/§7.4).
 *
 * Takes ALREADY-FETCHED, content-free source data and composes the single
 * normalized graph. It is deliberately pure (no fetch, no DB) so the
 * provable-edge logic is unit-tested with fixtures; the live collection wiring
 * (calling the ClickUp readers + DB) lives in the sync layer (G3/G4).
 *
 * Edge policy (brief §7.4 — PROVABLE ONLY, never invented):
 *  - `contains`   : structural hierarchy ONLY (ClickUp workspace→space→folder→
 *                   list→task, workspace→doc→page tree).
 *  - `references` : repo doc-graph reference/mention/flow passes (parsed from
 *                   committed files = code configuration).
 *  - `executes`   : repo doc-graph routing pass (orchestrator routing table).
 *  - `related_to` : app client ↔ its ClickUp company task, via the stored
 *                   `clickupCompanyId` back-reference (an explicit mapping).
 *  - `generated`  : a Replit run → the ClickUp task it produced (push record).
 *  - `writes_to`  : the Replit→ClickUp push integration → the tasks it writes.
 * No name-similarity, LLM or guessed edges. Unknown/deleted parents keep the
 * node as an orphan (never dropped, brief §7.9).
 */
import type { DocGraph } from "../docs";
import type {
  CuDoc,
  CuDocPage,
  CuFolder,
  CuList,
  CuSpace,
  CuTask,
} from "./clickup-structure";
import {
  ALLOWED_METADATA_KEYS,
  edgeId,
  nsId,
  type Graph,
  type GraphDirection,
  type GraphEdge,
  type GraphNode,
  type GraphRelation,
  type GraphSource,
  type GraphSourceType,
} from "./types";

/** Content-free client projection the builder needs (never the whole row). */
export interface GraphClientInput {
  id: number;
  name: string;
  clickupCompanyId: string | null;
}

/** Content-free push-record projection the builder needs. */
export interface GraphPushInput {
  sourceRunId: string | null;
  clickupObjectId: string | null;
  clickupUrl: string | null;
  kind: string;
  status: string;
  updatedAt: string | null;
}

export interface GraphBuildInput {
  workspace: { id: string; name: string } | null;
  spaces: Array<{
    space: CuSpace;
    folders: CuFolder[];
    folderlessLists: CuList[];
  }>;
  /** Tasks keyed by the list they belong to. */
  tasksByList: Array<{ listId: string; tasks: CuTask[] }>;
  docs: Array<{ doc: CuDoc; pages: CuDocPage[] }>;
  /** The repo agent/workflow/knowledge graph (folded in, namespaced). */
  docGraph: DocGraph;
  clients: GraphClientInput[];
  pushRecords: GraphPushInput[];
}

const CLICKUP_TASK_URL = (id: string) => `https://app.clickup.com/t/${id}`;
const PUSH_INTEGRATION_ID = nsId("replit", "integration", "clickup-push");

/** Map a repo doc category to its normalized (source, sourceType, path prefix). */
const DOC_CATEGORY_MAP: Record<
  string,
  { sourceType: GraphSourceType; prefix: string }
> = {
  agent: { sourceType: "agent", prefix: "agents/" },
  workflow: { sourceType: "workflow", prefix: "workflows/" },
  knowledge: { sourceType: "sop", prefix: "knowledge/" },
};

/** Repo doc-edge kind → provable normalized relation. */
function docRelation(kind: string): GraphRelation {
  return kind === "routing" ? "executes" : "references";
}

function docSlug(path: string, prefix: string): string {
  let s = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  if (s.endsWith(".md")) s = s.slice(0, -3);
  return s;
}

/** Drop any metadata key outside the allowlist — belt-and-braces on top of the
 *  fact that we only ever set allowed keys (brief §7.4/§7.9 denylist). */
function safeMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (ALLOWED_METADATA_KEYS.has(k) && v !== undefined) out[k] = v;
  }
  return out;
}

export function buildGraph(input: GraphBuildInput): Graph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  /** Add a node; a real node upgrades a previously-added orphan placeholder. */
  function addNode(node: GraphNode): GraphNode {
    node.metadata = safeMetadata(node.metadata);
    const existing = nodes.get(node.id);
    if (existing) {
      if (existing.metadata.orphan && !node.metadata.orphan) {
        nodes.set(node.id, node); // upgrade orphan -> real
        return node;
      }
      return existing; // first real wins
    }
    nodes.set(node.id, node);
    return node;
  }

  function addEdge(
    relation: GraphRelation,
    sourceId: string,
    targetId: string,
    opts: { direction: GraphDirection; active?: boolean; weight?: number } = {
      direction: "directed",
    },
  ): void {
    if (sourceId === targetId) return; // no self-loops (cycle guard)
    const id = edgeId(relation, sourceId, targetId);
    const existing = edges.get(id);
    if (existing) {
      if (opts.weight) existing.weight = (existing.weight ?? 0) + opts.weight;
      // A single failing flow keeps the pair marked unhealthy.
      if (opts.active === false) existing.active = false;
      return;
    }
    const edge: GraphEdge = {
      id,
      sourceId,
      targetId,
      relation,
      direction: opts.direction,
    };
    if (opts.active !== undefined) edge.active = opts.active;
    if (opts.weight !== undefined) edge.weight = opts.weight;
    edges.set(id, edge);
  }

  /** Emit a structural contains edge + parentId, keeping the child as an orphan
   *  when its parent was not crawled (never drop it — brief §7.9). */
  function contain(parentId: string | null, child: GraphNode): void {
    if (parentId && nodes.has(parentId)) {
      child.parentId = parentId;
      addEdge("contains", parentId, child.id, { direction: "directed" });
    } else if (parentId) {
      child.metadata = safeMetadata({ ...child.metadata, orphan: true });
    }
  }

  const cuNode = (
    sourceType: GraphSourceType,
    rawId: string,
    label: string,
    extra: Partial<GraphNode> = {},
  ): GraphNode =>
    addNode({
      id: nsId("clickup", sourceType, rawId),
      source: "clickup",
      sourceType,
      label,
      metadata: {},
      ...extra,
    });

  // 1) ClickUp structural hierarchy -----------------------------------------
  if (input.workspace) {
    const ws = cuNode("workspace", input.workspace.id, input.workspace.name);
    for (const { space, folders, folderlessLists } of input.spaces) {
      const sp = cuNode("space", space.id, space.name);
      contain(ws.id, sp);
      for (const folder of folders) {
        const fo = cuNode("folder", folder.id, folder.name);
        contain(sp.id, fo);
        for (const list of folder.lists) {
          const li = cuNode("list", list.id, list.name, {
            metadata: { taskCount: list.taskCount ?? undefined },
          });
          contain(fo.id, li);
        }
      }
      for (const list of folderlessLists) {
        const li = cuNode("list", list.id, list.name, {
          metadata: { taskCount: list.taskCount ?? undefined },
        });
        contain(sp.id, li);
      }
    }
    // Docs live at the workspace level (brief lists Docs + Pages as first-class).
    for (const { doc, pages } of input.docs) {
      const dn = cuNode("doc", doc.id, doc.name, {
        url: `https://app.clickup.com/${input.workspace.id}/docs/${doc.id}`,
        updatedAt: doc.updatedAt ?? undefined,
      });
      contain(ws.id, dn);
      const seen = new Set<string>();
      const walkPages = (parentId: string, list: CuDocPage[]): void => {
        for (const p of list) {
          if (seen.has(p.id)) continue; // page cycle/dup guard
          seen.add(p.id);
          const pn = cuNode("page", p.id, p.name);
          contain(parentId, pn);
          if (p.children.length) walkPages(pn.id, p.children);
        }
      };
      walkPages(dn.id, pages);
    }
  }

  // Tasks (added after their lists so contains parents resolve) --------------
  for (const { listId, tasks } of input.tasksByList) {
    const listNodeId = nsId("clickup", "list", listId);
    for (const t of tasks) {
      const tn = cuNode("task", t.id, t.name, {
        url: t.url ?? CLICKUP_TASK_URL(t.id),
        status: t.status ?? undefined,
        updatedAt: t.updatedAt ?? undefined,
        metadata: { closed: t.closed },
      });
      contain(listNodeId, tn);
    }
  }

  // 2) Repo agents / workflows / SOPs (folded in, namespaced) ----------------
  const docIdToGraphId = new Map<string, string>();
  for (const dn of input.docGraph.nodes) {
    const map = DOC_CATEGORY_MAP[dn.category];
    if (!map) continue; // templates / core / client are out of scope for v1
    const slug = docSlug(dn.path, map.prefix);
    const gid = nsId("github", map.sourceType, slug);
    docIdToGraphId.set(dn.id, gid);
    addNode({
      id: gid,
      source: "github",
      sourceType: map.sourceType,
      label: dn.title,
      metadata: {
        category: dn.category,
        active: dn.active,
        ...(dn.fanout ? { fanout: dn.fanout } : {}),
      },
    });
  }
  for (const de of input.docGraph.edges) {
    const s = docIdToGraphId.get(de.source);
    const t = docIdToGraphId.get(de.target);
    if (!s || !t) continue; // edge to an out-of-scope node: drop (not a hierarchy orphan)
    addEdge(docRelation(de.kind), s, t, { direction: "directed" });
  }

  // 3) App clients ↔ their ClickUp company (explicit clickupCompanyId link) ---
  for (const c of input.clients) {
    const cn = addNode({
      id: nsId("replit", "client", String(c.id)),
      source: "replit",
      sourceType: "client",
      label: c.name,
      metadata: {},
    });
    const companyId = (c.clickupCompanyId ?? "").trim();
    if (!companyId) continue;
    const companyNodeId = nsId("clickup", "task", companyId);
    if (!nodes.has(companyNodeId)) {
      // Company task not in the crawled slice — keep as a findable orphan.
      cuNode("task", companyId, "CRM-bedrijf", {
        url: CLICKUP_TASK_URL(companyId),
        metadata: { orphan: true },
      });
    }
    addEdge("related_to", cn.id, companyNodeId, { direction: "undirected" });
  }

  // 4) Live flows: Replit→ClickUp push records (generated / writes_to) --------
  for (const p of input.pushRecords) {
    const objId = (p.clickupObjectId ?? "").trim();
    if (!objId) continue; // no created object yet -> nothing provable to draw
    const taskNodeId = nsId("clickup", "task", objId);
    if (!nodes.has(taskNodeId)) {
      cuNode("task", objId, `Push: ${p.kind}`, {
        url: p.clickupUrl ?? CLICKUP_TASK_URL(objId),
        metadata: { orphan: true, kind: p.kind },
      });
    }
    const healthy = p.status !== "failed";
    if (!nodes.has(PUSH_INTEGRATION_ID)) {
      addNode({
        id: PUSH_INTEGRATION_ID,
        source: "replit",
        sourceType: "integration",
        label: "Replit → ClickUp push",
        metadata: {},
      });
    }
    addEdge("writes_to", PUSH_INTEGRATION_ID, taskNodeId, {
      direction: "directed",
      active: healthy,
      weight: 1,
    });
    const runId = (p.sourceRunId ?? "").trim();
    if (runId) {
      const rn = addNode({
        id: nsId("replit", "run", runId),
        source: "replit",
        sourceType: "run",
        label: `Run ${runId.slice(0, 8)}`,
        status: p.status,
        updatedAt: p.updatedAt ?? undefined,
        metadata: { kind: p.kind },
      });
      addEdge("generated", rn.id, taskNodeId, {
        direction: "directed",
        active: healthy,
      });
    }
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
