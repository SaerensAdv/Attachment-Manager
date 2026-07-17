import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const listPendingProposalsMock = vi.hoisted(() => vi.fn());
const listPendingApprovalsMock = vi.hoisted(() => vi.fn());
const listAlertsMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/proposals-store", () => ({
  listPendingProposals: listPendingProposalsMock,
}));
vi.mock("../lib/generations-store", () => ({
  listPendingApprovals: listPendingApprovalsMock,
}));
vi.mock("../lib/alerts-store", () => ({ listAlerts: listAlertsMock }));
vi.mock("./generations", () => ({ serializeProposal: (p: unknown) => p }));
vi.mock("./alerts", () => ({ serializeAlert: (a: unknown) => a }));

async function makeApp(): Promise<Express> {
  vi.resetModules();
  const { default: todoRouter } = await import("./todo");
  const app = express();
  app.use(todoRouter);
  return app;
}

beforeEach(() => {
  listPendingProposalsMock.mockReset();
  listPendingApprovalsMock.mockReset();
  listAlertsMock.mockReset();
  listPendingProposalsMock.mockResolvedValue([]);
  listPendingApprovalsMock.mockResolvedValue([]);
  listAlertsMock.mockResolvedValue([]);
});

describe("GET /todo", () => {
  it("keeps the legacy arrays and reports healthy section status", async () => {
    listPendingProposalsMock.mockResolvedValue([{ id: 1, status: "pending" }]);
    listAlertsMock.mockResolvedValue([{ id: 9, source: "scheduler" }]);
    const createdAt = new Date("2026-06-10T08:00:00Z");
    listPendingApprovalsMock.mockResolvedValue([
      {
        id: 100,
        clientName: "Saerens",
        workflowTitle: "Maandrapport",
        pendingDelivery: JSON.stringify({ kind: "monthly-report-email" }),
        createdAt,
      },
      {
        id: 101,
        clientName: null,
        workflowTitle: "Intern",
        pendingDelivery: "{ broken",
        createdAt,
      },
    ]);

    const res = await request(await makeApp()).get("/todo");
    expect(res.status).toBe(200);
    expect(res.body.pendingProposals).toEqual([{ id: 1, status: "pending" }]);
    expect(res.body.unresolvedAlerts).toEqual([{ id: 9, source: "scheduler" }]);
    expect(res.body.pendingApprovals[0].kind).toBe("monthly-report-email");
    expect(res.body.pendingApprovals[1].kind).toBeNull();
    expect(res.body.sections.pendingApprovals).toEqual({
      status: "ok",
      count: 2,
      errorCode: null,
    });
    expect(res.body.partial).toBe(false);
  });

  it("marks a failed source unavailable instead of pretending it is empty", async () => {
    listPendingProposalsMock.mockRejectedValue(new Error("proposals down"));
    listAlertsMock.mockResolvedValue([{ id: 9 }]);

    const res = await request(await makeApp()).get("/todo");
    expect(res.status).toBe(200);
    expect(res.body.pendingProposals).toEqual([]);
    expect(res.body.sections.pendingProposals).toEqual({
      status: "unavailable",
      count: 0,
      errorCode: "PROPOSALS_UNAVAILABLE",
    });
    expect(res.body.sections.unresolvedAlerts.status).toBe("ok");
    expect(res.body.partial).toBe(true);
  });
});
