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
vi.mock("./clients-store", () => ({
  loadClientDocs: vi.fn(async () => []),
  getClientRow: vi.fn(async () => null),
  dbClientIdFromPath: vi.fn(() => null),
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
vi.mock("./email", () => ({ sendEmail: vi.fn(async () => {}) }));

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
    ...over,
  } as unknown as GenerationContext;
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
