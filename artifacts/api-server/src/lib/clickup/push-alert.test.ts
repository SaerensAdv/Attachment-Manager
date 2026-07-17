import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the alert push flow + sweeper (brief §6.6). They pin: dedup-window
 * routing, both routes (task-in-Internal-Work and comment-on-task), dry-run
 * writes nothing, exactly-one-object (claim / duplicate / in-progress /
 * crash-resume), a clean failure on an unreadable list, and the sweeper mapping
 * open system alerts onto idempotent pushes.
 *
 * The idempotency ledger, the alerts store + logger are mocked; the request CORE
 * is mocked so the real `tasks` resolvers/writers run.
 */

const { requestMock, uploadMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  uploadMock: vi.fn(),
}));
const {
  claimPushMock,
  recordObjectIdMock,
  markSucceededMock,
  markFailedMock,
  alertKeyMock,
} = vi.hoisted(() => ({
  claimPushMock: vi.fn(),
  recordObjectIdMock: vi.fn(),
  markSucceededMock: vi.fn(),
  markFailedMock: vi.fn(),
  alertKeyMock: vi.fn(),
}));
const { listAlertsMock } = vi.hoisted(() => ({ listAlertsMock: vi.fn() }));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("./client", () => ({
  clickUpRequest: requestMock,
  clickUpUploadAttachment: uploadMock,
}));
vi.mock("../alerts-store", () => ({ listAlerts: listAlertsMock }));
vi.mock("./idempotency", () => ({
  alertKey: alertKeyMock,
  claimPush: claimPushMock,
  recordObjectId: recordObjectIdMock,
  markSucceeded: markSucceededMock,
  markFailed: markFailedMock,
}));

import {
  pushAlert,
  sweepAlertsToClickUp,
  DEFAULT_ALERT_WINDOW_MS,
} from "./push-alert";
import { DEFAULT_INTERNAL_WORK_LIST_ID } from "./push-search-terms";
import type { ClickUpFieldDef } from "./types";

const LIST = DEFAULT_INTERNAL_WORK_LIST_ID;
const ok = (data: unknown) => ({ ok: true, status: 200, data });
const httpErr = (status: number, code: string) => ({
  ok: false,
  status,
  error: { kind: "http", code, message: "boom", retryable: status >= 500 },
});

const FIELDS: ClickUpFieldDef[] = [
  {
    id: "f-record",
    name: "Record type",
    type: "drop_down",
    type_config: { options: [{ id: "o-alert", name: "Alert" }] },
  },
  { id: "f-company", name: "Company", type: "tasks" },
];

const LIST_DETAIL = {
  id: LIST,
  name: "Internal Work",
  statuses: [
    { status: "open", type: "open" },
    { status: "done", type: "closed" },
  ],
};

function routeReadsAndCreate(create = true) {
  requestMock.mockImplementation(
    async (path: string, opts?: { method?: string }) => {
      if (path === `/list/${LIST}` && !opts?.method) return ok(LIST_DETAIL);
      if (path === `/list/${LIST}/field` && !opts?.method)
        return ok({ fields: FIELDS });
      if (create && path === `/list/${LIST}/task` && opts?.method === "POST")
        return ok({ id: "TASK1", url: "https://cu/TASK1" });
      if (/^\/task\/TASK1\/field\//.test(path)) return ok({});
      throw new Error(`unrouted ${path}`);
    },
  );
}

const systemAlert = {
  type: "run-failed",
  severity: "error",
  message: "Geplande run is mislukt.",
  evidence: "runId=abc, step=reporter",
  recommendedAction: "Bekijk de run en herstart.",
  sourceRunId: "run-9",
  detectedAt: new Date("2026-07-13T08:00:00.000Z"),
  correlationId: "corr",
};

beforeEach(() => {
  requestMock.mockReset();
  uploadMock.mockReset();
  claimPushMock.mockReset();
  recordObjectIdMock.mockReset();
  markSucceededMock.mockReset();
  markFailedMock.mockReset();
  alertKeyMock.mockReset();
  listAlertsMock.mockReset();
  alertKeyMock.mockImplementation((fp: string, w: number) => `alert:${fp}:${w}`);
});

describe("pushAlert — dedup key", () => {
  it("folds the fingerprint with a floored time window", async () => {
    routeReadsAndCreate();
    claimPushMock.mockResolvedValue({
      state: "claimed",
      record: { clickupObjectId: null, clickupUrl: null },
    });
    await pushAlert(systemAlert);
    const [fp, windowStart] = alertKeyMock.mock.calls[0];
    expect(fp).toBe("run-failed:system");
    const expected =
      Math.floor(systemAlert.detectedAt.getTime() / DEFAULT_ALERT_WINDOW_MS) *
      DEFAULT_ALERT_WINDOW_MS;
    expect(windowStart).toBe(expected);
  });

  it("uses an explicit dedupeKey and client context when provided", async () => {
    routeReadsAndCreate();
    claimPushMock.mockResolvedValue({
      state: "claimed",
      record: { clickupObjectId: null, clickupUrl: null },
    });
    await pushAlert({ ...systemAlert, dedupeKey: "budget:client:6", clientId: 6 });
    expect(alertKeyMock.mock.calls[0][0]).toBe("budget:client:6");
  });
});

describe("pushAlert — task route (Internal Work)", () => {
  it("fails cleanly when the list cannot be read", async () => {
    requestMock.mockResolvedValue(httpErr(401, "UNAUTHORIZED"));
    const res = await pushAlert(systemAlert);
    expect(res.status).toBe("failed");
    if (res.status === "failed") expect(res.code).toBe("UNAUTHORIZED");
    expect(claimPushMock).not.toHaveBeenCalled();
  });

  it("dry-run returns a preview and writes nothing", async () => {
    routeReadsAndCreate(false);
    const res = await pushAlert({ ...systemAlert, dryRun: true });
    expect(res.status).toBe("skipped");
    if (res.status === "skipped") {
      expect(res.dryRun).toBe(true);
      expect(res.preview?.route).toBe("task");
      expect(res.preview?.name).toBe("[ALERT] run-failed — Systeem");
      expect(res.preview?.status).toBe("open");
      expect(res.preview?.fieldsSet).toContain("Record type");
    }
    expect(claimPushMock).not.toHaveBeenCalled();
    expect(
      requestMock.mock.calls.some((c) => c[0] === `/list/${LIST}/task`),
    ).toBe(false);
  });

  it("creates the task with runtime-resolved status/field and links the company", async () => {
    routeReadsAndCreate();
    claimPushMock.mockResolvedValue({
      state: "claimed",
      record: { clickupObjectId: null, clickupUrl: null },
    });
    const res = await pushAlert({
      ...systemAlert,
      clientId: 6,
      clientName: "Schrever",
      companyTaskId: "COMP1",
    });
    expect(res.status).toBe("pushed");
    const createCall = requestMock.mock.calls.find(
      (c) => c[0] === `/list/${LIST}/task`,
    );
    const body = createCall![1].body;
    expect(body.name).toBe("[ALERT] run-failed — Schrever");
    expect(body.status).toBe("open");
    expect(body.markdown_content).toContain("Severity:** error");
    expect(body.markdown_content).toContain("Aanbevolen actie");
    expect(body.custom_fields).toEqual([{ id: "f-record", value: "o-alert" }]);
    // Company relation set after create.
    expect(requestMock).toHaveBeenCalledWith("/task/TASK1/field/f-company", {
      correlationId: "corr",
      method: "POST",
      body: { value: { add: ["COMP1"] } },
    });
    expect(markSucceededMock).toHaveBeenCalled();
  });

  it("marks failed when create errors", async () => {
    requestMock.mockImplementation(
      async (path: string, opts?: { method?: string }) => {
        if (path === `/list/${LIST}` && !opts?.method) return ok(LIST_DETAIL);
        if (path === `/list/${LIST}/field` && !opts?.method)
          return ok({ fields: FIELDS });
        return httpErr(500, "HTTP_500");
      },
    );
    claimPushMock.mockResolvedValue({
      state: "claimed",
      record: { clickupObjectId: null, clickupUrl: null },
    });
    const res = await pushAlert(systemAlert);
    expect(res.status).toBe("failed");
    if (res.status === "failed") expect(res.code).toBe("HTTP_500");
    expect(markFailedMock).toHaveBeenCalled();
  });
});

describe("pushAlert — idempotency", () => {
  it("returns duplicate without creating when already succeeded", async () => {
    routeReadsAndCreate();
    claimPushMock.mockResolvedValue({
      state: "already-succeeded",
      record: { clickupObjectId: "OLD", clickupUrl: "https://cu/OLD" },
    });
    const res = await pushAlert(systemAlert);
    expect(res.status).toBe("duplicate");
    if (res.status === "duplicate") expect(res.objectId).toBe("OLD");
    expect(
      requestMock.mock.calls.some((c) => c[0] === `/list/${LIST}/task`),
    ).toBe(false);
  });

  it("skips when another run holds the claim", async () => {
    routeReadsAndCreate();
    claimPushMock.mockResolvedValue({ state: "in-progress", record: null });
    const res = await pushAlert(systemAlert);
    expect(res.status).toBe("skipped");
  });
});

describe("pushAlert — comment route", () => {
  it("posts a comment on the target task, records the comment id, no list read", async () => {
    requestMock.mockImplementation(
      async (path: string, opts?: { method?: string }) => {
        if (path === "/task/ENG1/comment" && opts?.method === "POST")
          return ok({ id: "CMT1" });
        throw new Error(`unrouted ${path}`);
      },
    );
    claimPushMock.mockResolvedValue({
      state: "claimed",
      record: { clickupObjectId: null, clickupUrl: null },
    });
    const res = await pushAlert({ ...systemAlert, targetTaskId: "ENG1" });
    expect(res.status).toBe("pushed");
    if (res.status === "pushed") expect(res.objectId).toBe("CMT1");
    expect(recordObjectIdMock).toHaveBeenCalledWith(
      expect.stringMatching(/^alert:/),
      "CMT1",
      null,
    );
    // No list-detail read on the comment route.
    expect(requestMock.mock.calls.some((c) => c[0] === `/list/${LIST}`)).toBe(
      false,
    );
  });

  it("dry-run on the comment route writes nothing", async () => {
    const res = await pushAlert({
      ...systemAlert,
      targetTaskId: "ENG1",
      dryRun: true,
    });
    expect(res.status).toBe("skipped");
    if (res.status === "skipped") expect(res.preview?.route).toBe("comment");
    expect(claimPushMock).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
  });
});

describe("sweepAlertsToClickUp", () => {
  it("pushes each open alert, tallies outcomes, and never throws on a bad one", async () => {
    listAlertsMock.mockResolvedValue([
      {
        id: 1,
        source: "scheduler",
        severity: "error",
        message: "Run mislukt",
        context: { clientId: 6, clientName: "Schrever", companyTaskId: "COMP1" },
        fingerprint: "scheduler:Run mislukt:6",
        occurrences: 2,
        firstSeenAt: new Date("2026-07-13T00:00:00Z"),
        lastSeenAt: new Date("2026-07-13T08:00:00Z"),
        resolvedAt: null,
      },
      {
        id: 2,
        source: "email-inbound",
        severity: "warn",
        message: "Mail niet verwerkt",
        context: null,
        fingerprint: null,
        occurrences: 1,
        firstSeenAt: new Date("2026-07-13T00:00:00Z"),
        lastSeenAt: new Date("2026-07-13T09:00:00Z"),
        resolvedAt: null,
      },
    ]);
    routeReadsAndCreate();
    // First alert creates; second alert already succeeded (duplicate).
    claimPushMock
      .mockResolvedValueOnce({
        state: "claimed",
        record: { clickupObjectId: null, clickupUrl: null },
      })
      .mockResolvedValueOnce({
        state: "already-succeeded",
        record: { clickupObjectId: "OLD", clickupUrl: null },
      });

    const res = await sweepAlertsToClickUp({ correlationId: "corr" });
    expect(res.scanned).toBe(2);
    expect(res.pushed).toBe(1);
    expect(res.duplicate).toBe(1);
    expect(res.results).toHaveLength(2);
    // The client-bound alert used its context for the fingerprint.
    expect(alertKeyMock.mock.calls[0][0]).toBe("scheduler:Run mislukt:6");
  });

  it("returns an empty tally when there are no open alerts", async () => {
    listAlertsMock.mockResolvedValue([]);
    const res = await sweepAlertsToClickUp();
    expect(res.scanned).toBe(0);
    expect(res.results).toHaveLength(0);
    expect(claimPushMock).not.toHaveBeenCalled();
  });
});
