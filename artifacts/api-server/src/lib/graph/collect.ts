import { randomUUID } from "node:crypto";
import { clientsTable, db, pool } from "@workspace/db";
import { getDocGraph } from "../docs";
import { loadClientDocs } from "../clients-store";
import { logger } from "../logger";
import {
  listDocPages,
  listDocs,
  listFolderlessLists,
  listFolders,
  listSpaces,
  listTasks,
  listWorkspaces,
} from "./clickup-structure";
import type { GraphBuildInput } from "./build";

/**
 * The live sync collector (Fase 3.5 G4). Reads every read-only source ClickUp
 * (structure + Docs), the committed repo agent/workflow/SOP doc-graph, the app's
 * clients, and the Replit→ClickUp push ledger and assembles the content-free
 * `GraphBuildInput` the pure builder consumes. It NEVER mutates anything.
 *
 * Partial-source policy (brief §7.5 "gedeeltelijke sync beschadigt de vorige
 * geldige snapshot niet"): the ClickUp workspace + spaces crawl is the required
 * structural backbone — if it fails, `ok` is false and the caller must NOT
 * activate (it keeps the prior snapshot). Everything else (a single list's
 * tasks, a doc's pages, docs, clients, push records) is best-effort: a failure
 * there is recorded in `errors` and simply yields fewer nodes, never an abort.
 */

export interface CollectResult {
  ok: boolean;
  input: GraphBuildInput;
  /** Newest updatedAt seen across sources (data freshness), or null. */
  sourceUpdatedAt: Date | null;
  /** Short, non-sensitive notes for skipped best-effort sources. */
  errors: string[];
}

const EMPTY_INPUT: GraphBuildInput = {
  workspace: null,
  spaces: [],
  tasksByList: [],
  docs: [],
  docGraph: { nodes: [], edges: [], categories: [] },
  clients: [],
  pushRecords: [],
};

export async function collectGraphInput(): Promise<CollectResult> {
  const correlationId = `graph-sync-${randomUUID()}`;
  const errors: string[] = [];
  let sourceMax = 0;
  const track = (iso: string | null | undefined): void => {
    if (!iso) return;
    const t = Date.parse(iso);
    if (Number.isFinite(t) && t > sourceMax) sourceMax = t;
  };

  // 1) Workspace (single-tenant: the first team the token can see) -----------
  const wsRes = await listWorkspaces(correlationId);
  if (!wsRes.ok || wsRes.data.length === 0) {
    const note = wsRes.ok ? "no_workspace" : `clickup:${wsRes.error.code}`;
    logger.warn({ scope: "graph:collect", note }, "workspace crawl failed — sync aborted");
    return { ok: false, input: EMPTY_INPUT, sourceUpdatedAt: null, errors: [note] };
  }
  const ws = wsRes.data[0];

  // 2) Spaces (required structural backbone) ---------------------------------
  const spRes = await listSpaces(ws.id, correlationId);
  if (!spRes.ok) {
    const note = `spaces:${spRes.error.code}`;
    logger.warn({ scope: "graph:collect", note }, "spaces crawl failed — sync aborted");
    return { ok: false, input: EMPTY_INPUT, sourceUpdatedAt: null, errors: [note] };
  }

  const spaces: GraphBuildInput["spaces"] = [];
  const listIds: string[] = [];
  for (const space of spRes.data) {
    const [foldersRes, flRes] = await Promise.all([
      listFolders(space.id, correlationId),
      listFolderlessLists(space.id, correlationId),
    ]);
    const folders = foldersRes.ok ? foldersRes.data : [];
    if (!foldersRes.ok) errors.push(`folders:${space.id}:${foldersRes.error.code}`);
    const folderlessLists = flRes.ok ? flRes.data : [];
    if (!flRes.ok) errors.push(`lists:${space.id}:${flRes.error.code}`);
    spaces.push({ space, folders, folderlessLists });
    for (const f of folders) for (const l of f.lists) listIds.push(l.id);
    for (const l of folderlessLists) listIds.push(l.id);
  }

  // 3) Active tasks per list (best-effort per list) --------------------------
  const tasksByList: GraphBuildInput["tasksByList"] = [];
  for (const listId of listIds) {
    const tRes = await listTasks(listId, correlationId);
    if (!tRes.ok) {
      errors.push(`tasks:${listId}:${tRes.error.code}`);
      continue;
    }
    for (const t of tRes.data) track(t.updatedAt);
    tasksByList.push({ listId, tasks: tRes.data });
  }

  // 4) Docs + their page trees (best-effort) ---------------------------------
  const docs: GraphBuildInput["docs"] = [];
  const docsRes = await listDocs(ws.id, correlationId);
  if (!docsRes.ok) {
    errors.push(`docs:${docsRes.error.code}`);
  } else {
    for (const doc of docsRes.data) {
      track(doc.updatedAt);
      const pagesRes = await listDocPages(ws.id, doc.id, correlationId);
      if (!pagesRes.ok) errors.push(`pages:${doc.id}:${pagesRes.error.code}`);
      docs.push({ doc, pages: pagesRes.ok ? pagesRes.data : [] });
    }
  }

  // 5) Repo agent/workflow/SOP doc-graph (folded in by the builder) ----------
  const docGraph = getDocGraph(await loadClientDocs());

  // 6) App clients (DB) ------------------------------------------------------
  let clients: GraphBuildInput["clients"] = [];
  try {
    const rows = await db
      .select({
        id: clientsTable.id,
        name: clientsTable.name,
        clickupCompanyId: clientsTable.clickupCompanyId,
        updatedAt: clientsTable.updatedAt,
      })
      .from(clientsTable);
    clients = rows.map((c) => {
      track(c.updatedAt instanceof Date ? c.updatedAt.toISOString() : null);
      return { id: c.id, name: c.name, clickupCompanyId: c.clickupCompanyId ?? null };
    });
  } catch (err) {
    errors.push("clients:db");
    logger.warn(
      { scope: "graph:collect", err: err instanceof Error ? err.message : String(err) },
      "clients crawl failed (best-effort)",
    );
  }

  // 7) Live flows: Replit -> ClickUp push ledger (best-effort) ---------------
  let pushRecords: GraphBuildInput["pushRecords"] = [];
  try {
    const res = await pool.query(
      `SELECT source_run_id, clickup_object_id, clickup_url, kind, status, updated_at
         FROM clickup_push_records
        WHERE clickup_object_id IS NOT NULL`,
    );
    pushRecords = res.rows.map((r: Record<string, unknown>) => {
      const updatedAt =
        r.updated_at == null
          ? null
          : r.updated_at instanceof Date
            ? r.updated_at.toISOString()
            : new Date(String(r.updated_at)).toISOString();
      track(updatedAt);
      return {
        sourceRunId: r.source_run_id == null ? null : String(r.source_run_id),
        clickupObjectId: r.clickup_object_id == null ? null : String(r.clickup_object_id),
        clickupUrl: r.clickup_url == null ? null : String(r.clickup_url),
        kind: String(r.kind ?? ""),
        status: String(r.status ?? ""),
        updatedAt,
      };
    });
  } catch (err) {
    // Table may not exist yet on a fresh DB — that's fine, just no live flows.
    errors.push("push:db");
    logger.warn(
      { scope: "graph:collect", err: err instanceof Error ? err.message : String(err) },
      "push ledger crawl failed (best-effort)",
    );
  }

  return {
    ok: true,
    input: { workspace: { id: ws.id, name: ws.name }, spaces, tasksByList, docs, docGraph, clients, pushRecords },
    sourceUpdatedAt: sourceMax > 0 ? new Date(sourceMax) : null,
    errors,
  };
}
