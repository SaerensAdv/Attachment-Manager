import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Unit tests for the read-only ClickUp workspace-structure reader (Fase 3.5 G1).
 * Fetch is stubbed so we assert: correct endpoints/bases (v2 hierarchy vs v3
 * Docs), archived/closed query params, normalization (ids/names/status/url/
 * updatedAt epoch->ISO), folderId wiring, pagination (v2 page + v3 cursor), the
 * nested doc page tree, and that a provider failure is propagated as a typed
 * error result (not thrown, not silently swallowed).
 *
 * `../logger` is mocked because the request core logs retries/failures.
 */

const { logWarn, logError, logInfo } = vi.hoisted(() => ({
  logWarn: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));
vi.mock("../logger", () => ({
  logger: { warn: logWarn, error: logError, info: logInfo, debug: vi.fn() },
}));

import {
  listWorkspaces,
  listSpaces,
  listFolders,
  listFolderlessLists,
  listTasks,
  listDocs,
  listDocPages,
  CLICKUP_API_V3,
} from "./clickup-structure";

const TOKEN = "pk_supersecret_test_123";
const CID = "corr-1";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Record the URLs fetch was called with, in order. */
function fetchReturning(...bodies: unknown[]): {
  mock: ReturnType<typeof vi.fn>;
  urls: string[];
} {
  const urls: string[] = [];
  let i = 0;
  const mock = vi.fn(async (url: string) => {
    urls.push(url);
    const body = bodies[Math.min(i, bodies.length - 1)];
    i++;
    return jsonRes(body);
  });
  return { mock, urls };
}

describe("clickup-structure reader", () => {
  beforeEach(() => {
    process.env.CLICKUP_API_TOKEN = TOKEN;
    logWarn.mockClear();
    logError.mockClear();
    logInfo.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.CLICKUP_API_TOKEN;
  });

  it("listWorkspaces parses teams and drops entries missing id/name", async () => {
    const { mock, urls } = fetchReturning({
      teams: [
        { id: "9015913612", name: "Saerens Advertising" },
        { id: "", name: "no id" },
        { id: "x" },
      ],
    });
    vi.stubGlobal("fetch", mock);
    const res = await listWorkspaces(CID);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual([{ id: "9015913612", name: "Saerens Advertising" }]);
    expect(urls[0]).toContain("/api/v2/team");
  });

  it("listSpaces requests non-archived spaces", async () => {
    const { mock, urls } = fetchReturning({
      spaces: [{ id: "90159033128", name: "Saerens HQ" }],
    });
    vi.stubGlobal("fetch", mock);
    const res = await listSpaces("9015913612", CID);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual([{ id: "90159033128", name: "Saerens HQ" }]);
    expect(urls[0]).toContain("/team/9015913612/space");
    expect(urls[0]).toContain("archived=false");
  });

  it("listFolders normalizes folders + inlined lists with folderId set", async () => {
    const { mock } = fetchReturning({
      folders: [
        {
          id: "901514675829",
          name: "Klantenbeheer",
          lists: [
            { id: "L1", name: "Onboarding", task_count: 3 },
            { id: "", name: "skip" },
          ],
        },
      ],
    });
    vi.stubGlobal("fetch", mock);
    const res = await listFolders("90159033128", CID);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(1);
      expect(res.data[0].lists).toEqual([
        { id: "L1", name: "Onboarding", folderId: "901514675829", taskCount: 3 },
      ]);
    }
  });

  it("listFolderlessLists returns lists with folderId null", async () => {
    const { mock } = fetchReturning({ lists: [{ id: "L9", name: "Inbox" }] });
    vi.stubGlobal("fetch", mock);
    const res = await listFolderlessLists("90159033128", CID);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual([{ id: "L9", name: "Inbox", folderId: null, taskCount: null }]);
  });

  it("listTasks excludes closed by default, maps fields, paginates until last_page", async () => {
    const page0 = {
      tasks: [
        {
          id: "T1",
          name: "Write report",
          status: { status: "in progress", type: "custom" },
          url: "https://app.clickup.com/t/T1",
          date_updated: "1700000000000",
        },
        {
          id: "T2",
          name: "Done thing",
          status: { status: "complete", type: "closed" },
          date_updated: 1700000000000,
        },
      ],
      last_page: false,
    };
    const page1 = { tasks: [], last_page: true };
    const { mock, urls } = fetchReturning(page0, page1);
    vi.stubGlobal("fetch", mock);
    const res = await listTasks("L1", CID);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(2);
      expect(res.data[0]).toEqual({
        id: "T1",
        name: "Write report",
        status: "in progress",
        url: "https://app.clickup.com/t/T1",
        updatedAt: new Date(1700000000000).toISOString(),
        closed: false,
      });
      expect(res.data[1].closed).toBe(true);
      expect(res.data[1].url).toBeNull();
    }
    expect(urls[0]).toContain("include_closed=false");
    expect(urls.length).toBe(2);
  });

  it("listTasks includeClosed flips the include_closed query", async () => {
    const { mock, urls } = fetchReturning({ tasks: [], last_page: true });
    vi.stubGlobal("fetch", mock);
    await listTasks("L1", CID, { includeClosed: true });
    expect(urls[0]).toContain("include_closed=true");
  });

  it("listDocs hits the v3 base and follows the next_cursor", async () => {
    const p0 = { docs: [{ id: "D1", name: "Meeting Minutes", date_updated: 1700000000000 }], next_cursor: "c2" };
    const p1 = { docs: [{ id: "D2", name: "SOP" }], next_cursor: "" };
    const { mock, urls } = fetchReturning(p0, p1);
    vi.stubGlobal("fetch", mock);
    const res = await listDocs("9015913612", CID);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.map((d) => d.id)).toEqual(["D1", "D2"]);
      expect(res.data[0].updatedAt).toBe(new Date(1700000000000).toISOString());
      expect(res.data[1].updatedAt).toBeNull();
    }
    expect(urls[0]).toContain(CLICKUP_API_V3);
    expect(urls[0]).toContain("/workspaces/9015913612/docs");
    expect(urls[1]).toContain("next_cursor=c2");
    expect(urls.length).toBe(2);
  });

  it("listDocPages normalizes the nested page tree on the v3 base", async () => {
    const { mock, urls } = fetchReturning([
      { id: "P1", name: "Intro", pages: [{ id: "P1a", name: "Sub", pages: [] }] },
      { id: "P2", name: "" },
    ]);
    vi.stubGlobal("fetch", mock);
    const res = await listDocPages("9015913612", "D1", CID);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual([
        { id: "P1", name: "Intro", children: [{ id: "P1a", name: "Sub", children: [] }] },
        { id: "P2", name: "(untitled page)", children: [] },
      ]);
    }
    expect(urls[0]).toContain(CLICKUP_API_V3);
    expect(urls[0]).toContain("/docs/D1/pageListing");
  });

  it("propagates a provider failure as a typed error (not thrown)", async () => {
    const mock = vi.fn(async () => jsonRes({ err: "Team not found", ECODE: "TEAM_001" }, 404));
    vi.stubGlobal("fetch", mock);
    const res = await listSpaces("bad", CID);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe("http");
      expect(res.error.status).toBe(404);
    }
  });
});
