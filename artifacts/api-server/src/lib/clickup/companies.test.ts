import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the client -> report-location bridge. The whole point of this module
 * is safety: resolve a REAL, fully-configured Reporting & Billing location or
 * skip with a Dutch reason — never guess a list, never write to a half-set-up
 * one. So the tests drive `resolveReportingLocation` end-to-end over a routed
 * mock of the request core and assert the resolved/skipped/failed branches, plus
 * the pure helpers that make the decision.
 */

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock("./client", () => ({
  clickUpRequest: requestMock,
  clickUpUploadAttachment: vi.fn(),
}));

import {
  resolveReportingLocation,
  resetBridgeCacheForTests,
  matchFolderByCompanyName,
  parseFolderId,
  deliveryFolderValue,
  findReportingList,
  hasReportFieldSet,
} from "./companies";
import type { ClickUpFieldDef, ClickUpFolder } from "./types";

const ok = (data: unknown) => ({ ok: true, status: 200, data });
const httpErr = (status: number, code: string) => ({
  ok: false,
  status,
  error: { kind: "http", code, message: "x", retryable: status >= 500 },
});

/** The rich field set that marks a fully-configured Reporting & Billing list. */
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

/** A reduced field set (a non-configured client's list). */
const POOR_FIELDS: ClickUpFieldDef[] = [
  { id: "f-amount", name: "Amount excl VAT", type: "currency" },
];

const SCHREVER_FOLDER: ClickUpFolder = {
  id: "901516752284",
  name: "CLI-006 Schrever Cleaning",
  lists: [
    { id: "L-overview", name: "Overview" },
    { id: "901524400217", name: "Reporting & Billing" },
  ],
};

/**
 * Route a mocked clickUpRequest by path. Overrides let a test swap in the
 * failing/edge responses it needs.
 */
function routeRequest(overrides: Record<string, unknown> = {}) {
  requestMock.mockImplementation(async (path: string) => {
    if (path in overrides) return overrides[path];
    if (path === "/team") return ok({ teams: [{ id: "TEAM", name: "Saerens Advertising" }] });
    if (path === "/team/TEAM/space")
      return ok({ spaces: [{ id: "SPACE", name: "02 Client Delivery" }] });
    if (path === "/space/SPACE/folder") return ok({ folders: [SCHREVER_FOLDER] });
    if (path === "/task/COMP1")
      return ok({ id: "COMP1", name: "Schrever Cleaning", custom_fields: [] });
    if (path === "/list/901524400217") return ok({ id: "901524400217", name: "Reporting & Billing", statuses: [{ status: "scheduled", type: "open" }, { status: "drafting", type: "custom" }] });
    if (path === "/list/901524400217/field") return ok({ fields: RICH_FIELDS });
    throw new Error(`unrouted path: ${path}`);
  });
}

beforeEach(() => {
  requestMock.mockReset();
  resetBridgeCacheForTests();
  delete process.env.CLICKUP_TEAM_ID;
  delete process.env.CLICKUP_DELIVERY_SPACE_ID;
});

describe("pure helpers", () => {
  it("deliveryFolderValue reads the field value case-insensitively", () => {
    expect(
      deliveryFolderValue({
        id: "C",
        custom_fields: [{ name: "delivery FOLDER", value: "https://x/1" }],
      }),
    ).toBe("https://x/1");
    expect(deliveryFolderValue({ id: "C", custom_fields: [] })).toBeNull();
  });

  it("parseFolderId extracts an id from a folder URL", () => {
    expect(parseFolderId("https://app.clickup.com/x/folder/901516752284/board")).toBe(
      "901516752284",
    );
    expect(parseFolderId("not a url")).toBeNull();
  });

  it("matchFolderByCompanyName matches one, skips zero and ambiguous", () => {
    const folders: ClickUpFolder[] = [
      { id: "1", name: "CLI-006 Schrever Cleaning" },
      { id: "2", name: "CLI-001 Icon BV" },
    ];
    expect(matchFolderByCompanyName(folders, "Schrever Cleaning").folder?.id).toBe("1");
    expect(matchFolderByCompanyName(folders, "Nobody").folder).toBeNull();
    const dup = matchFolderByCompanyName(
      [
        { id: "1", name: "CLI-006 Schrever Cleaning" },
        { id: "2", name: "CLI-007 Schrever Cleaning Zuid" },
      ],
      "Schrever Cleaning",
    );
    expect(dup.folder).toBeNull();
    expect(dup.ambiguous).toBe(true);
  });

  it("findReportingList finds the R&B list", () => {
    expect(findReportingList(SCHREVER_FOLDER)?.id).toBe("901524400217");
    expect(findReportingList({ id: "x", name: "y", lists: [] })).toBeNull();
  });

  it("hasReportFieldSet gates on the full field set", () => {
    expect(hasReportFieldSet(RICH_FIELDS)).toBe(true);
    expect(hasReportFieldSet(POOR_FIELDS)).toBe(false);
    // present fields but the Record type dropdown lacks a "Report" option
    const noReportOption = RICH_FIELDS.map((f) =>
      f.id === "f-record" ? { ...f, type_config: { options: [{ id: "o", name: "Invoice" }] } } : f,
    );
    expect(hasReportFieldSet(noReportOption)).toBe(false);
  });
});

describe("resolveReportingLocation", () => {
  it("skips when the client has no linked ClickUp company", async () => {
    const res = await resolveReportingLocation({
      companyTaskId: null,
      correlationId: "corr",
    });
    expect(res.status).toBe("skipped");
    if (res.status === "skipped") expect(res.reason).toMatch(/geen ClickUp-company/i);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("resolves a fully-configured location via name-match", async () => {
    routeRequest();
    const res = await resolveReportingLocation({
      companyTaskId: "COMP1",
      correlationId: "corr",
    });
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") {
      expect(res.location.listId).toBe("901524400217");
      expect(res.location.companyName).toBe("Schrever Cleaning");
      expect(res.location.statuses.map((s) => s.status)).toContain("drafting");
    }
  });

  it("skips when the R&B list is not fully configured", async () => {
    routeRequest({ "/list/901524400217/field": ok({ fields: POOR_FIELDS }) });
    const res = await resolveReportingLocation({
      companyTaskId: "COMP1",
      correlationId: "corr",
    });
    expect(res.status).toBe("skipped");
    if (res.status === "skipped") expect(res.reason).toMatch(/niet volledig ingericht/i);
  });

  it("skips when no delivery folder matches the company name", async () => {
    routeRequest({
      "/task/COMP1": ok({ id: "COMP1", name: "Unknown BV", custom_fields: [] }),
    });
    const res = await resolveReportingLocation({
      companyTaskId: "COMP1",
      correlationId: "corr",
    });
    expect(res.status).toBe("skipped");
    if (res.status === "skipped") expect(res.reason).toMatch(/geen delivery-folder/i);
  });

  it("fails when reading the company task errors", async () => {
    routeRequest({ "/task/COMP1": httpErr(401, "UNAUTHORIZED") });
    const res = await resolveReportingLocation({
      companyTaskId: "COMP1",
      correlationId: "corr",
    });
    expect(res.status).toBe("failed");
    if (res.status === "failed") expect(res.error.code).toBe("UNAUTHORIZED");
  });

  it("uses the explicit Delivery folder field before name-matching", async () => {
    routeRequest({
      "/task/COMP1": ok({
        id: "COMP1",
        name: "Schrever Cleaning",
        custom_fields: [
          { name: "Delivery folder", value: "https://app.clickup.com/x/folder/901516752284/board" },
        ],
      }),
      "/folder/901516752284": ok(SCHREVER_FOLDER),
    });
    const res = await resolveReportingLocation({
      companyTaskId: "COMP1",
      correlationId: "corr",
    });
    expect(res.status).toBe("resolved");
    // space/folder listing must NOT be consulted when the explicit field resolves
    expect(requestMock).not.toHaveBeenCalledWith("/space/SPACE/folder", expect.anything());
  });
});
