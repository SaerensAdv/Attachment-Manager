import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

const getProposalMock = vi.hoisted(() => vi.fn());
const claimProposalForReviewMock = vi.hoisted(() => vi.fn());
const completeProposalReviewRequestMock = vi.hoisted(() => vi.fn());
const revertProposalReviewToPendingMock = vi.hoisted(() => vi.fn());
const claimProposalStatusMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/proposals-store", () => ({
  getProposal: getProposalMock,
  claimProposalForReview: claimProposalForReviewMock,
  completeProposalReviewRequest: completeProposalReviewRequestMock,
  revertProposalReviewToPending: revertProposalReviewToPendingMock,
  claimProposalStatus: claimProposalStatusMock,
}));

const createProposalPullRequestMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/github-change-request", () => ({ createProposalPullRequest: createProposalPullRequestMock }));
const recordActionEventMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/action-events", () => ({ recordActionEvent: recordActionEventMock }));
vi.mock("./generations", () => ({ serializeProposal: (proposal: unknown) => proposal }));

async function makeApp(): Promise<Express> { vi.resetModules(); const { default: router } = await import("./proposals"); const app = express(); app.use(router); return app; }
const PENDING = { id: 4, generationId: 12, status: "pending", targetType: "knowledge", targetPath: "knowledge/replit-builds.md", targetLabel: "Replit Builds", rationale: "Make approvals explicit", proposedText: "Gebruik expliciete approvals." };
const PROCESSING = { ...PENDING, status: "processing" };
const REVIEW_REQUESTED = { ...PENDING, status: "review_requested" };
const CHANGE = { changed: true, verified: true, branch: "atlas/learning-proposal-4", pullRequestUrl: "https://github.com/SaerensAdv/Attachment-Manager/pull/99", fileUrl: "https://github.com/SaerensAdv/Attachment-Manager/blob/x/knowledge/replit-builds.md", commitSha: "abc123" };

beforeEach(() => {
  for (const mock of [getProposalMock, claimProposalForReviewMock, completeProposalReviewRequestMock, revertProposalReviewToPendingMock, claimProposalStatusMock, createProposalPullRequestMock, recordActionEventMock]) mock.mockReset();
  getProposalMock.mockResolvedValue(PENDING); claimProposalForReviewMock.mockResolvedValue(PROCESSING); completeProposalReviewRequestMock.mockResolvedValue(REVIEW_REQUESTED); revertProposalReviewToPendingMock.mockResolvedValue(undefined); createProposalPullRequestMock.mockResolvedValue(CHANGE); recordActionEventMock.mockResolvedValue(undefined);
});

describe("POST /proposals/:id/accept", () => {
  it("creates a reviewed GitHub change request instead of writing canonical content", async () => {
    const res = await request(await makeApp()).post("/proposals/4/accept");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ proposal: REVIEW_REQUESTED, changed: true, verified: true, governance: { mode: "github_pull_request", status: "review_requested", pullRequestUrl: CHANGE.pullRequestUrl, branch: CHANGE.branch, commitSha: CHANGE.commitSha } });
    expect(createProposalPullRequestMock).toHaveBeenCalledWith(PROCESSING);
    expect(completeProposalReviewRequestMock).toHaveBeenCalledWith(4);
    expect(recordActionEventMock).toHaveBeenCalled();
  });

  it("reports an idempotent already-present rule as verified", async () => {
    createProposalPullRequestMock.mockResolvedValue({ ...CHANGE, changed: false });
    const res = await request(await makeApp()).post("/proposals/4/accept");
    expect(res.status).toBe(200); expect(res.body.changed).toBe(false); expect(res.body.verified).toBe(true);
  });

  it("reverts to pending and returns a retryable 502 when PR creation fails", async () => {
    createProposalPullRequestMock.mockRejectedValue(new Error("GitHub unavailable"));
    const res = await request(await makeApp()).post("/proposals/4/accept");
    expect(res.status).toBe(502); expect(res.body.code).toBe("GITHUB_CHANGE_REQUEST_FAILED"); expect(res.body.detail).toContain("GitHub unavailable"); expect(res.body.retryable).toBe(true); expect(revertProposalReviewToPendingMock).toHaveBeenCalledWith(4);
  });

  it("still returns the original 502 when rollback itself fails", async () => {
    createProposalPullRequestMock.mockRejectedValue(new Error("GitHub unavailable")); revertProposalReviewToPendingMock.mockRejectedValue(new Error("DB down"));
    const res = await request(await makeApp()).post("/proposals/4/accept");
    expect(res.status).toBe(502); expect(res.body.detail).toContain("GitHub unavailable");
  });

  it("blocks ClickUp-owned client targets from mutating the local cache", async () => {
    getProposalMock.mockResolvedValue({ ...PENDING, targetType: "client", targetPath: "clients/db/2.md" });
    const res = await request(await makeApp()).post("/proposals/4/accept");
    expect(res.status).toBe(409); expect(res.body.code).toBe("CLICKUP_OWNED_TARGET"); expect(claimProposalForReviewMock).not.toHaveBeenCalled(); expect(createProposalPullRequestMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the proposal is already being reviewed or decided", async () => {
    claimProposalForReviewMock.mockResolvedValue(null);
    const res = await request(await makeApp()).post("/proposals/4/accept");
    expect(res.status).toBe(409); expect(res.body.code).toBe("PROPOSAL_ALREADY_DECIDED");
  });

  it("returns 404 when the proposal does not exist", async () => {
    getProposalMock.mockResolvedValue(null);
    const res = await request(await makeApp()).post("/proposals/999/accept");
    expect(res.status).toBe(404); expect(res.body.code).toBe("PROPOSAL_NOT_FOUND");
  });
});

describe("POST /proposals/:id/reject", () => {
  it("records the rejected decision without applying a source change", async () => {
    claimProposalStatusMock.mockResolvedValue({ ...PENDING, status: "rejected" });
    const res = await request(await makeApp()).post("/proposals/4/reject");
    expect(res.status).toBe(200); expect(res.body.status).toBe("rejected"); expect(createProposalPullRequestMock).not.toHaveBeenCalled(); expect(recordActionEventMock).toHaveBeenCalled();
  });
});
