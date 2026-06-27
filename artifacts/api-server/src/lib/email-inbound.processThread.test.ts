import { describe, it, expect, beforeEach, vi } from "vitest";
import type { EmailThread } from "@workspace/db";

/**
 * Engine-level coverage of the INBOUND half of two-way agent email. Task #83
 * covered the outbound approve path (a held email actually sends); this covers
 * the mirror half: a client's reply arriving via Gmail is matched to its
 * conversation by gmailThreadId, routed to the responsible Head, and turned into
 * a HELD `email-reply` draft in the same approval queue — nothing is ever sent.
 *
 * Collaborators are mocked by module path (consistent with generate-engine.test
 * .ts / generations.test.ts): the Gmail connector, the thread store's atomic
 * claim, the client lookup, the owner identity and the engine itself are spies
 * the test drives, while the pure skip/whitelist + threading helpers stay REAL
 * (only the side-effecting `processThread` is exercised). We assert the run is
 * routed to the right Head with the frozen threading headers and held pending,
 * that a non-whitelisted From is dropped (the loop/spoof guard), and that a
 * lost claim (a duplicate inbound) is never double-drafted.
 */

// The Gmail REST client: gmailGet now calls the Gmail API directly with an OAuth
// access token (getGmailAccessToken) via the global fetch, so we stub the token
// helper and fetch. A single dispatcher routes by URL so one mock serves both
// the metadata (thread) fetch and the full-message fetch.
const gmailFetch = vi.hoisted(() => vi.fn());
vi.mock("./gmail-oauth", () => ({
  getGmailAccessToken: vi.fn(async () => "test-access-token"),
}));
vi.stubGlobal("fetch", gmailFetch);

// The atomic claim is the exactly-once gate: tests script its true/false.
const claimInboundMock = vi.hoisted(() => vi.fn());
vi.mock("./email-threads-store", () => ({
  claimInbound: claimInboundMock,
  // listOpenThreads is only used by the poller loop, not processThread.
  listOpenThreads: vi.fn(async () => []),
}));

// Client lookup resolves the whitelist (reportEmail) for the thread's client.
const clientStoreMocks = vi.hoisted(() => ({
  getClientRow: vi.fn(),
  dbClientIdFromPath: vi.fn(),
}));
vi.mock("./clients-store", () => clientStoreMocks);

// Owner identity (the CC'd address that must never trigger a draft).
const ownerEmailMock = vi.hoisted(() => vi.fn());
vi.mock("./email-identity", () => ({ ownerEmail: ownerEmailMock }));

// The engine: spy resolve + run so we assert routing + the held-draft outcome
// without a real LLM, DB or doc graph.
const resolveGenerationContextMock = vi.hoisted(() => vi.fn());
const runGenerationMock = vi.hoisted(() => vi.fn());
vi.mock("./generate-engine", () => ({
  resolveGenerationContext: resolveGenerationContextMock,
  runGeneration: runGenerationMock,
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { processThread } from "./email-inbound";

const WHITELIST = "jan@klant.be";
const OWNER = "axel@saerensadvertising.com";

function makeThread(over: Partial<EmailThread> = {}): EmailThread {
  return {
    id: 9,
    gmailThreadId: "gmail-thread-123",
    clientPath: "clients/db/4.md",
    headAgentPath: "agents/google-ads-strategist.md",
    subject: "Maandrapport mei",
    lastProcessedMessageId: null,
    lastMessageIdHeader: "<first@saerens>",
    status: "open",
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-02T00:00:00Z"),
    ...over,
  } as EmailThread;
}

/** A fetch-like Response stub carrying a JSON body. */
function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** The thread-metadata response: newest message last (chronological order). */
function metaResponse(
  over: { id?: string; from?: string; labelIds?: string[] } = {},
) {
  return jsonResponse({
    messages: [
      {
        id: "m0",
        labelIds: ["SENT"],
        payload: { headers: [{ name: "From", value: `Saerens <${OWNER}>` }] },
      },
      {
        id: over.id ?? "m-new",
        labelIds: over.labelIds ?? ["INBOX"],
        payload: {
          headers: [
            { name: "From", value: over.from ?? `Jan Klant <${WHITELIST}>` },
            { name: "Subject", value: "Re: Maandrapport mei" },
          ],
        },
      },
    ],
  });
}

/** The full-message response (body + Message-ID) for the claimed message. */
function fullResponse(over: { messageId?: string; text?: string } = {}) {
  return jsonResponse({
    id: "m-new",
    payload: {
      headers: [
        { name: "From", value: `Jan Klant <${WHITELIST}>` },
        { name: "Message-ID", value: over.messageId ?? "<inbound@mail.gmail.com>" },
      ],
      mimeType: "text/plain",
      body: {
        data: Buffer.from(over.text ?? "Kan je het budget verhogen?").toString(
          "base64",
        ),
      },
    },
  });
}

/** Dispatch the two gmailGet calls by URL: threads metadata, then full message. */
function wireGmail(opts: {
  meta?: Response;
  full?: Response;
} = {}) {
  gmailFetch.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes("/threads/")) return Promise.resolve(opts.meta ?? metaResponse());
    if (u.includes("/messages/")) return Promise.resolve(opts.full ?? fullResponse());
    return Promise.resolve(jsonResponse({}, { ok: false, status: 404 }));
  });
}

beforeEach(() => {
  gmailFetch.mockReset();
  claimInboundMock.mockReset();
  clientStoreMocks.getClientRow.mockReset();
  clientStoreMocks.dbClientIdFromPath.mockReset();
  ownerEmailMock.mockReset();
  resolveGenerationContextMock.mockReset();
  runGenerationMock.mockReset();

  // Defaults: client 4 resolves to the whitelist; owner is the CC'd address.
  clientStoreMocks.dbClientIdFromPath.mockReturnValue(4);
  clientStoreMocks.getClientRow.mockResolvedValue({ id: 4, reportEmail: WHITELIST });
  ownerEmailMock.mockReturnValue(OWNER);
  claimInboundMock.mockResolvedValue(true);
  // The engine resolves a context and holds the drafted reply for approval.
  resolveGenerationContextMock.mockImplementation(async () => ({
    ok: true,
    ctx: {} as Record<string, unknown>,
  }));
  runGenerationMock.mockResolvedValue({
    status: "completed",
    archived: true,
    generationId: 101,
    finalMarkdown: "# Antwoord",
    aborted: false,
    approvalStatus: "pending",
  });
});

describe("processThread — inbound client reply", () => {
  it("resolves the conversation, routes to the right Head, and holds an email-reply draft pending", async () => {
    wireGmail();

    await processThread(makeThread());

    // The conversation is resolved by its Gmail threadId (the stable key).
    const threadFetch = gmailFetch.mock.calls.find((c) =>
      String(c[0]).includes("/threads/"),
    );
    expect(threadFetch).toBeTruthy();
    expect(String(threadFetch![0])).toContain(
      encodeURIComponent("gmail-thread-123"),
    );

    // Routed to the responsible Head, as a client-facing reply on the
    // client-email workflow.
    expect(resolveGenerationContextMock).toHaveBeenCalledTimes(1);
    const resolveArgs = resolveGenerationContextMock.mock.calls[0][0];
    expect(resolveArgs.agentPath).toBe("agents/google-ads-strategist.md");
    expect(resolveArgs.clientPath).toBe("clients/db/4.md");
    expect(resolveArgs.workflowPath).toBe("workflows/client-email.md");
    expect(resolveArgs.clientFacing).toBe(true);
    expect(resolveArgs.request).toContain("Kan je het budget verhogen?");

    // The engine runs once with the inbound EmailReplyContext attached, carrying
    // the frozen threading headers needed to land the held reply in-thread.
    expect(runGenerationMock).toHaveBeenCalledTimes(1);
    const ctx = runGenerationMock.mock.calls[0][0] as {
      emailReply?: Record<string, unknown>;
    };
    expect(ctx.emailReply).toBeTruthy();
    expect(ctx.emailReply).toMatchObject({
      emailThreadId: 9,
      gmailThreadId: "gmail-thread-123",
      recipient: WHITELIST,
      subject: "Re: Maandrapport mei",
      inReplyTo: "<inbound@mail.gmail.com>",
      references: "<first@saerens> <inbound@mail.gmail.com>",
      inboundText: "Kan je het budget verhogen?",
    });
    const runOpts = runGenerationMock.mock.calls[0][1] as {
      triggerSource?: string;
    };
    expect(runOpts.triggerSource).toBe("inbound-email");

    // The held draft is what the approval queue picks up: pending, not sent.
    const result = await runGenerationMock.mock.results[0].value;
    expect(result.approvalStatus).toBe("pending");

    // The claim happened BEFORE the engine ran (exactly-once gate).
    expect(claimInboundMock).toHaveBeenCalledWith(9, "m-new");
  });

  it("drops a non-whitelisted sender without claiming or drafting (loop/spoof guard)", async () => {
    wireGmail({ meta: metaResponse({ from: "Iemand Anders <ander@elders.com>" }) });

    await processThread(makeThread());

    // The whitelist guard fires before the claim: nothing is claimed or drafted.
    expect(claimInboundMock).not.toHaveBeenCalled();
    expect(resolveGenerationContextMock).not.toHaveBeenCalled();
    expect(runGenerationMock).not.toHaveBeenCalled();
    // Only the metadata fetch happened — never the full-message fetch.
    expect(
      gmailFetch.mock.calls.some((c) => String(c[0]).includes("/messages/")),
    ).toBe(false);
  });

  it("does not double-draft a duplicate inbound when the claim is lost", async () => {
    wireGmail();
    // A concurrent tick already claimed this message id: the conditional update
    // matches no row and returns false.
    claimInboundMock.mockResolvedValue(false);

    await processThread(makeThread());

    // Claim was attempted, but losing it stops the flow before the engine runs.
    expect(claimInboundMock).toHaveBeenCalledWith(9, "m-new");
    expect(resolveGenerationContextMock).not.toHaveBeenCalled();
    expect(runGenerationMock).not.toHaveBeenCalled();
    // The full message is never fetched once the claim is lost.
    expect(
      gmailFetch.mock.calls.some((c) => String(c[0]).includes("/messages/")),
    ).toBe(false);
  });

  it("skips a message already recorded as processed (no re-claim, no re-draft)", async () => {
    wireGmail();

    await processThread(makeThread({ lastProcessedMessageId: "m-new" }));

    // inboundSkipReason short-circuits on the already-processed marker.
    expect(claimInboundMock).not.toHaveBeenCalled();
    expect(runGenerationMock).not.toHaveBeenCalled();
  });

  it("aborts an empty inbound message after claiming, without drafting", async () => {
    // A claimed message whose body and snippet are both empty: extractText
    // yields "" so the flow stops before building a prompt or running the team.
    wireGmail({
      full: jsonResponse({
        id: "m-new",
        snippet: "",
        payload: {
          headers: [
            { name: "From", value: `Jan Klant <${WHITELIST}>` },
            { name: "Message-ID", value: "<inbound@mail.gmail.com>" },
          ],
          mimeType: "text/plain",
          body: { data: "" },
        },
      }),
    });

    await processThread(makeThread());

    // The claim happened (the message looked genuine), but the empty body stops
    // the flow before any drafting.
    expect(claimInboundMock).toHaveBeenCalledWith(9, "m-new");
    expect(resolveGenerationContextMock).not.toHaveBeenCalled();
    expect(runGenerationMock).not.toHaveBeenCalled();
  });

  it("does nothing when the client has no reportEmail (nothing can be whitelisted)", async () => {
    clientStoreMocks.getClientRow.mockResolvedValue({ id: 4, reportEmail: null });
    wireGmail();

    await processThread(makeThread());

    // Without a recipient there is no whitelist, so Gmail is never even queried.
    expect(gmailFetch).not.toHaveBeenCalled();
    expect(claimInboundMock).not.toHaveBeenCalled();
    expect(runGenerationMock).not.toHaveBeenCalled();
  });
});
