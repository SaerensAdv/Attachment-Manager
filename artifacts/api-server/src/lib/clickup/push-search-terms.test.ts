import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the search-terms push flow (brief §6.5). They pin the safety
 * contract: a malformed week fails fast, an unreadable list fails cleanly,
 * dry-run writes nothing, exactly-one-object (claim / duplicate / in-progress /
 * crash-resume), runtime status/field resolution against the FIXED central list,
 * and a stably-sorted, correctly-escaped CSV attached once on fresh create.
 *
 * The idempotency ledger + logger are mocked; the request CORE is mocked so the
 * real `tasks` resolvers/writers run (that's where the field/status mapping and
 * the list-metadata reads live).
 */

const { requestMock, uploadMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  uploadMock: vi.fn(),
}));
const { claimPushMock, recordObjectIdMock, markSucceededMock, markFailedMock } =
  vi.hoisted(() => ({
    claimPushMock: vi.fn(),
    recordObjectIdMock: vi.fn(),
    markSucceededMock: vi.fn(),
    markFailedMock: vi.fn(),
  }));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("./client", () => ({
  clickUpRequest: requestMock,
  clickUpUploadAttachment: uploadMock,
}));
vi.mock("./idempotency", () => ({
  searchTermsKey: (id: unknown, w: unknown) => `st:${id}:${w}`,
  claimPush: claimPushMock,
  recordObjectId: recordObjectIdMock,
  markSucceeded: markSucceededMock,
  markFailed: markFailedMock,
}));

import {
  pushSearchTerms,
  buildSearchTermsCsv,
  DEFAULT_INTERNAL_WORK_LIST_ID,
  type SearchTermRow,
} from "./push-search-terms";
import type { ClickUpFieldDef } from "./types";

const LIST = DEFAULT_INTERNAL_WORK_LIST_ID;
const ok = (data: unknown) => ({ ok: true, status: 200, data });
const httpErr = (status: number, code: string) => ({
  ok: false,
  status,
  error: { kind: "http", code, message: "boom", retryable: status >= 500 },
});

const RICH_FIELDS: ClickUpFieldDef[] = [
  {
    id: "f-record",
    name: "Record type",
    type: "drop_down",
    type_config: { options: [{ id: "o-st", name: "Search terms" }] },
  },
  { id: "f-start", name: "Period start", type: "date" },
  { id: "f-end", name: "Period end", type: "date" },
  { id: "f-url", name: "Report URL", type: "url" },
];

const LIST_DETAIL = {
  id: LIST,
  name: "Internal Work",
  statuses: [
    { status: "open", type: "open" },
    { status: "ready for review", type: "custom" },
  ],
};

const ROWS: SearchTermRow[] = [
  {
    term: "goedkope airco plaatsen",
    impressions: 120,
    clicks: 8,
    cost: 12.5,
    classification: "irrelevant",
    proposedAction: "Toevoegen als negative (exact)",
  },
  {
    term: "airco installateur limburg",
    impressions: 300,
    clicks: 20,
    cost: 45.0,
    classification: "monitor",
    proposedAction: "Monitoren",
  },
];

const baseInput = {
  sourceRunId: "run-7",
  customerId: "1234567890",
  accountName: "Car Audio Limburg",
  weekStart: "2026-07-06",
  rows: ROWS,
  reportUrl: "https://app/zoektermen/7",
  correlationId: "corr",
};

/** Route GET list-detail + list-fields, and (optionally) a successful create. */
function routeReadsAndCreate(create = true) {
  requestMock.mockImplementation(
    async (path: string, opts?: { method?: string }) => {
      if (path === `/list/${LIST}` && !opts?.method) return ok(LIST_DETAIL);
      if (path === `/list/${LIST}/field` && !opts?.method)
        return ok({ fields: RICH_FIELDS });
      if (create && path === `/list/${LIST}/task` && opts?.method === "POST")
        return ok({ id: "TASK1", url: "https://cu/TASK1" });
      throw new Error(`unrouted ${path}`);
    },
  );
}

beforeEach(() => {
  requestMock.mockReset();
  uploadMock.mockReset();
  claimPushMock.mockReset();
  recordObjectIdMock.mockReset();
  markSucceededMock.mockReset();
  markFailedMock.mockReset();
  uploadMock.mockResolvedValue(ok({ id: "att1", url: "https://cu/att1" }));
});

describe("buildSearchTermsCsv", () => {
  it("sorts stably (cost desc, clicks desc, term asc) with a header", () => {
    const csv = buildSearchTermsCsv(ROWS);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "Search term,Impressions,Clicks,Cost,Classification,Proposed action",
    );
    // Highest cost (45.00) first.
    expect(lines[1].startsWith("airco installateur limburg,300,20,45.00")).toBe(
      true,
    );
    expect(lines[2].startsWith("goedkope airco plaatsen,120,8,12.50")).toBe(true);
    // Terminates with a trailing CRLF (RFC 4180).
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("escapes commas, quotes and newlines per RFC 4180", () => {
    const csv = buildSearchTermsCsv([
      {
        term: 'airco "koud", snel\nplaatsen',
        impressions: 1,
        clicks: 1,
        cost: 1,
        classification: "irrelevant",
        proposedAction: "Toevoegen",
      },
    ]);
    expect(csv).toContain('"airco ""koud"", snel\nplaatsen"');
  });

  it("is deterministic for the same rows in any input order", () => {
    const a = buildSearchTermsCsv(ROWS);
    const b = buildSearchTermsCsv([...ROWS].reverse());
    expect(a).toBe(b);
  });
});

describe("pushSearchTerms — guards", () => {
  it("fails fast on a malformed weekStart without touching anything", async () => {
    const res = await pushSearchTerms({ ...baseInput, weekStart: "2026-7-6" });
    expect(res.status).toBe("failed");
    if (res.status === "failed") expect(res.code).toBe("BAD_PERIOD");
    expect(requestMock).not.toHaveBeenCalled();
    expect(claimPushMock).not.toHaveBeenCalled();
  });

  it("fails cleanly when the target list cannot be read", async () => {
    requestMock.mockResolvedValue(httpErr(401, "UNAUTHORIZED"));
    const res = await pushSearchTerms(baseInput);
    expect(res.status).toBe("failed");
    if (res.status === "failed") expect(res.code).toBe("UNAUTHORIZED");
    expect(claimPushMock).not.toHaveBeenCalled();
  });
});

describe("pushSearchTerms — dry-run", () => {
  it("returns a safe preview and writes nothing", async () => {
    routeReadsAndCreate(false);
    const res = await pushSearchTerms({ ...baseInput, dryRun: true });
    expect(res.status).toBe("skipped");
    if (res.status === "skipped") {
      expect(res.dryRun).toBe(true);
      expect(res.preview?.name).toBe(
        "[2026-07-06] Car Audio Limburg - Search Terms",
      );
      expect(res.preview?.status).toBe("ready for review");
      expect(res.preview?.listId).toBe(LIST);
      expect(res.preview?.rows).toBe(2);
      expect(res.preview?.fieldsSet).toContain("Record type");
    }
    expect(claimPushMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
    // Only the two read calls happened, never a create.
    expect(
      requestMock.mock.calls.some((c) => c[0] === `/list/${LIST}/task`),
    ).toBe(false);
  });
});

describe("pushSearchTerms — create", () => {
  it("creates the review task with runtime-resolved fields and attaches the CSV once", async () => {
    routeReadsAndCreate();
    claimPushMock.mockResolvedValue({
      state: "claimed",
      record: { clickupObjectId: null, clickupUrl: null },
    });
    const res = await pushSearchTerms(baseInput);
    expect(res.status).toBe("pushed");
    if (res.status === "pushed") expect(res.objectId).toBe("TASK1");

    const createCall = requestMock.mock.calls.find(
      (c) => c[0] === `/list/${LIST}/task`,
    );
    const body = createCall![1].body;
    expect(body.name).toBe("[2026-07-06] Car Audio Limburg - Search Terms");
    expect(body.status).toBe("ready for review");
    expect(body.markdown_content).toContain("Source run:** run-7");
    expect(body.markdown_content).toContain("geen negatives live");
    expect(body.custom_fields).toEqual(
      expect.arrayContaining([
        { id: "f-record", value: "o-st" },
        { id: "f-start", value: Date.parse("2026-07-06T00:00:00.000Z") },
        {
          id: "f-end",
          value: Date.parse("2026-07-06T00:00:00.000Z") + 6 * 86400000,
        },
        { id: "f-url", value: "https://app/zoektermen/7" },
      ]),
    );

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const upload = uploadMock.mock.calls[0];
    expect(upload[0]).toBe("TASK1");
    expect(upload[1].filename).toBe(
      "zoektermen-car-audio-limburg-2026-07-06.csv",
    );
    expect(recordObjectIdMock).toHaveBeenCalledWith(
      "st:1234567890:2026-07-06",
      "TASK1",
      "https://cu/TASK1",
    );
    expect(markSucceededMock).toHaveBeenCalledWith("st:1234567890:2026-07-06", {
      objectId: "TASK1",
      url: "https://cu/TASK1",
    });
  });

  it("marks the ledger failed and returns failed when create errors", async () => {
    requestMock.mockImplementation(
      async (path: string, opts?: { method?: string }) => {
        if (path === `/list/${LIST}` && !opts?.method) return ok(LIST_DETAIL);
        if (path === `/list/${LIST}/field` && !opts?.method)
          return ok({ fields: RICH_FIELDS });
        return httpErr(500, "HTTP_500");
      },
    );
    claimPushMock.mockResolvedValue({
      state: "claimed",
      record: { clickupObjectId: null, clickupUrl: null },
    });
    const res = await pushSearchTerms(baseInput);
    expect(res.status).toBe("failed");
    if (res.status === "failed") expect(res.code).toBe("HTTP_500");
    expect(markFailedMock).toHaveBeenCalledWith(
      "st:1234567890:2026-07-06",
      "HTTP_500",
    );
    expect(markSucceededMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe("pushSearchTerms — idempotency", () => {
  it("returns duplicate without creating when already succeeded", async () => {
    routeReadsAndCreate();
    claimPushMock.mockResolvedValue({
      state: "already-succeeded",
      record: { clickupObjectId: "OLD", clickupUrl: "https://cu/OLD" },
    });
    const res = await pushSearchTerms(baseInput);
    expect(res.status).toBe("duplicate");
    if (res.status === "duplicate") expect(res.objectId).toBe("OLD");
    expect(
      requestMock.mock.calls.some((c) => c[0] === `/list/${LIST}/task`),
    ).toBe(false);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("skips when another run holds the claim", async () => {
    routeReadsAndCreate();
    claimPushMock.mockResolvedValue({ state: "in-progress", record: null });
    const res = await pushSearchTerms(baseInput);
    expect(res.status).toBe("skipped");
    expect(
      requestMock.mock.calls.some((c) => c[0] === `/list/${LIST}/task`),
    ).toBe(false);
  });

  it("resumes an existing object without re-creating or re-attaching", async () => {
    routeReadsAndCreate();
    claimPushMock.mockResolvedValue({
      state: "claimed",
      record: { clickupObjectId: "TASK1", clickupUrl: "https://cu/TASK1" },
    });
    const res = await pushSearchTerms(baseInput);
    expect(res.status).toBe("pushed");
    if (res.status === "pushed") expect(res.objectId).toBe("TASK1");
    expect(
      requestMock.mock.calls.some((c) => c[0] === `/list/${LIST}/task`),
    ).toBe(false);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(markSucceededMock).toHaveBeenCalled();
  });
});
