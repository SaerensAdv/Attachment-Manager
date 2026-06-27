import { describe, it, expect, beforeEach, vi } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import type { Generation } from "@workspace/db";

/**
 * End-to-end tests of the APPROVE / REQUEST-CHANGES half of the generations
 * route through Express + supertest. The drafting/holding side (a run snapshots
 * a `pendingDelivery` and HOLDS it with approvalStatus = "pending") is covered
 * in generate-engine.test.ts; this file covers the complementary half — the
 * actual moment a client email goes out, after a human signs off.
 *
 * The store and the two e-mail collaborators are mocked by module path
 * (consistent with generate-engine.test.ts): the store's atomic
 * claim/revert/approve, the reply drafter (`draftEmailReply`) and the report
 * drafter (`draftMonthlyReport`) are spies the test drives, while the pure
 * payload parsers (`parse*Payload`, `pendingDeliveryKind`) stay REAL so the
 * route's snapshot round-trip is exercised faithfully. We assert the send/draft
 * happens exactly once, to the snapshotted recipient/thread, that the held PDF is
 * rendered from the FROZEN payload, that approvalStatus flips pending -> approved,
 * and that the reject path does nothing and clears the held draft.
 */

// The store is fully mocked: the route's only real dependency on it is the
// sequence of awaited calls, which each test scripts via these spies. Mocking
// the whole module keeps @workspace/db out of the import graph.
const storeMocks = vi.hoisted(() => ({
  claimGenerationApprovalForSend: vi.fn(),
  setGenerationApproval: vi.fn(),
  revertGenerationApprovalToPending: vi.fn(),
  appendGenerationStep: vi.fn(),
  getGeneration: vi.fn(),
  listGenerations: vi.fn(),
  deleteGeneration: vi.fn(),
  updateGenerationFeedback: vi.fn(),
  listGenerationSteps: vi.fn(),
}));
vi.mock("../lib/generations-store", () => storeMocks);

// The two draft writers are the collaborators under test: spy them, keep the
// pure payload parsers + discriminator real (importActual) so the held snapshot
// is parsed exactly as in production before the draft is staged.
const draftMonthlyReportMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/monthly-report-email", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/monthly-report-email")>();
  return { ...actual, draftMonthlyReport: draftMonthlyReportMock };
});

const draftEmailReplyMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/email-reply", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/email-reply")>();
  return { ...actual, draftEmailReply: draftEmailReplyMock };
});

// Thread bookkeeping after a successful draft is best-effort; stub it so the
// route's post-draft call is observable without a DB.
const threadMocks = vi.hoisted(() => ({
  recordOutboundThread: vi.fn(),
  linkGenerationThread: vi.fn(),
}));
vi.mock("../lib/email-threads-store", () => threadMocks);

// Pulled in at module load but never exercised by the approval paths; stub so
// the import graph is hermetic (no anthropic, no DB).
vi.mock("../lib/proposals-store", () => ({
  createProposals: vi.fn(),
  listProposalsForGeneration: vi.fn(),
}));
vi.mock("../lib/improvements", () => ({ generateProposals: vi.fn() }));

import generationsRouter from "./generations";

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", generationsRouter);
  return app;
}

/** A full generations row with sane defaults; tests override what they assert. */
function makeGeneration(over: Partial<Generation> = {}): Generation {
  return {
    id: 7,
    clientName: "Acme",
    clientPath: "clients/acme.md",
    workflowTitle: "Maandrapport",
    workflowPath: "workflows/monthly-report.md",
    leadAgentTitle: "Strateeg",
    leadAgentPath: "agents/google-ads-strategist.md",
    teamTitles: JSON.stringify(["Strateeg"]),
    teamPaths: JSON.stringify(["agents/google-ads-strategist.md"]),
    requestText: "Stel het maandrapport op.",
    finalMarkdown: "# Rapport",
    durationMs: 1000,
    totalTokens: 100,
    status: "completed",
    triggerSource: "scheduled",
    feedbackVerdict: null,
    feedbackNote: null,
    feedbackAt: null,
    approvalStatus: "pending",
    approvalNote: null,
    approvalAt: null,
    pendingDelivery: null,
    clientFacing: true,
    touchesLiveAccount: false,
    fanoutCandidates: null,
    emailThreadId: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    ...over,
  } as Generation;
}

const reportPayload = {
  recipient: "klant@acme.com",
  subject: "Maandrapport Acme — vorige maand",
  clientName: "Acme",
  periodLabel: "vorige maand",
  dateLabel: "1 juni 2026",
  emailBody: "Beste, in bijlage het rapport.",
  clientReport: "## Resultaten\nHet ging goed.",
  metrics: null,
  fromName: "Sven — Paid Media, Saerens Advertising",
  fromAddress: "paidmedia@saerensadvertising.com",
  cc: "owner@saerensadvertising.com",
  signature: "Sven\nPaid Media · Saerens Advertising",
  headAgentPath: "agents/google-ads-strategist.md",
};

const replyPayload = {
  kind: "email-reply",
  recipient: "klant@acme.com",
  subject: "Re: Vraag over budget",
  clientName: "Acme",
  replyBody: "Bedankt voor je vraag, hier is het antwoord.",
  inboundText: "Kan je het budget verhogen?",
  fromName: "Sven — Paid Media, Saerens Advertising",
  fromAddress: "paidmedia@saerensadvertising.com",
  cc: "owner@saerensadvertising.com",
  signature: "Sven\nPaid Media · Saerens Advertising",
  headAgentPath: "agents/google-ads-strategist.md",
  threadId: "gmail-thread-123",
  inReplyTo: "<inbound@mail.gmail.com>",
  references: "<first@x.com> <inbound@mail.gmail.com>",
  emailThreadId: 9,
};

beforeEach(() => {
  for (const m of Object.values(storeMocks)) m.mockReset();
  draftMonthlyReportMock.mockReset();
  draftEmailReplyMock.mockReset();
  threadMocks.recordOutboundThread.mockReset();
  threadMocks.linkGenerationThread.mockReset();
  // Default: the approval-write + audit-step calls succeed and reflect state.
  storeMocks.listGenerationSteps.mockResolvedValue([]);
  storeMocks.appendGenerationStep.mockResolvedValue(undefined);
  storeMocks.revertGenerationApprovalToPending.mockResolvedValue(undefined);
});

describe("POST /generations/:id/approve — monthly report", () => {
  it("drafts the held report exactly once from the frozen snapshot and flips pending -> approved", async () => {
    // The atomic claim succeeds, returning the held row with its snapshot.
    storeMocks.claimGenerationApprovalForSend.mockResolvedValue(
      makeGeneration({
        approvalStatus: "approved",
        pendingDelivery: JSON.stringify(reportPayload),
      }),
    );
    draftMonthlyReportMock.mockResolvedValue({
      draftId: "draft-1",
      threadId: "gmail-thread-new",
      messageId: "<stamped@saerens>",
    });
    storeMocks.setGenerationApproval.mockResolvedValue(
      makeGeneration({ approvalStatus: "approved", pendingDelivery: null }),
    );
    threadMocks.recordOutboundThread.mockResolvedValue({ id: 55 });
    threadMocks.linkGenerationThread.mockResolvedValue(
      makeGeneration({ approvalStatus: "approved", emailThreadId: 55 }),
    );

    const res = await request(makeApp()).post("/api/generations/7/approve");

    expect(res.status).toBe(200);
    // Drafted exactly once, to the snapshotted recipient, with the FROZEN report
    // body that becomes the PDF — proving the draft uses the held snapshot.
    expect(draftMonthlyReportMock).toHaveBeenCalledTimes(1);
    const sent = draftMonthlyReportMock.mock.calls[0][0];
    expect(sent.recipient).toBe(reportPayload.recipient);
    expect(sent.clientReport).toBe(reportPayload.clientReport);
    expect(sent.fromAddress).toBe(reportPayload.fromAddress);
    expect(sent.cc).toBe(reportPayload.cc);

    // The claim is the atomic pending->approved gate; the snapshot is cleared
    // only after the draft succeeds (clearPending on the final approval write).
    expect(storeMocks.claimGenerationApprovalForSend).toHaveBeenCalledWith(7);
    expect(storeMocks.setGenerationApproval).toHaveBeenCalledWith(7, {
      status: "approved",
      clearPending: true,
    });
    // It never reverts to pending on the happy path.
    expect(storeMocks.revertGenerationApprovalToPending).not.toHaveBeenCalled();

    // A "concept klaargezet" audit step is appended, and the conversation is
    // registered from the DRAFT's threadId (Gmail keeps it when the owner sends
    // the draft) so an inbound client reply can later be routed back to its Head.
    expect(storeMocks.appendGenerationStep).toHaveBeenCalledTimes(1);
    expect(storeMocks.appendGenerationStep.mock.calls[0][1]).toMatchObject({
      agentTitle: "Maandrapport — concept klaargezet in Gmail",
      status: "completed",
    });
    expect(threadMocks.recordOutboundThread).toHaveBeenCalledTimes(1);
    expect(threadMocks.recordOutboundThread.mock.calls[0][0]).toMatchObject({
      gmailThreadId: "gmail-thread-new",
    });

    expect(res.body.approvalStatus).toBe("approved");
  });

  it("does not send and returns 409 when there is no held draft to claim", async () => {
    // Lost the atomic claim (already approved elsewhere / nothing pending) but
    // the run still exists -> 409, nothing sent, state untouched.
    storeMocks.claimGenerationApprovalForSend.mockResolvedValue(null);
    storeMocks.getGeneration.mockResolvedValue(
      makeGeneration({ approvalStatus: "approved", pendingDelivery: null }),
    );

    const res = await request(makeApp()).post("/api/generations/7/approve");

    expect(res.status).toBe(409);
    expect(draftMonthlyReportMock).not.toHaveBeenCalled();
    expect(storeMocks.setGenerationApproval).not.toHaveBeenCalled();
  });

  it("reverts to pending and returns 502 when the send fails, leaving the draft retryable", async () => {
    storeMocks.claimGenerationApprovalForSend.mockResolvedValue(
      makeGeneration({
        approvalStatus: "approved",
        pendingDelivery: JSON.stringify(reportPayload),
      }),
    );
    draftMonthlyReportMock.mockRejectedValue(new Error("Gmail down"));

    const res = await request(makeApp()).post("/api/generations/7/approve");

    expect(res.status).toBe(502);
    // The claim is released back to pending (snapshot intact) so it can be
    // retried; the run is NEVER left "approved" with an unsent draft.
    expect(storeMocks.revertGenerationApprovalToPending).toHaveBeenCalledWith(7);
    expect(storeMocks.setGenerationApproval).not.toHaveBeenCalled();
    expect(storeMocks.appendGenerationStep).not.toHaveBeenCalled();
  });

  it("reverts to pending and returns 422 when the held snapshot is unreadable", async () => {
    storeMocks.claimGenerationApprovalForSend.mockResolvedValue(
      makeGeneration({
        approvalStatus: "approved",
        pendingDelivery: "{not valid json",
      }),
    );

    const res = await request(makeApp()).post("/api/generations/7/approve");

    expect(res.status).toBe(422);
    expect(draftMonthlyReportMock).not.toHaveBeenCalled();
    expect(storeMocks.revertGenerationApprovalToPending).toHaveBeenCalledWith(7);
  });
});

describe("POST /generations/:id/approve — inbound reply", () => {
  it("drafts the held reply in-thread using the snapshotted threading headers", async () => {
    storeMocks.claimGenerationApprovalForSend.mockResolvedValue(
      makeGeneration({
        workflowPath: "workflows/email-reply.md",
        approvalStatus: "approved",
        pendingDelivery: JSON.stringify(replyPayload),
      }),
    );
    draftEmailReplyMock.mockResolvedValue({
      draftId: "draft-2",
      threadId: "gmail-thread-123",
      messageId: "<stamped-reply@saerens>",
    });
    storeMocks.setGenerationApproval.mockResolvedValue(
      makeGeneration({ approvalStatus: "approved", pendingDelivery: null }),
    );
    threadMocks.recordOutboundThread.mockResolvedValue({ id: 9 });
    threadMocks.linkGenerationThread.mockResolvedValue(
      makeGeneration({ approvalStatus: "approved", emailThreadId: 9 }),
    );

    const res = await request(makeApp()).post("/api/generations/7/approve");

    expect(res.status).toBe(200);
    // The reply path is taken (not the report), drafted once, in the original
    // Gmail conversation using the FROZEN threading headers.
    expect(draftMonthlyReportMock).not.toHaveBeenCalled();
    expect(draftEmailReplyMock).toHaveBeenCalledTimes(1);
    const staged = draftEmailReplyMock.mock.calls[0][0];
    expect(staged.recipient).toBe(replyPayload.recipient);
    expect(staged.replyBody).toBe(replyPayload.replyBody);
    expect(staged.threadId).toBe(replyPayload.threadId);
    expect(staged.inReplyTo).toBe(replyPayload.inReplyTo);
    expect(staged.references).toBe(replyPayload.references);

    // The conversation is advanced from the draft's threadId so the next inbound
    // reply still threads correctly even though the owner sends by hand.
    expect(threadMocks.recordOutboundThread).toHaveBeenCalledTimes(1);
    expect(threadMocks.recordOutboundThread.mock.calls[0][0]).toMatchObject({
      gmailThreadId: "gmail-thread-123",
    });

    expect(storeMocks.setGenerationApproval).toHaveBeenCalledWith(7, {
      status: "approved",
      clearPending: true,
    });
    expect(storeMocks.appendGenerationStep.mock.calls[0][1]).toMatchObject({
      agentTitle: "Antwoord — concept klaargezet in Gmail",
      status: "completed",
    });
  });
});

describe("POST /generations/:id/request-changes", () => {
  it("sends nothing, records the rework note, and clears the held draft", async () => {
    storeMocks.getGeneration.mockResolvedValue(
      makeGeneration({
        approvalStatus: "pending",
        pendingDelivery: JSON.stringify(reportPayload),
      }),
    );
    storeMocks.setGenerationApproval.mockResolvedValue(
      makeGeneration({
        approvalStatus: "changes_requested",
        approvalNote: "Maak de toon zachter.",
        pendingDelivery: null,
      }),
    );

    const res = await request(makeApp())
      .post("/api/generations/7/request-changes")
      .send({ note: "Maak de toon zachter." });

    expect(res.status).toBe(200);
    // Nothing is sent on the reject path.
    expect(draftMonthlyReportMock).not.toHaveBeenCalled();
    expect(draftEmailReplyMock).not.toHaveBeenCalled();
    // The held draft is cleared (clearPending) so the stale snapshot can never
    // be released afterward, and the reviewer note is recorded.
    expect(storeMocks.setGenerationApproval).toHaveBeenCalledWith(7, {
      status: "changes_requested",
      note: "Maak de toon zachter.",
      clearPending: true,
    });
    expect(res.body.approvalStatus).toBe("changes_requested");
  });

  it("returns 409 when nothing is awaiting review (not pending)", async () => {
    storeMocks.getGeneration.mockResolvedValue(
      makeGeneration({ approvalStatus: "approved", pendingDelivery: null }),
    );

    const res = await request(makeApp())
      .post("/api/generations/7/request-changes")
      .send({ note: "te laat" });

    expect(res.status).toBe(409);
    expect(storeMocks.setGenerationApproval).not.toHaveBeenCalled();
  });
});
