import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

/**
 * HTTP-contract tests for the "Te doen" overview through Express + supertest.
 * The three source stores are mocked so we can drive each section independently
 * and assert two behaviours that matter most:
 *  - the held-deliverable `kind` is parsed TOLERANTLY (valid JSON, malformed
 *    JSON, and a snapshot with no `kind` must never throw), and
 *  - the aggregate is best-effort: one failing store degrades that section to []
 *    while the others still populate.
 *
 * The serializers (serializeProposal/serializeAlert) are mocked to identity-ish
 * stubs — their shaping is covered by their own routes' tests; here we only care
 * about aggregation + parsing.
 */

const listPendingProposalsMock = vi.hoisted(() => vi.fn());
const listPendingApprovalsMock = vi.hoisted(() => vi.fn());
const listAlertsMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/proposals-store", () => ({
  listPendingProposals: listPendingProposalsMock,
}));
vi.mock("../lib/generations-store", () => ({
  listPendingApprovals: listPendingApprovalsMock,
}));
vi.mock("../lib/alerts-store", () => ({
  listAlerts: listAlertsMock,
}));
vi.mock("./generations", () => ({
  serializeProposal: (p: unknown) => p,
}));
vi.mock("./alerts", () => ({
  serializeAlert: (a: unknown) => a,
}));

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
  it("aggregates the three sources and parses the held-deliverable kind", async () => {
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
        pendingDelivery: "{ this is : not json",
        createdAt,
      },
      {
        id: 102,
        clientName: "X",
        workflowTitle: "Y",
        pendingDelivery: JSON.stringify({ foo: "bar" }),
        createdAt,
      },
      {
        id: 103,
        clientName: "Z",
        workflowTitle: "W",
        pendingDelivery: null,
        createdAt,
      },
    ]);

    const app = await makeApp();
    const res = await request(app).get("/todo");

    expect(res.status).toBe(200);
    expect(res.body.pendingProposals).toEqual([{ id: 1, status: "pending" }]);
    expect(res.body.unresolvedAlerts).toEqual([{ id: 9, source: "scheduler" }]);

    const approvals = res.body.pendingApprovals;
    expect(approvals).toHaveLength(4);
    expect(approvals[0]).toEqual({
      generationId: 100,
      clientName: "Saerens",
      workflowTitle: "Maandrapport",
      kind: "monthly-report-email",
      createdAt: createdAt.toISOString(),
    });
    // Malformed JSON, missing kind, and null snapshot all degrade to null.
    expect(approvals[1].kind).toBeNull();
    expect(approvals[2].kind).toBeNull();
    expect(approvals[3].kind).toBeNull();
  });

  it("is best-effort: a failing store degrades only its own section", async () => {
    listPendingProposalsMock.mockRejectedValue(new Error("proposals down"));
    listAlertsMock.mockResolvedValue([{ id: 9 }]);
    listPendingApprovalsMock.mockResolvedValue([]);

    const app = await makeApp();
    const res = await request(app).get("/todo");

    expect(res.status).toBe(200);
    expect(res.body.pendingProposals).toEqual([]);
    expect(res.body.unresolvedAlerts).toEqual([{ id: 9 }]);
    expect(res.body.pendingApprovals).toEqual([]);
  });
});
