import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

/**
 * HTTP-contract tests for the proposal accept/reject routes through Express +
 * supertest. The store and the apply/verify helpers are mocked so we can assert
 * the accept response now carries the verified apply result ({ proposal, changed,
 * verified }) the UI shows, and that an apply failure still reverts the claim and
 * returns a 502 with a detail message.
 */

const getProposalMock = vi.hoisted(() => vi.fn());
const claimProposalStatusMock = vi.hoisted(() => vi.fn());
const revertProposalToPendingMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/proposals-store", () => ({
  getProposal: getProposalMock,
  claimProposalStatus: claimProposalStatusMock,
  revertProposalToPending: revertProposalToPendingMock,
}));

const applyProposalMock = vi.hoisted(() => vi.fn());
const verifyProposalAppliedMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/improvements", () => ({
  applyProposal: applyProposalMock,
  verifyProposalApplied: verifyProposalAppliedMock,
}));

vi.mock("./generations", () => ({
  serializeProposal: (p: unknown) => p,
}));

async function makeApp(): Promise<Express> {
  vi.resetModules();
  const { default: proposalsRouter } = await import("./proposals");
  const app = express();
  app.use(proposalsRouter);
  return app;
}

const CLAIMED = { id: 4, status: "accepted", targetLabel: "Replit Builds" };

beforeEach(() => {
  getProposalMock.mockReset();
  claimProposalStatusMock.mockReset();
  revertProposalToPendingMock.mockReset();
  revertProposalToPendingMock.mockResolvedValue(undefined);
  applyProposalMock.mockReset();
  verifyProposalAppliedMock.mockReset();
});

describe("POST /proposals/:id/accept", () => {
  it("returns the proposal with a verified apply result on success", async () => {
    claimProposalStatusMock.mockResolvedValue(CLAIMED);
    applyProposalMock.mockResolvedValue({ changed: true });
    verifyProposalAppliedMock.mockResolvedValue({ present: true });
    const app = await makeApp();

    const res = await request(app).post("/proposals/4/accept");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      proposal: CLAIMED,
      changed: true,
      verified: true,
    });
    expect(applyProposalMock).toHaveBeenCalledWith(CLAIMED);
    expect(revertProposalToPendingMock).not.toHaveBeenCalled();
  });

  it("reports changed=false / verified=true when the rule was already present", async () => {
    claimProposalStatusMock.mockResolvedValue(CLAIMED);
    applyProposalMock.mockResolvedValue({ changed: false });
    verifyProposalAppliedMock.mockResolvedValue({ present: true });
    const app = await makeApp();

    const res = await request(app).post("/proposals/4/accept");

    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(false);
    expect(res.body.verified).toBe(true);
  });

  it("reverts the claim and returns 502 with a detail when apply fails", async () => {
    claimProposalStatusMock.mockResolvedValue(CLAIMED);
    applyProposalMock.mockRejectedValue(new Error("Doeldocument bestaat niet meer."));
    const app = await makeApp();

    const res = await request(app).post("/proposals/4/accept");

    expect(res.status).toBe(502);
    expect(res.body.detail).toContain("Doeldocument bestaat niet meer.");
    expect(revertProposalToPendingMock).toHaveBeenCalledWith(4);
    expect(verifyProposalAppliedMock).not.toHaveBeenCalled();
  });

  it("still returns the 502 detail when the rollback itself throws", async () => {
    claimProposalStatusMock.mockResolvedValue(CLAIMED);
    applyProposalMock.mockRejectedValue(new Error("Doeldocument bestaat niet meer."));
    revertProposalToPendingMock.mockRejectedValue(new Error("DB down"));
    const app = await makeApp();

    const res = await request(app).post("/proposals/4/accept");

    expect(res.status).toBe(502);
    expect(res.body.detail).toContain("Doeldocument bestaat niet meer.");
  });

  it("returns 409 when the proposal was already decided", async () => {
    claimProposalStatusMock.mockResolvedValue(null);
    getProposalMock.mockResolvedValue({ id: 4, status: "accepted" });
    const app = await makeApp();

    const res = await request(app).post("/proposals/4/accept");

    expect(res.status).toBe(409);
    expect(applyProposalMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the proposal does not exist", async () => {
    claimProposalStatusMock.mockResolvedValue(null);
    getProposalMock.mockResolvedValue(null);
    const app = await makeApp();

    const res = await request(app).post("/proposals/999/accept");

    expect(res.status).toBe(404);
  });
});

describe("POST /proposals/:id/reject", () => {
  it("returns the rejected proposal", async () => {
    claimProposalStatusMock.mockResolvedValue({ id: 4, status: "rejected" });
    const app = await makeApp();

    const res = await request(app).post("/proposals/4/reject");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 4, status: "rejected" });
    expect(applyProposalMock).not.toHaveBeenCalled();
  });
});
