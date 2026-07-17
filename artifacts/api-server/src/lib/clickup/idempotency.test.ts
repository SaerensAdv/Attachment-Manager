import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the push idempotency ledger. The claim lifecycle is the heart
 * of "exactly one ClickUp object per logical push", so we pin every branch:
 * a fresh claim proceeds, a completed push short-circuits, a live concurrent
 * claim is refused (skip, no duplicate), and a stale/crashed row with an object
 * id is reclaimed for resume. `@workspace/db` is mocked so no pool is opened;
 * `pool.query` is routed by the SQL text so we can drive each scenario.
 */

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("@workspace/db", () => ({ pool: { query: queryMock } }));
vi.mock("../logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  reportKey,
  searchTermsKey,
  alertKey,
  claimPush,
  markSucceeded,
  markFailed,
  recordObjectId,
} from "./idempotency";

function dbRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    kind: "report",
    idempotency_key: "report:5:2026-06",
    source_run_id: "42",
    clickup_object_id: null,
    clickup_url: null,
    status: "pending",
    attempts: 0,
    last_error_code: null,
    created_at: new Date("2026-07-01T00:00:00Z"),
    updated_at: new Date("2026-07-01T00:00:00Z"),
    ...over,
  };
}

/** Route pool.query by SQL so each test can set the SELECT / claim results. */
function routeQuery(opts: {
  existing?: Record<string, unknown>[];
  claim?: Record<string, unknown>[];
}): void {
  queryMock.mockImplementation(async (sql: string) => {
    if (/CREATE (TABLE|UNIQUE INDEX|INDEX)/.test(sql)) return { rows: [] };
    if (/^\s*INSERT INTO clickup_push_records/.test(sql)) return { rows: [] };
    if (/SELECT \* FROM clickup_push_records/.test(sql))
      return { rows: opts.existing ?? [] };
    if (/SET status = 'processing'/.test(sql)) return { rows: opts.claim ?? [] };
    return { rows: [] };
  });
}

describe("idempotency key builders", () => {
  it("build stable, prefixed keys", () => {
    expect(reportKey(5, "2026-06")).toBe("report:5:2026-06");
    expect(searchTermsKey("123-456", "2026-07-13")).toBe("st:123-456:2026-07-13");
    expect(alertKey("fp-abc", 1700000000000)).toBe("alert:fp-abc:1700000000000");
  });
});

describe("claimPush", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("claims a fresh key (pending -> processing)", async () => {
    routeQuery({
      existing: [dbRow({ status: "pending" })],
      claim: [dbRow({ status: "processing", attempts: 1 })],
    });
    const res = await claimPush({
      kind: "report",
      idempotencyKey: "report:5:2026-06",
      sourceRunId: "42",
    });
    expect(res.state).toBe("claimed");
    if (res.state === "claimed") {
      expect(res.record.status).toBe("processing");
      expect(res.record.clickupObjectId).toBeNull();
    }
    // An insert-if-absent must have been attempted.
    const insertCall = queryMock.mock.calls.find((c) =>
      /INSERT INTO clickup_push_records/.test(c[0] as string),
    );
    expect(insertCall).toBeTruthy();
  });

  it("short-circuits an already-succeeded push (no re-create)", async () => {
    routeQuery({
      existing: [
        dbRow({ status: "succeeded", clickup_object_id: "TASK99", clickup_url: "u" }),
      ],
    });
    const res = await claimPush({
      kind: "report",
      idempotencyKey: "report:5:2026-06",
    });
    expect(res.state).toBe("already-succeeded");
    if (res.state === "already-succeeded") {
      expect(res.record.clickupObjectId).toBe("TASK99");
    }
    // Must NOT attempt the claim UPDATE once already succeeded.
    const claimCall = queryMock.mock.calls.find((c) =>
      /SET status = 'processing'/.test(c[0] as string),
    );
    expect(claimCall).toBeFalsy();
  });

  it("refuses a live concurrent claim (in-progress, skip)", async () => {
    routeQuery({
      existing: [dbRow({ status: "processing" })],
      claim: [], // CAS lost — another worker holds it
    });
    const res = await claimPush({
      kind: "alert",
      idempotencyKey: "alert:fp:1",
    });
    expect(res.state).toBe("in-progress");
  });

  it("reclaims a stale/crashed row that already has an object id (resume)", async () => {
    routeQuery({
      existing: [dbRow({ status: "processing", clickup_object_id: "TASK7" })],
      claim: [dbRow({ status: "processing", clickup_object_id: "TASK7", attempts: 2 })],
    });
    const res = await claimPush({
      kind: "report",
      idempotencyKey: "report:5:2026-06",
    });
    expect(res.state).toBe("claimed");
    if (res.state === "claimed") {
      // Object id present => caller resumes enrichment instead of re-creating.
      expect(res.record.clickupObjectId).toBe("TASK7");
    }
  });
});

describe("close-out helpers", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
  });

  it("markSucceeded sets status succeeded for the key", async () => {
    await markSucceeded("report:5:2026-06", { objectId: "T1", url: "u" });
    const call = queryMock.mock.calls.find((c) =>
      /SET status = 'succeeded'/.test(c[0] as string),
    );
    expect(call).toBeTruthy();
    expect((call as unknown[])[1]).toEqual(["report:5:2026-06", "T1", "u"]);
  });

  it("markFailed records a truncated error code", async () => {
    await markFailed("report:5:2026-06", "x".repeat(500));
    const call = queryMock.mock.calls.find((c) =>
      /SET status = 'failed'/.test(c[0] as string),
    );
    expect(call).toBeTruthy();
    const params = (call as unknown[])[1] as string[];
    expect(params[0]).toBe("report:5:2026-06");
    expect(params[1].length).toBe(200);
  });

  it("recordObjectId persists the object id + url", async () => {
    await recordObjectId("report:5:2026-06", "TASK1", "https://app.clickup.com/t/TASK1");
    const call = queryMock.mock.calls.find((c) =>
      /SET clickup_object_id/.test(c[0] as string),
    );
    expect(call).toBeTruthy();
    expect((call as unknown[])[1]).toEqual([
      "report:5:2026-06",
      "TASK1",
      "https://app.clickup.com/t/TASK1",
    ]);
  });
});
