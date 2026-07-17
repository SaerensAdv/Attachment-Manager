import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the task/list layer. The pure resolvers are the heart of the
 * "never hardcode an id" contract — they map a semantic intent onto whatever a
 * specific live list actually offers — so they get the most coverage. The write
 * helpers are checked for correct request wiring (path, method, body shape),
 * with the request core mocked.
 */

const { requestMock, uploadMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  uploadMock: vi.fn(),
}));
vi.mock("./client", () => ({
  clickUpRequest: requestMock,
  clickUpUploadAttachment: uploadMock,
}));

import {
  resolveField,
  resolveDropdownOptionId,
  resolveStatus,
  createTask,
  setCustomField,
  addComment,
  getListFields,
} from "./tasks";
import type { ClickUpFieldDef, ClickUpStatusDef } from "./types";

const ok = (data: unknown) => ({ ok: true, status: 200, data });

beforeEach(() => {
  requestMock.mockReset();
  uploadMock.mockReset();
  requestMock.mockResolvedValue(ok({ id: "T1", url: "https://cu/T1" }));
});

describe("resolveField", () => {
  const fields: ClickUpFieldDef[] = [
    { id: "a", name: "Report type", type: "drop_down" },
    { id: "b", name: "Period start", type: "date" },
  ];
  it("matches case-insensitively", () => {
    expect(resolveField(fields, "report TYPE")?.id).toBe("a");
    expect(resolveField(fields, "  period start ")?.id).toBe("b");
  });
  it("returns null when absent", () => {
    expect(resolveField(fields, "Report URL")).toBeNull();
  });
});

describe("resolveDropdownOptionId", () => {
  const field: ClickUpFieldDef = {
    id: "x",
    name: "Record type",
    type: "drop_down",
    type_config: {
      options: [
        { id: "opt-report", name: "Report" },
        { id: "opt-invoice", label: "Invoice" },
      ],
    },
  };
  it("resolves by name and by label", () => {
    expect(resolveDropdownOptionId(field, "report")).toBe("opt-report");
    expect(resolveDropdownOptionId(field, "Invoice")).toBe("opt-invoice");
  });
  it("returns null for unknown option or null field", () => {
    expect(resolveDropdownOptionId(field, "Nope")).toBeNull();
    expect(resolveDropdownOptionId(null, "Report")).toBeNull();
  });
});

describe("resolveStatus", () => {
  const statuses: ClickUpStatusDef[] = [
    { status: "scheduled", type: "open" },
    { status: "collecting data", type: "custom" },
    { status: "drafting", type: "custom" },
    { status: "internal review", type: "custom" },
    { status: "sent", type: "custom" },
  ];
  it("prefers an exact semantic match", () => {
    expect(resolveStatus(statuses, ["drafting"])).toBe("drafting");
  });
  it("falls through preferred list in order", () => {
    expect(resolveStatus(statuses, ["approved-xyz", "collecting data"])).toBe(
      "collecting data",
    );
  });
  it("uses a substring match when no exact one exists", () => {
    expect(resolveStatus(statuses, ["review"])).toBe("internal review");
  });
  it("falls back to the first open status when nothing matches", () => {
    expect(resolveStatus(statuses, ["nonexistent"])).toBe("scheduled");
  });
  it("returns null for an empty list", () => {
    expect(resolveStatus([], ["drafting"])).toBeNull();
  });
});

describe("getListFields", () => {
  it("unwraps the fields array", async () => {
    requestMock.mockResolvedValueOnce(
      ok({ fields: [{ id: "a", name: "X", type: "text" }] }),
    );
    const res = await getListFields("L1", "corr");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toHaveLength(1);
  });
  it("defaults to an empty array when fields is missing", async () => {
    requestMock.mockResolvedValueOnce(ok({}));
    const res = await getListFields("L1", "corr");
    expect(res.ok && res.data).toEqual([]);
  });
  it("passes through a failure", async () => {
    requestMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      error: { kind: "http", code: "NOT_FOUND", message: "x", retryable: false },
    });
    const res = await getListFields("L1", "corr");
    expect(res.ok).toBe(false);
  });
});

describe("createTask", () => {
  it("wires name, markdown, status and custom fields into the POST body", async () => {
    await createTask(
      "L1",
      {
        name: "[2026-06] Schrever - Monthly Report",
        markdown: "# Report\nlink",
        status: "drafting",
        customFields: [{ id: "f1", value: "opt-report" }],
      },
      "corr",
    );
    expect(requestMock).toHaveBeenCalledWith("/list/L1/task", {
      correlationId: "corr",
      method: "POST",
      body: {
        name: "[2026-06] Schrever - Monthly Report",
        markdown_content: "# Report\nlink",
        status: "drafting",
        custom_fields: [{ id: "f1", value: "opt-report" }],
      },
    });
  });
  it("omits optional keys when not provided", async () => {
    await createTask("L1", { name: "Bare" }, "corr");
    const body = requestMock.mock.calls[0][1].body;
    expect(body).toEqual({ name: "Bare" });
  });
});

describe("setCustomField / addComment", () => {
  it("posts a custom field value", async () => {
    await setCustomField("T1", "F1", { add: ["C1"] }, "corr");
    expect(requestMock).toHaveBeenCalledWith("/task/T1/field/F1", {
      correlationId: "corr",
      method: "POST",
      body: { value: { add: ["C1"] } },
    });
  });
  it("posts a comment as comment_text", async () => {
    await addComment("T1", "hello", "corr");
    expect(requestMock).toHaveBeenCalledWith("/task/T1/comment", {
      correlationId: "corr",
      method: "POST",
      body: { comment_text: "hello" },
    });
  });
});
