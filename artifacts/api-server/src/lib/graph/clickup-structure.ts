/**
 * Read-only ClickUp WORKSPACE STRUCTURE reader for the Workspace Graph (Fase 3.5).
 *
 * Distinct from the Fase-2 `../clickup.ts` seam (which reads only the Companies
 * list) — that provider stays untouched. This module reads the full navigable
 * hierarchy the graph needs: workspaces -> spaces -> folders -> lists -> tasks,
 * plus Docs and their page tree. It reuses the robust `clickUpRequest` core
 * (retries, backoff, Retry-After, timeouts, correlation id, no-secrets logging).
 *
 * Everything here is READ-ONLY. It returns typed, MINIMAL structural objects
 * (ids, names, statuses, urls, updatedAt) — never descriptions or custom-field
 * values — so the builder can compose the graph without leaking content. Each
 * function returns a typed `ClickUpResult` so the builder can decide, per source,
 * whether a partial failure should abort the sync (and keep the prior snapshot).
 */
import { clickUpRequest } from "../clickup/client";
import type { ClickUpResult } from "../clickup/errors";

/** ClickUp Docs live on the v3 API; the rest of the hierarchy is v2. */
export const CLICKUP_API_V3 = "https://api.clickup.com/api/v3";

// ---- Normalized structural shapes (minimal, content-free) ------------------

export interface CuWorkspace {
  id: string;
  name: string;
}
export interface CuSpace {
  id: string;
  name: string;
}
export interface CuList {
  id: string;
  name: string;
  /** Folder that owns this list, when it came from a folder (not folderless). */
  folderId: string | null;
  taskCount: number | null;
}
export interface CuFolder {
  id: string;
  name: string;
  /** Lists ClickUp inlines on the folder payload (already normalized). */
  lists: CuList[];
}
export interface CuTask {
  id: string;
  name: string;
  status: string | null;
  url: string | null;
  updatedAt: string | null;
  /** True when the task is in a "closed"/"done" status type. */
  closed: boolean;
}
export interface CuDoc {
  id: string;
  name: string;
  updatedAt: string | null;
}
export interface CuDocPage {
  id: string;
  name: string;
  children: CuDocPage[];
}

// ---- Raw provider payload shapes (typed — no `any` at the boundary) ---------

interface RawList {
  id?: string;
  name?: string;
  task_count?: number | null;
}
interface RawFolder {
  id?: string;
  name?: string;
  lists?: RawList[];
}
interface RawTask {
  id?: string;
  name?: string;
  status?: { status?: string; type?: string } | null;
  url?: string;
  date_updated?: string | number | null;
}
interface RawDoc {
  id?: string;
  name?: string;
  date_updated?: string | number | null;
}
interface RawDocPage {
  id?: string;
  name?: string;
  pages?: RawDocPage[];
}

const TASK_PAGE_CAP = 20;
const DOC_PAGE_CAP = 20;

/** ClickUp `date_updated` is epoch-ms (string|number); normalize to ISO or null. */
function epochToIso(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const ms = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normList(l: RawList, folderId: string | null): CuList | null {
  const id = (l.id ?? "").trim();
  const name = (l.name ?? "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    folderId,
    taskCount: typeof l.task_count === "number" ? l.task_count : null,
  };
}

// ---- Readers (v2 hierarchy) ------------------------------------------------

/** GET /team — the workspaces (teams) the token can see. */
export async function listWorkspaces(
  correlationId: string,
): Promise<ClickUpResult<CuWorkspace[]>> {
  const res = await clickUpRequest<{ teams?: { id?: string; name?: string }[] }>(
    "/team",
    { correlationId },
  );
  if (!res.ok) return res;
  const teams = Array.isArray(res.data?.teams) ? res.data.teams : [];
  const out: CuWorkspace[] = [];
  for (const t of teams) {
    const id = (t.id ?? "").trim();
    const name = (t.name ?? "").trim();
    if (id && name) out.push({ id, name });
  }
  return { ok: true, status: res.status, data: out };
}

/** GET /team/{id}/space — non-archived spaces in a workspace. */
export async function listSpaces(
  workspaceId: string,
  correlationId: string,
): Promise<ClickUpResult<CuSpace[]>> {
  const res = await clickUpRequest<{ spaces?: { id?: string; name?: string }[] }>(
    `/team/${workspaceId}/space`,
    { correlationId, query: { archived: false } },
  );
  if (!res.ok) return res;
  const spaces = Array.isArray(res.data?.spaces) ? res.data.spaces : [];
  const out: CuSpace[] = [];
  for (const s of spaces) {
    const id = (s.id ?? "").trim();
    const name = (s.name ?? "").trim();
    if (id && name) out.push({ id, name });
  }
  return { ok: true, status: res.status, data: out };
}

/** GET /space/{id}/folder — folders (with their inlined lists) in a space. */
export async function listFolders(
  spaceId: string,
  correlationId: string,
): Promise<ClickUpResult<CuFolder[]>> {
  const res = await clickUpRequest<{ folders?: RawFolder[] }>(
    `/space/${spaceId}/folder`,
    { correlationId, query: { archived: false } },
  );
  if (!res.ok) return res;
  const folders = Array.isArray(res.data?.folders) ? res.data.folders : [];
  const out: CuFolder[] = [];
  for (const f of folders) {
    const id = (f.id ?? "").trim();
    const name = (f.name ?? "").trim();
    if (!id || !name) continue;
    const lists = (Array.isArray(f.lists) ? f.lists : [])
      .map((l) => normList(l, id))
      .filter((l): l is CuList => l !== null);
    out.push({ id, name, lists });
  }
  return { ok: true, status: res.status, data: out };
}

/** GET /space/{id}/list — folderless lists that live directly under a space. */
export async function listFolderlessLists(
  spaceId: string,
  correlationId: string,
): Promise<ClickUpResult<CuList[]>> {
  const res = await clickUpRequest<{ lists?: RawList[] }>(
    `/space/${spaceId}/list`,
    { correlationId, query: { archived: false } },
  );
  if (!res.ok) return res;
  const lists = Array.isArray(res.data?.lists) ? res.data.lists : [];
  const out = lists
    .map((l) => normList(l, null))
    .filter((l): l is CuList => l !== null);
  return { ok: true, status: res.status, data: out };
}

/**
 * GET /list/{id}/task — active tasks in a list, paginated. By default excludes
 * closed tasks (§7.2: closed/archived/historical only via search/lazy-load).
 */
export async function listTasks(
  listId: string,
  correlationId: string,
  opts: { includeClosed?: boolean } = {},
): Promise<ClickUpResult<CuTask[]>> {
  const includeClosed = opts.includeClosed === true;
  const out: CuTask[] = [];
  for (let page = 0; page < TASK_PAGE_CAP; page++) {
    const res = await clickUpRequest<{ tasks?: RawTask[]; last_page?: boolean }>(
      `/list/${listId}/task`,
      {
        correlationId,
        query: {
          archived: false,
          include_closed: includeClosed,
          subtasks: false,
          page,
        },
      },
    );
    if (!res.ok) return res;
    const tasks = Array.isArray(res.data?.tasks) ? res.data.tasks : [];
    for (const t of tasks) {
      const id = (t.id ?? "").trim();
      const name = (t.name ?? "").trim();
      if (!id || !name) continue;
      out.push({
        id,
        name,
        status: t.status?.status?.trim() || null,
        url: typeof t.url === "string" && t.url.trim() ? t.url.trim() : null,
        updatedAt: epochToIso(t.date_updated),
        closed: (t.status?.type ?? "").toLowerCase() === "closed",
      });
    }
    if (res.data?.last_page === true || tasks.length === 0) break;
  }
  return { ok: true, status: 200, data: out };
}

// ---- Readers (v3 Docs) -----------------------------------------------------

/** GET /workspaces/{id}/docs (v3) — docs in a workspace, cursor-paginated. */
export async function listDocs(
  workspaceId: string,
  correlationId: string,
): Promise<ClickUpResult<CuDoc[]>> {
  const out: CuDoc[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < DOC_PAGE_CAP; page++) {
    const res = await clickUpRequest<{ docs?: RawDoc[]; next_cursor?: string }>(
      `/workspaces/${workspaceId}/docs`,
      {
        correlationId,
        apiBase: CLICKUP_API_V3,
        query: { next_cursor: cursor },
      },
    );
    if (!res.ok) return res;
    const docs = Array.isArray(res.data?.docs) ? res.data.docs : [];
    for (const d of docs) {
      const id = (d.id ?? "").trim();
      const name = (d.name ?? "").trim();
      if (!id || !name) continue;
      out.push({ id, name, updatedAt: epochToIso(d.date_updated) });
    }
    cursor =
      typeof res.data?.next_cursor === "string" && res.data.next_cursor.trim()
        ? res.data.next_cursor.trim()
        : undefined;
    if (!cursor || docs.length === 0) break;
  }
  return { ok: true, status: 200, data: out };
}

function normPageTree(pages: RawDocPage[]): CuDocPage[] {
  const out: CuDocPage[] = [];
  for (const p of pages) {
    const id = (p.id ?? "").trim();
    const name = (p.name ?? "").trim();
    if (!id) continue;
    out.push({
      id,
      name: name || "(untitled page)",
      children: Array.isArray(p.pages) ? normPageTree(p.pages) : [],
    });
  }
  return out;
}

/** GET /workspaces/{id}/docs/{docId}/pageListing (v3) — the doc's page tree. */
export async function listDocPages(
  workspaceId: string,
  docId: string,
  correlationId: string,
): Promise<ClickUpResult<CuDocPage[]>> {
  const res = await clickUpRequest<RawDocPage[]>(
    `/workspaces/${workspaceId}/docs/${docId}/pageListing`,
    { correlationId, apiBase: CLICKUP_API_V3 },
  );
  if (!res.ok) return res;
  const pages = Array.isArray(res.data) ? res.data : [];
  return { ok: true, status: res.status, data: normPageTree(pages) };
}
