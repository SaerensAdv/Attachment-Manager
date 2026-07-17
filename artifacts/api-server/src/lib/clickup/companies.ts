import { clickUpRequest } from "./client";
import type { ClickUpErrorInfo } from "./errors";
import type {
  ClickUpFieldDef,
  ClickUpFolder,
  ClickUpStatusDef,
  ClickUpTaskRef,
} from "./types";
import { getListDetail, getListFields, getTask, resolveField } from "./tasks";

/**
 * The client -> report-location bridge.
 *
 * A monthly report belongs in the client's "Reporting & Billing" list inside its
 * "02 Client Delivery" folder. Resolving that location is deliberately careful:
 * only ONE client (Schrever) is fully modelled today, so the bridge must resolve
 * a real, fully-configured location or SKIP WITH A REASON — it must never guess a
 * list or write to a half-configured one (Axel's decision: report push only to
 * fully-configured clients; others "locatie niet ingericht").
 *
 * Location strategy:
 *  1. Prefer the Company task's "Delivery folder" custom field (the intended
 *     explicit bridge). It's empty on every company today, but honoured first so
 *     that populating it later Just Works.
 *  2. Otherwise name-match the `CLI-00N <Company>` folder in the delivery space
 *     to the Company task name — exactly one match or skip (0 / ambiguous).
 *
 * Config gate: the resolved Reporting & Billing list must actually carry the rich
 * report field set (Record type=Report, Report type=Monthly, Period start/end,
 * Report URL). This live-metadata check — not a hardcoded list id — is what
 * limits pushes to the single fully-configured client.
 */

const DEFAULT_COMPANIES_LIST_ID = "901524400055";

/** Custom-field / list names we match by (case-insensitive) — not ids. */
const DELIVERY_FOLDER_FIELD = "Delivery folder";
const REPORTING_LIST_HINT = "reporting";
const REQUIRED_REPORT_FIELDS = {
  recordType: "Record type",
  recordTypeOption: "Report",
  reportType: "Report type",
  reportTypeOption: "Monthly",
  periodStart: "Period start",
  periodEnd: "Period end",
  reportUrl: "Report URL",
} as const;

export interface ReportingLocation {
  companyTaskId: string;
  companyName: string;
  folderId: string;
  listId: string;
  listName: string;
  statuses: ClickUpStatusDef[];
  fields: ClickUpFieldDef[];
}

export type ReportingLocationResult =
  | { status: "resolved"; location: ReportingLocation }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: ClickUpErrorInfo };

// ---- Workspace discovery (memoized; env-overridable) -----------------------

let teamIdCache: string | null = null;
let deliverySpaceIdCache: string | null = null;

/** Reset discovery caches — for tests only. */
export function resetBridgeCacheForTests(): void {
  teamIdCache = null;
  deliverySpaceIdCache = null;
}

async function resolveTeamId(
  correlationId: string,
): Promise<{ id: string } | { error: ClickUpErrorInfo }> {
  const env = (process.env.CLICKUP_TEAM_ID ?? "").trim();
  if (env) return { id: env };
  if (teamIdCache) return { id: teamIdCache };
  const res = await clickUpRequest<{ teams?: { id: string; name?: string }[] }>(
    "/team",
    { correlationId },
  );
  if (!res.ok) return { error: res.error };
  const teams = res.data.teams ?? [];
  const match =
    teams.find((t) => /saerens/i.test(t.name ?? "")) ?? teams[0] ?? null;
  if (!match) {
    return {
      error: {
        kind: "http",
        code: "NO_TEAM",
        message: "Geen ClickUp-workspace gevonden.",
        retryable: false,
      },
    };
  }
  teamIdCache = match.id;
  return { id: match.id };
}

async function resolveDeliverySpaceId(
  correlationId: string,
): Promise<{ id: string } | { skip: string } | { error: ClickUpErrorInfo }> {
  const env = (process.env.CLICKUP_DELIVERY_SPACE_ID ?? "").trim();
  if (env) return { id: env };
  if (deliverySpaceIdCache) return { id: deliverySpaceIdCache };
  const team = await resolveTeamId(correlationId);
  if ("error" in team) return { error: team.error };
  const res = await clickUpRequest<{ spaces?: { id: string; name?: string }[] }>(
    `/team/${team.id}/space`,
    { correlationId },
  );
  if (!res.ok) return { error: res.error };
  const space = (res.data.spaces ?? []).find((s) =>
    /client delivery/i.test(s.name ?? ""),
  );
  if (!space) return { skip: "geen '02 Client Delivery'-space gevonden" };
  deliverySpaceIdCache = space.id;
  return { id: space.id };
}

// ---- Pure helpers ----------------------------------------------------------

/** Read the "Delivery folder" custom-field string value from a Company task. */
export function deliveryFolderValue(task: ClickUpTaskRef): string | null {
  for (const f of task.custom_fields ?? []) {
    if ((f.name ?? "").trim().toLowerCase() === DELIVERY_FOLDER_FIELD.toLowerCase()) {
      if (typeof f.value === "string" && f.value.trim()) return f.value.trim();
    }
  }
  return null;
}

/** Best-effort extract of a folder id from a ClickUp folder URL/value. */
export function parseFolderId(value: string): string | null {
  const m = value.match(/(?:folder\/|\/f\/|\/)(\d{6,})(?:\/|$|\?)/);
  return m ? m[1] : null;
}

/**
 * Match the single delivery folder for a company by name. Folders are named
 * `CLI-00N <Company>`; we strip the `CLI-…` prefix and compare to the company
 * name. Returns the folder, or null when there is no match OR more than one
 * (ambiguous — caller must skip, never guess).
 */
export function matchFolderByCompanyName(
  folders: ClickUpFolder[],
  companyName: string,
): { folder: ClickUpFolder | null; ambiguous: boolean } {
  const target = companyName.trim().toLowerCase();
  if (!target) return { folder: null, ambiguous: false };
  const stripPrefix = (n: string) =>
    n.replace(/^cli-?\s*\d+\s*/i, "").trim().toLowerCase();
  const matches = folders.filter((f) => {
    const name = (f.name ?? "").trim().toLowerCase();
    const stripped = stripPrefix(f.name ?? "");
    return stripped === target || name.includes(target) || stripped.includes(target);
  });
  if (matches.length === 1) return { folder: matches[0], ambiguous: false };
  return { folder: null, ambiguous: matches.length > 1 };
}

/** Find the Reporting & Billing list within a folder's lists. */
export function findReportingList(
  folder: ClickUpFolder,
): { id: string; name: string } | null {
  const list = (folder.lists ?? []).find((l) =>
    (l.name ?? "").toLowerCase().includes(REPORTING_LIST_HINT),
  );
  return list ? { id: list.id, name: list.name } : null;
}

/**
 * The config gate: true only when the list carries the full report field set.
 * This is what selects the single fully-configured client at runtime.
 */
export function hasReportFieldSet(fields: ClickUpFieldDef[]): boolean {
  const recordType = resolveField(fields, REQUIRED_REPORT_FIELDS.recordType);
  const reportType = resolveField(fields, REQUIRED_REPORT_FIELDS.reportType);
  const hasRecordOption = (recordType?.type_config?.options ?? []).some(
    (o) =>
      (o.name ?? o.label ?? "").trim().toLowerCase() ===
      REQUIRED_REPORT_FIELDS.recordTypeOption.toLowerCase(),
  );
  const hasReportOption = (reportType?.type_config?.options ?? []).some(
    (o) =>
      (o.name ?? o.label ?? "").trim().toLowerCase() ===
      REQUIRED_REPORT_FIELDS.reportTypeOption.toLowerCase(),
  );
  return Boolean(
    recordType &&
      reportType &&
      hasRecordOption &&
      hasReportOption &&
      resolveField(fields, REQUIRED_REPORT_FIELDS.periodStart) &&
      resolveField(fields, REQUIRED_REPORT_FIELDS.periodEnd) &&
      resolveField(fields, REQUIRED_REPORT_FIELDS.reportUrl),
  );
}

// ---- Folder fetch ----------------------------------------------------------

async function getFolder(
  folderId: string,
  correlationId: string,
): Promise<{ folder: ClickUpFolder } | { error: ClickUpErrorInfo }> {
  const res = await clickUpRequest<ClickUpFolder>(`/folder/${folderId}`, {
    correlationId,
  });
  if (!res.ok) return { error: res.error };
  return { folder: res.data };
}

async function listDeliveryFolders(
  spaceId: string,
  correlationId: string,
): Promise<{ folders: ClickUpFolder[] } | { error: ClickUpErrorInfo }> {
  const res = await clickUpRequest<{ folders?: ClickUpFolder[] }>(
    `/space/${spaceId}/folder`,
    { correlationId, query: { archived: false } },
  );
  if (!res.ok) return { error: res.error };
  return { folders: res.data.folders ?? [] };
}

// ---- Main bridge -----------------------------------------------------------

/**
 * Resolve the fully-configured Reporting & Billing location for a client, or a
 * skip reason. `companyTaskId` is the app client's `clickupCompanyId`.
 */
export async function resolveReportingLocation(input: {
  companyTaskId: string | null | undefined;
  correlationId: string;
}): Promise<ReportingLocationResult> {
  const { companyTaskId, correlationId } = input;
  if (!companyTaskId) {
    return { status: "skipped", reason: "geen ClickUp-company gekoppeld" };
  }

  const companyRes = await getTask(companyTaskId, correlationId);
  if (!companyRes.ok) return { status: "failed", error: companyRes.error };
  const companyName = (companyRes.data.name ?? "").trim();
  if (!companyName) {
    return { status: "skipped", reason: "ClickUp-company zonder naam" };
  }

  // 1) Explicit "Delivery folder" field first, then name-match fallback.
  let folder: ClickUpFolder | null = null;
  const deliveryValue = deliveryFolderValue(companyRes.data);
  const explicitFolderId = deliveryValue ? parseFolderId(deliveryValue) : null;
  if (explicitFolderId) {
    const got = await getFolder(explicitFolderId, correlationId);
    if ("error" in got) return { status: "failed", error: got.error };
    folder = got.folder;
  } else {
    const space = await resolveDeliverySpaceId(correlationId);
    if ("error" in space) return { status: "failed", error: space.error };
    if ("skip" in space) return { status: "skipped", reason: space.skip };
    const listed = await listDeliveryFolders(space.id, correlationId);
    if ("error" in listed) return { status: "failed", error: listed.error };
    const matched = matchFolderByCompanyName(listed.folders, companyName);
    if (matched.ambiguous) {
      return {
        status: "skipped",
        reason: `meerdere delivery-folders matchen "${companyName}" (dubbelzinnig)`,
      };
    }
    if (!matched.folder) {
      return {
        status: "skipped",
        reason: `geen delivery-folder gevonden voor "${companyName}"`,
      };
    }
    folder = matched.folder;
  }

  const reporting = findReportingList(folder);
  if (!reporting) {
    return {
      status: "skipped",
      reason: `geen 'Reporting & Billing'-lijst voor "${companyName}"`,
    };
  }

  const [detailRes, fieldsRes] = await Promise.all([
    getListDetail(reporting.id, correlationId),
    getListFields(reporting.id, correlationId),
  ]);
  if (!detailRes.ok) return { status: "failed", error: detailRes.error };
  if (!fieldsRes.ok) return { status: "failed", error: fieldsRes.error };

  const fields = fieldsRes.data;
  if (!hasReportFieldSet(fields)) {
    return {
      status: "skipped",
      reason: `Reporting & Billing-locatie voor "${companyName}" is niet volledig ingericht`,
    };
  }

  return {
    status: "resolved",
    location: {
      companyTaskId,
      companyName,
      folderId: folder.id,
      listId: reporting.id,
      listName: reporting.name,
      statuses: detailRes.data.statuses ?? [],
      fields,
    },
  };
}

/** The Companies list id (mirrors the read client default; env-overridable). */
export function companiesListId(): string {
  return (
    process.env.CLICKUP_COMPANIES_LIST_ID ?? DEFAULT_COMPANIES_LIST_ID
  ).trim();
}
