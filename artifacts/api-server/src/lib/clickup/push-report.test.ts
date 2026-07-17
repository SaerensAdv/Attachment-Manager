import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the report push flow. They pin the safety contract end-to-end:
 * dry-run writes nothing, the location gate short-circuits, exactly-one-object
 * (claim / duplicate / in-progress / crash-resume), correct runtime field &
 * status resolution into the create body, best-effort enrichment, and a failed
 * create marking the ledger without leaking content.
 *
 * The location bridge, the idempotency ledger, the PDF renderer and the logger
 * are mocked; the request CORE is mocked so the real `tasks` resolvers/writers
 * are exercised (that's where the field/option/status mapping lives).
 */

const { requestMock, uploadMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  uploadMock: vi.fn(),
}));
const { resolveLocationMock } = vi.hoisted(() => ({
  resolveLocationMock: vi.fn(),
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
vi.mock("../report-pdf", () => ({
  renderReportPdf: vi.fn(async () => Buffer.from("PDFDATA")),
}));
vi.mock("./client", () => ({
  clickUpRequest: requestMock,
  clickUpUploadAttachment: uploadMock,
}));
vi.mock("./companies", () => ({
  resolveReportingLocation: resolveLocationMock,
}));
vi.mock("./idempotency", () => ({
  reportKey: (id: unknown, p: unknown) => `report:${id}:${p}`,
  claimPush: claimPushMock,
  recordObjectId: recordObjectIdMock,
  markSucceeded: markSucceededMock,
  markFailed: markFailedMock,
}));

import { pushReport } from "./push-report";
import type { ClickUpFieldDef } from "./types";

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
    type_config: { options: [{ id: "o-report", name: "Report" }] },
  },
  {
    id: "f-reporttype",
    name: "Report type",
    type: "drop_down",
    type_config: { options: [{ id: "o-monthly", name: "Monthly" }] },
  },
  { id: "f-start", name: "Period start", type: "date" },
  { id: "f-end", name: "Period end", type: "date" },
  { id: "f-url", name: "Report URL", type: "url" },
  { id: "f-company", name: "Company", type: "tasks" },
];

const LOCATION = {
  companyTaskId: "COMP1",
  companyName: "Schrever Cleaning",
  folderId: "FOLD",
  listId: "LIST",
  listName: "Reporting & Billing",
  statuses: [
    { status: "scheduled", type: "open" },
    { status: "drafting", type: "custom" },
  ],
  fields: RICH_FIELDS,
};

const baseInput = {
  sourceRunId: "run-42",
  clientId: 6,
  period: "2026-06",
  companyTaskId: "COMP1",
  clientReport: "# Rapport\nDe cijfers.",
  clientName: "Schrever Cleaning",
  reportUrl: "https://app/report/42",
  correlationId: "corr",
};

function routeCreateOk() {
  requestMock.mockImplementation(async (path: string, opts?: { method?: string }) => {
    if (path === "/list/LIST/task" && opts?.method === "POST")
      return ok({ id: "TASK1", url: "https://cu/TASK1" });
    if (/^\/task\/TASK1\/field\//.test(path)) return ok({});
    throw new Error(`unrouted ${path}`);
  });
}

beforeEach(() => {
  requestMock.mockReset();
  uploadMock.mockReset();
  resolveLocationMock.mockReset();
  claimPushMock.mockReset();
  recordObjectIdMock.mockReset();
  markSucceededMock.mockReset();
  markFailedMock.mockReset();
  uploadMock.mockResolvedValue(ok({ id: "att1", url: "https://cu/att1" }));
  resolveLocationMock.mockResolvedValue({ status: "resolved", location: LOCATION });
});

describe("pushReport — guards", () => {
  it("fails fast on a malformed period without touching anything", async () => {
    const res = await pushReport({ ...baseInput, period: "2026-6" });
    expect(res.status).toBe("failed");
    if (res.status === "failed") expect(res.code).toBe("BAD_PERIOD");
    expect(resolveLocationMock).not.toHaveBeenCalled();
    expect(claimPushMock).not.toHaveBeenCalled();
  });

  it("skips with reason when the location is not configured", async () => {
    resolveLocationMock.mockResolvedValue({
      status: "skipped",
      reason: "locatie niet volledig ingericht",
    });
    const res = await pushReport(baseInput);
    expect(res.status).toBe("skipped");
    if (res.status === "skipped") expect(res.reason).toMatch(/niet volledig/i);
    expect(claimPushMock).not.toHaveBeenCalled();
  });

  it("fails when the location lookup errors", async () => {
    resolveLocationMock.mockResolvedValue({
      status: "failed",
      error: { kind: "http", code: "UNAUTHORIZED", message: "x", retryable: false },
    });
    const res = await pushReport(baseInput);
    expect(res.status).toBe("failed");
    if (res.status === "failed") expect(res.code).toBe("UNAUTHORIZED");
    expect(claimPushMock).not.toHaveBeenCalled();
  });
});

describe("pushReport — dry-run", () => {
  it("returns a safe preview and writes nothing", async () => {
    const res = await pushReport({ ...baseInput, dryRun: true });
    expect(res.status).toBe("skipped");
    if (res.status === "skipped") {
      expect(res.dryRun).toBe(true);
      expect(res.preview?.name).toBe("[2026-06] Schrever Cleaning - Monthly Report");
      expect(res.preview?.status).toBe("drafting");
      expect(res.preview?.listId).toBe("LIST");
      expect(res.preview?.fieldsSet).toContain("Record type=Report");
      expect(res.preview?.fieldsSet).toContain("Company");
    }
    expect(claimPushMock).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe("pushReport — create", () => {
  it("creates the Draft task with runtime-resolved fields, enriches, and attaches once", async () => {
    routeCreateOk();
    claimPushMock.mockResolvedValue({
      state: "claimed",
      record: { clickupObjectId: null, clickupUrl: null },
    });
    const res = await pushReport(baseInput);
    expect(res.status).toBe("pushed");
    if (res.status === "pushed") expect(res.objectId).toBe("TASK1");

    const createCall = requestMock.mock.calls.find((c) => c[0] === "/list/LIST/task");
    expect(createCall).toBeTruthy();
    const body = createCall![1].body;
    expect(body.name).toBe("[2026-06] Schrever Cleaning - Monthly Report");
    expect(body.status).toBe("drafting");
    expect(body.markdown_content).toContain("Source run:** run-42");
    expect(body.custom_fields).toEqual(
      expect.arrayContaining([
        { id: "f-record", value: "o-report" },
        { id: "f-reporttype", value: "o-monthly" },
        { id: "f-start", value: Date.UTC(2026, 5, 1) },
        { id: "f-end", value: Date.UTC(2026, 6, 0) },
        { id: "f-url", value: "https://app/report/42" },
      ]),
    );

    // Company relation set after create, PDF attached once, ledger closed.
    expect(requestMock).toHaveBeenCalledWith("/task/TASK1/field/f-company", {
      correlationId: "corr",
      method: "POST",
      body: { value: { add: ["COMP1"] } },
    });
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(recordObjectIdMock).toHaveBeenCalledWith(
      "report:6:2026-06",
      "TASK1",
      "https://cu/TASK1",
    );
    expect(markSucceededMock).toHaveBeenCalledWith("report:6:2026-06", {
      objectId: "TASK1",
      url: "https://cu/TASK1",
    });
  });

  it("marks the ledger failed and returns failed when create errors", async () => {
    requestMock.mockResolvedValue(httpErr(500, "HTTP_500"));
    claimPushMock.mockResolvedValue({
      state: "claimed",
      record: { clickupObjectId: null, clickupUrl: null },
    });
    const res = await pushReport(baseInput);
    expect(res.status).toBe("failed");
    if (res.status === "failed") expect(res.code).toBe("HTTP_500");
    expect(markFailedMock).toHaveBeenCalledWith("report:6:2026-06", "HTTP_500");
    expect(markSucceededMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe("pushReport — idempotency", () => {
  it("returns duplicate without creating when already succeeded", async () => {
    claimPushMock.mockResolvedValue({
      state: "already-succeeded",
      record: { clickupObjectId: "OLD", clickupUrl: "https://cu/OLD" },
    });
    const res = await pushReport(baseInput);
    expect(res.status).toBe("duplicate");
    if (res.status === "duplicate") expect(res.objectId).toBe("OLD");
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("skips when another run holds the claim", async () => {
    claimPushMock.mockResolvedValue({ state: "in-progress", record: null });
    const res = await pushReport(baseInput);
    expect(res.status).toBe("skipped");
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("resumes an existing object without re-creating or re-attaching", async () => {
    requestMock.mockImplementation(async (path: string) => {
      if (/^\/task\/TASK1\/field\//.test(path)) return ok({});
      throw new Error(`unrouted ${path}`);
    });
    claimPushMock.mockResolvedValue({
      state: "claimed",
      record: { clickupObjectId: "TASK1", clickupUrl: "https://cu/TASK1" },
    });
    const res = await pushReport(baseInput);
    expect(res.status).toBe("pushed");
    if (res.status === "pushed") expect(res.objectId).toBe("TASK1");
    // no create call, no duplicate attachment
    expect(requestMock).not.toHaveBeenCalledWith("/list/LIST/task", expect.anything());
    expect(uploadMock).not.toHaveBeenCalled();
    expect(markSucceededMock).toHaveBeenCalled();
  });
});
