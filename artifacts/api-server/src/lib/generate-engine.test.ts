import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Tests the run-archival contract of `runGeneration`: a run is persisted on
 * EVERY exit path (success, mid-step failure, abort), idempotently, with the
 * run status reflecting the worst step. The dependencies are mocked so we drive
 * the Anthropic stream and assert what gets archived — no DB, no real LLM.
 *
 * The "partial-persist" path is the important one: when an agent's stream blows
 * up mid-run we must still archive the partial output + a failed step (the whole
 * point of the audit trail), not lose the run.
 */

const h = vi.hoisted(() => ({
  // Each test installs the stream behaviour it wants here.
  streamImpl: ((..._args: unknown[]) => {
    throw new Error("streamImpl not set");
  }) as (...args: unknown[]) => unknown,
}));

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: {
    messages: {
      stream: (...args: unknown[]) => h.streamImpl(...args),
      create: vi.fn(),
    },
  },
}));

// Permissive DB stub so transitively-imported stores load without a real pool.
vi.mock("@workspace/db", () => new Proxy({}, { get: () => ({}) }));

vi.mock("./generate-context", () => ({
  ALWAYS_KNOWLEDGE: [],
  buildGenerationContext: vi.fn(async () => ({ systemPrompt: "system prompt" })),
}));

const saveGenerationMock = vi.fn(async (rec: Record<string, unknown>) => ({
  id: 42,
  ...rec,
}));
const saveGenerationStepsMock = vi.fn(async (_steps: unknown) => {});
vi.mock("./generations-store", () => ({
  saveGeneration: (rec: Record<string, unknown>) => saveGenerationMock(rec),
  saveGenerationSteps: (steps: unknown) => saveGenerationStepsMock(steps),
}));

// The remaining collaborators are never exercised for a deliverable-less run,
// but generate-engine imports them at module load — stub them so the import is
// hermetic (no Gmail client, no pdfkit, no Google Ads).
const clientStoreMocks = vi.hoisted(() => ({
  getClientRow: vi.fn(async (): Promise<unknown> => null),
  dbClientIdFromPath: vi.fn((): number | null => null),
}));
vi.mock("./clients-store", () => ({
  loadClientDocs: vi.fn(async () => []),
  getClientRow: clientStoreMocks.getClientRow,
  dbClientIdFromPath: clientStoreMocks.dbClientIdFromPath,
}));
vi.mock("./monitored-terms-store", () => ({
  listMonitoredTerms: vi.fn(async () => []),
  recordMonitoredTerms: vi.fn(async () => {}),
}));
vi.mock("./google-ads", () => ({
  fetchGoogleAdsReport: vi.fn(async () => ({ text: "", metrics: null })),
  fetchGoogleAdsAdCopyContext: vi.fn(async () => null),
  fetchGoogleAdsNegativesContext: vi.fn(async () => null),
}));
vi.mock("./report-pdf", () => ({
  renderReportPdf: vi.fn(async () => Buffer.from("")),
}));
const sendEmailMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("./email", () => ({ sendEmail: sendEmailMock }));

// The QC gate resolves its agents through getDocFile; in tests the real doc
// graph isn't loaded, so stub the two QC paths (others resolve to null).
vi.mock("./docs", () => ({
  getDocFile: (path: string) => {
    if (path === "agents/qa-compliance-reviewer.md")
      return { path, title: "QA & Compliance Reviewer", content: "" };
    if (path === "agents/humanizer.md")
      return { path, title: "Humanizer", content: "" };
    return null;
  },
}));

// Imported after the mocks above (vi.mock is hoisted).
import { runGeneration, type GenerationContext } from "./generate-engine";

function makeCtx(over: Partial<GenerationContext> = {}): GenerationContext {
  return {
    teamPaths: ["agents/optimization-specialist.md"],
    memberTitles: ["Optimization Specialist"],
    clientPath: "clients/acme.md",
    clientName: "Acme",
    clientContent: "",
    workflowPath: "workflows/account-optimization.md",
    workflowTitle: "Account Optimization",
    workflowDoc: null,
    deliverableKind: null,
    request: "Optimize the account.",
    clientDocs: [],
    stages: [[0]],
    clientFacing: false,
    qcEnabled: false,
    touchesLiveAccount: false,
    ...over,
  } as unknown as GenerationContext;
}

/**
 * Build a stream impl that yields a different text on each successive call (the
 * Nth call gets texts[N], clamped to the last). Lets a single mock serve the
 * team agents AND the QC steps that follow, in call order.
 */
function streamSequence(
  texts: string[],
): (...args: unknown[]) => unknown {
  let i = 0;
  return () => {
    const text = texts[Math.min(i, texts.length - 1)];
    i += 1;
    return {
      async *[Symbol.asyncIterator]() {
        yield {
          type: "content_block_delta",
          delta: { type: "text_delta", text },
        };
      },
      finalMessage: async () => ({
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    };
  };
}

function run(ctx: GenerationContext, controller = new AbortController()) {
  const sink = vi.fn();
  return {
    sink,
    controller,
    promise: runGeneration(ctx, {
      sink,
      signal: controller.signal,
      triggerSource: "user",
    }),
  };
}

beforeEach(() => {
  saveGenerationMock.mockClear();
  saveGenerationStepsMock.mockClear();
  clientStoreMocks.getClientRow.mockReset();
  clientStoreMocks.getClientRow.mockResolvedValue(null);
  clientStoreMocks.dbClientIdFromPath.mockReset();
  clientStoreMocks.dbClientIdFromPath.mockReturnValue(null);
  sendEmailMock.mockClear();
});

describe("runGeneration — run archival", () => {
  it("archives a partial run (status + partial output + failed step) when a step fails mid-stream", async () => {
    h.streamImpl = () => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Partial draft from the lead." },
        };
        throw new Error("stream exploded");
      },
      finalMessage: async () => ({ stop_reason: "end_turn", usage: {} }),
    });

    const { sink, promise } = run(makeCtx());
    const result = await promise;

    // Persisted exactly once, as a partial run keeping the partial output.
    expect(saveGenerationMock).toHaveBeenCalledTimes(1);
    const saved = saveGenerationMock.mock.calls[0][0];
    expect(saved.status).toBe("partial");
    expect(String(saved.finalMarkdown)).toContain("Partial draft from the lead.");

    // The failed step is recorded in the audit trail.
    const steps = saveGenerationStepsMock.mock.calls[0][0] as Array<{
      status: string;
    }>;
    expect(steps.some((s) => s.status === "failed")).toBe(true);

    // The client is told it failed, and the result reflects the partial archive.
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("stream exploded") }),
    );
    expect(result.status).toBe("partial");
    expect(result.archived).toBe(true);
    expect(result.error).toBeTruthy();
  });

  it("archives a completed run on success and signals done", async () => {
    h.streamImpl = () => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Full completed output." },
        };
      },
      finalMessage: async () => ({
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    });

    const { sink, promise } = run(makeCtx());
    const result = await promise;

    expect(saveGenerationMock).toHaveBeenCalledTimes(1);
    expect(saveGenerationMock.mock.calls[0][0].status).toBe("completed");
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ done: true, archived: true }),
    );
    expect(result.status).toBe("completed");
    expect(result.archived).toBe(true);
  });

  it("archives an aborted run as partial without surfacing an error to the client", async () => {
    const controller = new AbortController();
    h.streamImpl = () => ({
      async *[Symbol.asyncIterator]() {
        yield {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "Work before the user cancelled." },
        };
        controller.abort();
        const err = new Error("aborted");
        err.name = "AbortError";
        throw err;
      },
      finalMessage: async () => ({ stop_reason: "end_turn", usage: {} }),
    });

    const { sink, promise } = run(makeCtx(), controller);
    const result = await promise;

    // The trail is still archived (reviewable) as a partial run, with the
    // step marked aborted. (Partial agent text is intentionally NOT promoted
    // into the final markdown on abort — the run broke before that point.)
    expect(saveGenerationMock).toHaveBeenCalledTimes(1);
    expect(saveGenerationMock.mock.calls[0][0].status).toBe("partial");
    const steps = saveGenerationStepsMock.mock.calls[0][0] as Array<{
      status: string;
    }>;
    expect(steps.some((s) => s.status === "aborted")).toBe(true);

    // An abort is a user action, not a failure — no error is pushed to the client.
    expect(sink).not.toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.anything() }),
    );
    expect(result.status).toBe("partial");
    expect(result.aborted).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

describe("runGeneration — final QC gate", () => {
  it("runs the QA & Compliance Reviewer and appends its verdict AFTER the team output", async () => {
    // Call 0 = the lead agent; call 1 = the reviewer.
    h.streamImpl = streamSequence([
      "Team draft for the account.",
      "Verdict: approved with minor notes.",
    ]);

    const { sink, promise } = run(makeCtx({ qcEnabled: true }));
    const result = await promise;

    expect(result.status).toBe("completed");
    const saved = saveGenerationMock.mock.calls[0][0];
    const markdown = String(saved.finalMarkdown);
    // Both the team work and the reviewer verdict are archived, with the verdict
    // under its internal-QA heading placed after the team output.
    expect(markdown).toContain("Team draft for the account.");
    expect(markdown).toContain("## QA & Compliance — interne controle");
    expect(markdown).toContain("Verdict: approved with minor notes.");
    expect(markdown.indexOf("Team draft")).toBeLessThan(
      markdown.indexOf("QA & Compliance — interne controle"),
    );

    // The QC step is recorded in the audit trail as a completed quality step.
    const steps = saveGenerationStepsMock.mock.calls[0][0] as Array<{
      role: string;
      status: string;
    }>;
    expect(
      steps.some((s) => s.role === "quality" && s.status === "completed"),
    ).toBe(true);

    // The run announces the full plan up front, including the QC step.
    const plan = sink.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .find((e) => e.type === "plan");
    expect(plan).toBeTruthy();
    expect(plan?.total).toBe(2);
    expect((plan?.qc as unknown[]).length).toBe(1);
  });

  it("keeps the team markdown intact (partial run) when the QC step fails — best-effort", async () => {
    let call = 0;
    h.streamImpl = () => {
      const isReviewer = call > 0;
      call += 1;
      return {
        async *[Symbol.asyncIterator]() {
          if (isReviewer) {
            throw new Error("reviewer model exploded");
          }
          yield {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "Team draft survives QC failure." },
          };
        },
        finalMessage: async () => ({ stop_reason: "end_turn", usage: {} }),
      };
    };

    const { sink, promise } = run(makeCtx({ qcEnabled: true }));
    const result = await promise;

    // A QC failure degrades the run to partial but never discards the team work,
    // and the run still completes (best-effort, no surfaced error).
    expect(result.status).toBe("partial");
    const saved = saveGenerationMock.mock.calls[0][0];
    expect(saved.status).toBe("partial");
    expect(String(saved.finalMarkdown)).toContain(
      "Team draft survives QC failure.",
    );
    const steps = saveGenerationStepsMock.mock.calls[0][0] as Array<{
      role: string;
      status: string;
    }>;
    expect(
      steps.some((s) => s.role === "quality" && s.status === "failed"),
    ).toBe(true);
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ done: true }),
    );
    expect(sink).not.toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.anything() }),
    );
  });

  it("includes a Humanizer step for client-facing text", async () => {
    h.streamImpl = streamSequence([
      "Team draft.",
      "Humanized client-ready version.",
      "Verdict: ok.",
    ]);

    const { sink, promise } = run(
      makeCtx({ qcEnabled: true, clientFacing: true }),
    );
    await promise;

    const plan = sink.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .find((e) => e.type === "plan");
    // 1 team member + humanizer + reviewer.
    expect(plan?.total).toBe(3);
    const modes = (plan?.qc as Array<{ mode: string }>).map((q) => q.mode);
    expect(modes).toContain("humanizer");
    expect(modes).toContain("reviewer");

    const markdown = String(saveGenerationMock.mock.calls[0][0].finalMarkdown);
    expect(markdown).toContain("Humanized client-ready version.");
  });
});

describe("runGeneration — monthly-report-email approval hold", () => {
  it("holds the send: marks pending, snapshots delivery, emits approval_required, never sends", async () => {
    // The team produces a clean, client-facing report body (>200 chars so the
    // section is taken as the report, not stripped).
    const reportBody =
      "Dit is het maandrapport voor de klant. " +
      "De campagnes presteerden sterk met een stijgende CTR en dalende kost per conversie. " +
      "We stellen voor om het budget op de best presterende advertentiegroepen te verhogen " +
      "en enkele onderpresterende zoekwoorden uit te sluiten in de volgende periode.";
    h.streamImpl = streamSequence([reportBody]);

    // A client with a report recipient but no Google Ads customer id (so no live
    // pull runs); the held draft is still produced and snapshotted.
    clientStoreMocks.dbClientIdFromPath.mockReturnValue(7);
    clientStoreMocks.getClientRow.mockResolvedValue({
      id: 7,
      reportEmail: "klant@example.com",
      googleAdsCustomerId: null,
    });

    const { sink, promise } = run(
      makeCtx({
        deliverableKind: "monthly-report-email",
        clientFacing: false,
      }),
    );
    const result = await promise;

    // The run itself completes — the report drafted fine; only the send is held.
    expect(result.status).toBe("completed");

    // The hold is persisted in the audit trail: status pending + a snapshot of
    // everything needed to send later.
    const saved = saveGenerationMock.mock.calls[0][0];
    expect(saved.approvalStatus).toBe("pending");
    expect(typeof saved.pendingDelivery).toBe("string");
    const payload = JSON.parse(String(saved.pendingDelivery));
    expect(payload.recipient).toBe("klant@example.com");
    expect(String(payload.clientReport)).toContain("maandrapport voor de klant");

    // A human-facing approval request is surfaced with the recipient + draft.
    const approval = sink.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .find((e) => e.type === "approval_required");
    expect(approval).toBeTruthy();
    expect(approval?.recipient).toBe("klant@example.com");

    // The done event flags that approval is required.
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({ done: true, approvalRequired: true }),
    );

    // Nothing was sent: the cover-email model call may run, but no e-mail goes out
    // from the engine (delivery only happens on explicit approval).
    expect(sendEmailMock).not.toHaveBeenCalled();

    // The held step is recorded with its waiting-for-approval title.
    const steps = saveGenerationStepsMock.mock.calls[0][0] as Array<{
      role: string;
      status: string;
      agentTitle: string;
    }>;
    expect(
      steps.some(
        (s) =>
          s.role === "deliverable" &&
          s.status === "completed" &&
          /wacht op goedkeuring/i.test(s.agentTitle),
      ),
    ).toBe(true);
  });
});

describe("runGeneration — parallel stages", () => {
  it("runs independent members in one stage and archives both outputs", async () => {
    h.streamImpl = streamSequence([
      "Output from member A.",
      "Output from member B.",
    ]);

    const { sink, promise } = run(
      makeCtx({
        teamPaths: ["agents/copywriter.md", "agents/seo-specialist.md"],
        memberTitles: ["Copywriter", "SEO Specialist"],
        stages: [[0, 1]],
      }),
    );
    const result = await promise;

    expect(result.status).toBe("completed");
    const markdown = String(saveGenerationMock.mock.calls[0][0].finalMarkdown);
    expect(markdown).toContain("Output from member A.");
    expect(markdown).toContain("Output from member B.");

    // The plan event groups both members into a single parallel stage.
    const plan = sink.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .find((e) => e.type === "plan");
    const stages = plan?.stages as unknown[][];
    expect(stages.length).toBe(1);
    expect(stages[0].length).toBe(2);
  });
});
