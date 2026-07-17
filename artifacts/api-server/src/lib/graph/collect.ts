import { randomUUID } from "node:crypto";
import { clientsTable, db, pool } from "@workspace/db";
import { getDocGraph } from "../docs";
import { loadClientDocs } from "../clients-store";
import { logger } from "../logger";
import { listDocPages, listDocs, listFolderlessLists, listFolders, listSpaces, listTasks, listWorkspaces } from "./clickup-structure";
import type { GraphBuildInput } from "./build";
import { allowsList, allowsSpace, boundPageTree, boundTasksByList, emptyCollectionReport, readGraphCollectionPolicy, selectDocs, selectWorkspace, type GraphCollectionReport } from "./collection-policy";

export interface CollectResult { ok: boolean; input: GraphBuildInput; sourceUpdatedAt: Date | null; errors: string[]; report: GraphCollectionReport }
const EMPTY_INPUT: GraphBuildInput = { workspace: null, spaces: [], tasksByList: [], docs: [], docGraph: { nodes: [], edges: [], categories: [] }, clients: [], pushRecords: [] };

export async function collectGraphInput(): Promise<CollectResult> {
  const correlationId = `graph-sync-${randomUUID()}`;
  const errors: string[] = [];
  const report = emptyCollectionReport();
  const policy = readGraphCollectionPolicy();
  let sourceMax = 0;
  const track = (iso: string | null | undefined): void => { if (!iso) return; const time = Date.parse(iso); if (Number.isFinite(time) && time > sourceMax) sourceMax = time; };
  const fail = (note: string): CollectResult => ({ ok: false, input: EMPTY_INPUT, sourceUpdatedAt: null, errors: [note], report });

  const wsRes = await listWorkspaces(correlationId);
  report.workspaces.discovered = wsRes.ok ? wsRes.data.length : 0;
  const ws = wsRes.ok ? selectWorkspace(wsRes.data, policy) : null;
  if (!ws) {
    const note = wsRes.ok ? (policy.workspaceId ? "workspace:not_allowed_or_missing" : "no_workspace") : `clickup:${wsRes.error.code}`;
    logger.warn({ scope: "graph:collect", note }, "workspace crawl failed, sync aborted");
    return fail(note);
  }
  report.workspaces.included = 1;
  report.workspaces.excluded = Math.max(0, report.workspaces.discovered - 1);

  const spRes = await listSpaces(ws.id, correlationId);
  if (!spRes.ok) { const note = `spaces:${spRes.error.code}`; logger.warn({ scope: "graph:collect", note }, "spaces crawl failed, sync aborted"); return fail(note); }
  report.spaces.discovered = spRes.data.length;
  const allowedSpaces = spRes.data.filter((space) => allowsSpace(space.id, policy));
  report.spaces.excluded = spRes.data.length - allowedSpaces.length;

  const spaces: GraphBuildInput["spaces"] = [];
  const listIds: string[] = [];
  for (const space of allowedSpaces) {
    const [foldersRes, folderlessRes] = await Promise.all([listFolders(space.id, correlationId), listFolderlessLists(space.id, correlationId)]);
    const rawFolders = foldersRes.ok ? foldersRes.data : [];
    const rawFolderless = folderlessRes.ok ? folderlessRes.data : [];
    if (!foldersRes.ok) errors.push(`folders:${space.id}:${foldersRes.error.code}`);
    if (!folderlessRes.ok) errors.push(`lists:${space.id}:${folderlessRes.error.code}`);
    const discoveredLists = rawFolders.reduce((sum, folder) => sum + folder.lists.length, 0) + rawFolderless.length;
    report.lists.discovered += discoveredLists;
    const folders = rawFolders.map((folder) => ({ ...folder, lists: folder.lists.filter((list) => allowsList(list.id, policy)) })).filter((folder) => !policy.allowedListIds || folder.lists.length > 0);
    const folderlessLists = rawFolderless.filter((list) => allowsList(list.id, policy));
    const includedLists = folders.reduce((sum, folder) => sum + folder.lists.length, 0) + folderlessLists.length;
    report.lists.included += includedLists;
    report.lists.excluded += discoveredLists - includedLists;
    if (!policy.allowedListIds || includedLists > 0) {
      spaces.push({ space, folders, folderlessLists });
      report.spaces.included += 1;
    } else {
      report.spaces.excluded += 1;
    }
    for (const folder of folders) for (const list of folder.lists) listIds.push(list.id);
    for (const list of folderlessLists) listIds.push(list.id);
  }

  const taskCandidates: GraphBuildInput["tasksByList"] = [];
  for (const listId of listIds) {
    const result = await listTasks(listId, correlationId);
    if (!result.ok) { errors.push(`tasks:${listId}:${result.error.code}`); continue; }
    taskCandidates.push({ listId, tasks: result.data });
  }
  const boundedTasks = boundTasksByList(taskCandidates, policy);
  report.tasks = boundedTasks.counts;
  for (const group of boundedTasks.tasksByList) for (const task of group.tasks) track(task.updatedAt);

  const docs: GraphBuildInput["docs"] = [];
  const docsRes = await listDocs(ws.id, correlationId);
  if (!docsRes.ok) errors.push(`docs:${docsRes.error.code}`);
  else {
    report.docs.discovered = docsRes.data.length;
    const chosen = selectDocs(docsRes.data, policy);
    report.docs.included = chosen.docs.length;
    report.docs.excluded = chosen.excluded;
    let pageBudget = policy.maxPagesTotal;
    for (const doc of chosen.docs) {
      track(doc.updatedAt);
      if (pageBudget === 0) { docs.push({ doc, pages: [] }); continue; }
      const pagesRes = await listDocPages(ws.id, doc.id, correlationId);
      if (!pagesRes.ok) { errors.push(`pages:${doc.id}:${pagesRes.error.code}`); docs.push({ doc, pages: [] }); continue; }
      const bounded = boundPageTree(pagesRes.data, Math.min(policy.maxPagesPerDoc, pageBudget));
      report.pages.discovered += bounded.discovered;
      report.pages.included += bounded.included;
      report.pages.excluded += bounded.excluded;
      pageBudget = Math.max(0, pageBudget - bounded.included);
      docs.push({ doc, pages: bounded.pages });
    }
  }

  // Paused/deprecated agents remain in GitHub as configuration history but are
  // not imported into the operational graph. Other repo categories retain the
  // existing builder rules.
  const fullDocGraph = getDocGraph(await loadClientDocs());
  const docNodes = fullDocGraph.nodes.filter((node) => node.category !== "agent" || node.active !== false);
  const docIds = new Set(docNodes.map((node) => node.id));
  const docGraph = { ...fullDocGraph, nodes: docNodes, edges: fullDocGraph.edges.filter((edge) => docIds.has(edge.source) && docIds.has(edge.target)) };

  let clients: GraphBuildInput["clients"] = [];
  try {
    const rows = await db.select({ id: clientsTable.id, name: clientsTable.name, clickupCompanyId: clientsTable.clickupCompanyId, updatedAt: clientsTable.updatedAt }).from(clientsTable);
    clients = rows.map((client) => { track(client.updatedAt instanceof Date ? client.updatedAt.toISOString() : null); return { id: client.id, name: client.name, clickupCompanyId: client.clickupCompanyId ?? null }; });
    report.clients.included = clients.length;
  } catch (error) { errors.push("clients:db"); logger.warn({ scope: "graph:collect", err: error instanceof Error ? error.message : String(error) }, "clients crawl failed (best-effort)"); }

  let pushRecords: GraphBuildInput["pushRecords"] = [];
  try {
    const countResult = await pool.query(`SELECT count(*)::int count FROM clickup_push_records WHERE clickup_object_id IS NOT NULL`);
    report.pushRecords.discovered = Number(countResult.rows[0]?.count ?? 0);
    const result = await pool.query(`SELECT source_run_id, clickup_object_id, clickup_url, kind, status, updated_at FROM clickup_push_records WHERE clickup_object_id IS NOT NULL ORDER BY updated_at DESC LIMIT $1`, [policy.maxPushRecords]);
    pushRecords = result.rows.map((row: Record<string, unknown>) => {
      const updatedAt = row.updated_at == null ? null : row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(String(row.updated_at)).toISOString();
      track(updatedAt);
      return { sourceRunId: row.source_run_id == null ? null : String(row.source_run_id), clickupObjectId: row.clickup_object_id == null ? null : String(row.clickup_object_id), clickupUrl: row.clickup_url == null ? null : String(row.clickup_url), kind: String(row.kind ?? ""), status: String(row.status ?? ""), updatedAt };
    });
    report.pushRecords.included = pushRecords.length;
    report.pushRecords.excluded = Math.max(0, report.pushRecords.discovered - pushRecords.length);
  } catch (error) { errors.push("push:db"); logger.warn({ scope: "graph:collect", err: error instanceof Error ? error.message : String(error) }, "push ledger crawl failed (best-effort)"); }

  logger.info({ scope: "graph:collect", policy: { workspaceId: policy.workspaceId, spaceAllowlist: policy.allowedSpaceIds?.size ?? 0, listAllowlist: policy.allowedListIds?.size ?? 0, docAllowlist: policy.allowedDocIds?.size ?? 0, taskLookbackDays: policy.taskLookbackDays, maxTasksPerList: policy.maxTasksPerList, maxTasksTotal: policy.maxTasksTotal, maxDocs: policy.maxDocs, maxPagesTotal: policy.maxPagesTotal, maxPushRecords: policy.maxPushRecords }, report }, "bounded graph collection completed");

  return { ok: true, input: { workspace: { id: ws.id, name: ws.name }, spaces, tasksByList: boundedTasks.tasksByList, docs, docGraph, clients, pushRecords }, sourceUpdatedAt: sourceMax > 0 ? new Date(sourceMax) : null, errors, report };
}
