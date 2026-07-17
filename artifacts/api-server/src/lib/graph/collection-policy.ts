import type { CuDoc, CuDocPage, CuTask, CuWorkspace } from "./clickup-structure";

export interface GraphCollectionPolicy {
  workspaceId: string | null;
  allowedSpaceIds: ReadonlySet<string> | null;
  allowedListIds: ReadonlySet<string> | null;
  allowedDocIds: ReadonlySet<string> | null;
  taskLookbackDays: number;
  maxTasksPerList: number;
  maxTasksTotal: number;
  maxDocs: number;
  maxPagesPerDoc: number;
  maxPagesTotal: number;
  maxPushRecords: number;
}

export interface GraphCollectionReport {
  workspaces: { discovered: number; included: number; excluded: number };
  spaces: { discovered: number; included: number; excluded: number };
  lists: { discovered: number; included: number; excluded: number };
  tasks: { discovered: number; included: number; excludedByAge: number; excludedByListCap: number; excludedByGlobalCap: number };
  docs: { discovered: number; included: number; excluded: number };
  pages: { discovered: number; included: number; excluded: number };
  clients: { included: number };
  pushRecords: { discovered: number; included: number; excluded: number };
}

const csv = (value: string | undefined): ReadonlySet<string> | null => {
  const values = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return values.length ? new Set(values) : null;
};
const boundedInt = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

export function readGraphCollectionPolicy(env: NodeJS.ProcessEnv = process.env): GraphCollectionPolicy {
  return {
    workspaceId: (env.GRAPH_WORKSPACE_ID ?? env.CLICKUP_WORKSPACE_ID ?? "").trim() || null,
    allowedSpaceIds: csv(env.GRAPH_ALLOWED_SPACE_IDS),
    allowedListIds: csv(env.GRAPH_ALLOWED_LIST_IDS),
    allowedDocIds: csv(env.GRAPH_ALLOWED_DOC_IDS),
    taskLookbackDays: boundedInt(env.GRAPH_TASK_LOOKBACK_DAYS, 90, 1, 3650),
    maxTasksPerList: boundedInt(env.GRAPH_MAX_TASKS_PER_LIST, 25, 0, 500),
    maxTasksTotal: boundedInt(env.GRAPH_MAX_TASKS_TOTAL, 500, 0, 5000),
    maxDocs: boundedInt(env.GRAPH_MAX_DOCS, 75, 0, 1000),
    maxPagesPerDoc: boundedInt(env.GRAPH_MAX_PAGES_PER_DOC, 100, 0, 1000),
    maxPagesTotal: boundedInt(env.GRAPH_MAX_PAGES_TOTAL, 500, 0, 5000),
    maxPushRecords: boundedInt(env.GRAPH_MAX_PUSH_RECORDS, 250, 0, 5000),
  };
}

export function selectWorkspace(workspaces: CuWorkspace[], policy: GraphCollectionPolicy): CuWorkspace | null {
  if (policy.workspaceId) return workspaces.find((workspace) => workspace.id === policy.workspaceId) ?? null;
  return workspaces[0] ?? null;
}
export const allowsSpace = (id: string, policy: GraphCollectionPolicy) => !policy.allowedSpaceIds || policy.allowedSpaceIds.has(id);
export const allowsList = (id: string, policy: GraphCollectionPolicy) => !policy.allowedListIds || policy.allowedListIds.has(id);
export const allowsDoc = (id: string, policy: GraphCollectionPolicy) => !policy.allowedDocIds || policy.allowedDocIds.has(id);

const taskTime = (task: CuTask): number => task.updatedAt ? Date.parse(task.updatedAt) || 0 : 0;
export function boundTasksByList(
  input: Array<{ listId: string; tasks: CuTask[] }>,
  policy: GraphCollectionPolicy,
  now = new Date(),
): { tasksByList: Array<{ listId: string; tasks: CuTask[] }>; counts: GraphCollectionReport["tasks"] } {
  const cutoff = now.getTime() - policy.taskLookbackDays * 86_400_000;
  let discovered = 0, excludedByAge = 0, excludedByListCap = 0;
  const candidates: Array<{ listId: string; task: CuTask }> = [];
  for (const group of input) {
    discovered += group.tasks.length;
    const recent = group.tasks.filter((task) => {
      const keep = taskTime(task) >= cutoff;
      if (!keep) excludedByAge += 1;
      return keep;
    }).sort((a, b) => taskTime(b) - taskTime(a) || a.id.localeCompare(b.id));
    excludedByListCap += Math.max(0, recent.length - policy.maxTasksPerList);
    for (const task of recent.slice(0, policy.maxTasksPerList)) candidates.push({ listId: group.listId, task });
  }
  candidates.sort((a, b) => taskTime(b.task) - taskTime(a.task) || a.task.id.localeCompare(b.task.id));
  const selected = candidates.slice(0, policy.maxTasksTotal);
  const byList = new Map<string, CuTask[]>();
  for (const { listId, task } of selected) byList.set(listId, [...(byList.get(listId) ?? []), task]);
  return {
    tasksByList: [...byList].map(([listId, tasks]) => ({ listId, tasks })),
    counts: { discovered, included: selected.length, excludedByAge, excludedByListCap, excludedByGlobalCap: Math.max(0, candidates.length - selected.length) },
  };
}

export function selectDocs(docs: CuDoc[], policy: GraphCollectionPolicy): { docs: CuDoc[]; excluded: number } {
  const allowed = docs.filter((doc) => allowsDoc(doc.id, policy));
  allowed.sort((a, b) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0) || a.id.localeCompare(b.id));
  const selected = allowed.slice(0, policy.maxDocs);
  return { docs: selected, excluded: docs.length - selected.length };
}

export function boundPageTree(
  pages: CuDocPage[],
  max: number,
): { pages: CuDocPage[]; discovered: number; included: number; excluded: number } {
  let discovered = 0, included = 0;
  const walk = (items: CuDocPage[]): CuDocPage[] => {
    const out: CuDocPage[] = [];
    for (const page of items) {
      discovered += 1;
      if (included >= max) { countOnly(page.children); continue; }
      included += 1;
      out.push({ ...page, children: walk(page.children) });
    }
    return out;
  };
  const countOnly = (items: CuDocPage[]): void => { for (const page of items) { discovered += 1; countOnly(page.children); } };
  const bounded = walk(pages);
  return { pages: bounded, discovered, included, excluded: discovered - included };
}

export function emptyCollectionReport(): GraphCollectionReport {
  return {
    workspaces: { discovered: 0, included: 0, excluded: 0 }, spaces: { discovered: 0, included: 0, excluded: 0 },
    lists: { discovered: 0, included: 0, excluded: 0 }, tasks: { discovered: 0, included: 0, excludedByAge: 0, excludedByListCap: 0, excludedByGlobalCap: 0 },
    docs: { discovered: 0, included: 0, excluded: 0 }, pages: { discovered: 0, included: 0, excluded: 0 },
    clients: { included: 0 }, pushRecords: { discovered: 0, included: 0, excluded: 0 },
  };
}
