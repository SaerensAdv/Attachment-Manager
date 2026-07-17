/**
 * ClickUp provider (READ ONLY) — thin wrapper over the ClickUp v2 REST API.
 *
 * The app treats the ClickUp "CRM → Companies" list as the master company
 * directory. We only ever READ from it: the link-only sync matches app clients
 * to ClickUp companies and stores the ClickUp task id as a back-reference. We
 * never create, update or delete anything in ClickUp.
 *
 * Auth: a personal ClickUp API token (`pk_…`) supplied as the CLICKUP_API_TOKEN
 * secret, sent RAW in the Authorization header (personal tokens are NOT Bearer;
 * only OAuth access tokens use the `Bearer ` prefix). No SDK — plain `fetch`.
 */

const API_BASE = "https://api.clickup.com/api/v2";

/**
 * The CRM → Companies list that holds the master company records. Confirmed as
 * the client master with Axel. Overridable via env for safety/portability, but
 * defaults to the known list so the feature works out of the box.
 */
export const DEFAULT_COMPANIES_LIST_ID = "901524400055";

/** Thrown when the ClickUp token is missing — a 400 (operator config), not 502. */
export class ClickUpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClickUpConfigError";
  }
}

/** Thrown when ClickUp itself errors (network / non-2xx) — maps to a 502. */
export class ClickUpApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ClickUpApiError";
  }
}

interface ClickUpConfig {
  token: string;
  companiesListId: string;
}

/** Read the token + list id from the environment, or throw ClickUpConfigError. */
export function readClickUpConfig(): ClickUpConfig {
  const token = (process.env.CLICKUP_API_TOKEN ?? "").trim();
  if (!token) {
    throw new ClickUpConfigError(
      "CLICKUP_API_TOKEN ontbreekt. Voeg het ClickUp API-token toe om te synchroniseren.",
    );
  }
  const companiesListId = (
    process.env.CLICKUP_COMPANIES_LIST_ID ?? DEFAULT_COMPANIES_LIST_ID
  ).trim();
  return { token, companiesListId };
}

/** A minimal, normalized view of a ClickUp company (task) record. */
export interface ClickUpCompany {
  /** ClickUp task id — stored on the app client as `clickupCompanyId`. */
  id: string;
  name: string;
  /** Value of the "Website" url custom field, or null when unset. */
  website: string | null;
  /** Human status label (the task status, e.g. "active client", "prospect"). */
  status: string | null;
}

interface ClickUpCustomField {
  id?: string;
  name?: string;
  type?: string;
  value?: unknown;
}

interface ClickUpTask {
  id?: string;
  name?: string;
  status?: { status?: string } | null;
  custom_fields?: ClickUpCustomField[];
}

/** Extract the "Website" url custom field value from a task, or null. */
function websiteFromTask(task: ClickUpTask): string | null {
  const fields = Array.isArray(task.custom_fields) ? task.custom_fields : [];
  for (const f of fields) {
    const isWebsite =
      (f.name ?? "").trim().toLowerCase() === "website" || f.type === "url";
    if (!isWebsite) continue;
    if (typeof f.value === "string" && f.value.trim()) return f.value.trim();
  }
  return null;
}

async function clickUpFetch(
  path: string,
  token: string,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: token, "Content-Type": "application/json" },
    });
  } catch (err) {
    throw new ClickUpApiError(
      `Kon ClickUp niet bereiken: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const detail =
      typeof body.err === "string" ? body.err : `HTTP ${res.status}`;
    throw new ClickUpApiError(`ClickUp-fout: ${detail}`, res.status);
  }
  return body;
}

/**
 * List every company in the CRM → Companies list. Read-only, paginated
 * (ClickUp returns up to 100 tasks per page). Includes closed statuses so
 * prospects/partners/active clients all come through.
 */
export async function listClickUpCompanies(): Promise<ClickUpCompany[]> {
  const { token, companiesListId } = readClickUpConfig();
  const companies: ClickUpCompany[] = [];
  // Defensive page cap: the CRM holds a handful of companies, but never loop
  // unbounded on a misbehaving API.
  for (let page = 0; page < 20; page++) {
    const body = await clickUpFetch(
      `/list/${companiesListId}/task?archived=false&include_closed=true&subtasks=false&page=${page}`,
      token,
    );
    const tasks = Array.isArray(body.tasks) ? (body.tasks as ClickUpTask[]) : [];
    for (const t of tasks) {
      const id = (t.id ?? "").trim();
      const name = (t.name ?? "").trim();
      if (!id || !name) continue;
      companies.push({
        id,
        name,
        website: websiteFromTask(t),
        status: t.status?.status?.trim() || null,
      });
    }
    if (body.last_page === true || tasks.length === 0) break;
  }
  return companies;
}
