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
  // Non-streaming completions (e.g. the fan-out best-of selection pass). Tests
  // that exercise fan-out install the WINNER/RATIONALE response they want here.
  createImpl: (async (..._args: unknown[]) => ({
    content: [{ type: "text", text: "" }],
    usage: { input_tokens: 1, output_tokens: 1 },
  })) as (...args: unknown[]) => Promise<unknown>,
}));

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: {
    messages: {
      stream: (...args: unknown[]) => h.streamImpl(...args),
      create: (...args: unknown[]) => h.createImpl(...args),
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
import {
  runGeneration,
  toClientFacingReport,
  stripHumanizerMeta,
  extractHandoffBrief,
  resolveBriefGateFlags,
  type GenerationContext,
} from "./generate-engine";
import { buildGenerationContext, type HandoffBrief } from "./generate-context";
import type { Mock } from "vitest";

function makeEngineBrief(over: Partial<HandoffBrief> = {}): HandoffBrief {
  return {
    agent: "Agent",
    decisions: [],
    keyFacts: [],
    openQuestions: [],
    forNext: null,
    clientFacing: null,
    touchesLiveAccount: null,
    ...over,
  };
}

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
  h.createImpl = async () => ({
    content: [{ type: "text", text: "" }],
    usage: { input_tokens: 1, output_tokens: 1 },
  });
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

describe("extractHandoffBrief", () => {
  it("parses a valid brief and strips the comment from the prose", () => {
    const text =
      "Zichtbare bijdrage van de strateeg.\n\n" +
      '<!-- handoff-brief {"decisions":["Kies merkcampagne"],"keyFacts":["Budget 1500"],"openQuestions":[],"forNext":"Schrijf RSA","clientFacing":true,"touchesLiveAccount":false} -->';
    const { brief, stripped } = extractHandoffBrief(text);
    expect(stripped).toBe("Zichtbare bijdrage van de strateeg.");
    expect(stripped).not.toContain("handoff-brief");
    expect(brief).not.toBeNull();
    expect(brief?.decisions).toEqual(["Kies merkcampagne"]);
    expect(brief?.keyFacts).toEqual(["Budget 1500"]);
    expect(brief?.forNext).toBe("Schrijf RSA");
    expect(brief?.clientFacing).toBe(true);
    expect(brief?.touchesLiveAccount).toBe(false);
  });

  it("returns brief:null but still strips on malformed JSON", () => {
    const text =
      "Prose.\n<!-- handoff-brief {not valid json,,, } -->";
    const { brief, stripped } = extractHandoffBrief(text);
    expect(brief).toBeNull();
    expect(stripped).toBe("Prose.");
    expect(stripped).not.toContain("handoff-brief");
  });

  it("returns brief:null for an entirely empty brief, still stripping it", () => {
    const text =
      'Prose.\n<!-- handoff-brief {"decisions":[],"keyFacts":[],"openQuestions":[],"forNext":"","clientFacing":null,"touchesLiveAccount":null} -->';
    const { brief, stripped } = extractHandoffBrief(text);
    expect(brief).toBeNull();
    expect(stripped).toBe("Prose.");
  });

  it("returns brief:null and the unchanged prose when there is no brief", () => {
    const { brief, stripped } = extractHandoffBrief("Just prose, no brief.");
    expect(brief).toBeNull();
    expect(stripped).toBe("Just prose, no brief.");
  });

  it("strips EVERY brief block, even a stray second one", () => {
    const text =
      "Prose.\n" +
      '<!-- handoff-brief {"decisions":["Een"]} -->\n' +
      'tussentekst\n<!-- handoff-brief {"decisions":["Twee"]} -->';
    const { brief, stripped } = extractHandoffBrief(text);
    // First block wins for the payload.
    expect(brief?.decisions).toEqual(["Een"]);
    // No comment survives in the prose.
    expect(stripped).not.toContain("handoff-brief");
    expect(stripped).toContain("tussentekst");
  });
});

describe("resolveBriefGateFlags", () => {
  it("returns null flags when no brief states them (fall back to routing)", () => {
    expect(resolveBriefGateFlags([])).toEqual({
      clientFacing: null,
      touchesLiveAccount: null,
    });
  });

  it("lets the LAST explicit clientFacing win", () => {
    const flags = resolveBriefGateFlags([
      makeEngineBrief({ clientFacing: true }),
      makeEngineBrief({ clientFacing: false }),
    ]);
    expect(flags.clientFacing).toBe(false);
  });

  it("ORs touchesLiveAccount and never downgrades it", () => {
    const flags = resolveBriefGateFlags([
      makeEngineBrief({ touchesLiveAccount: true }),
      makeEngineBrief({ touchesLiveAccount: false }),
    ]);
    expect(flags.touchesLiveAccount).toBe(true);
  });
});

describe("runGeneration — handoff briefs (integration)", () => {
  it("strips each agent's brief from the archive and forwards a clean recap to the next agent", async () => {
    h.streamImpl = streamSequence([
      'Lead bijdrage.\n<!-- handoff-brief {"decisions":["Merkcampagne eerst"],"forNext":"Schrijf advertenties"} -->',
      "Tweede bijdrage.",
    ]);

    const { promise } = run(
      makeCtx({
        teamPaths: ["agents/lead.md", "agents/copy.md"],
        memberTitles: ["Lead", "Copywriter"],
        stages: [[0], [1]],
      }),
    );
    await promise;

    // The archived markdown never contains the raw brief comment.
    const markdown = String(saveGenerationMock.mock.calls[0][0].finalMarkdown);
    expect(markdown).toContain("Lead bijdrage.");
    expect(markdown).not.toContain("handoff-brief");

    // The second agent's context received the parsed brief as a clean recap.
    const calls = (buildGenerationContext as unknown as Mock).mock.calls;
    const secondCall = calls.find(
      (c) => (c[0] as { agentPath: string }).agentPath === "agents/copy.md",
    );
    expect(secondCall).toBeTruthy();
    const briefs = (
      secondCall?.[0] as { team?: { handoffBriefs?: unknown[] } }
    ).team?.handoffBriefs as Array<{ agent: string; decisions: string[] }>;
    expect(briefs?.[0]?.agent).toBe("Lead");
    expect(briefs?.[0]?.decisions).toEqual(["Merkcampagne eerst"]);
  });

  it("persists each agent's brief as JSON on its own audit step", async () => {
    h.streamImpl = streamSequence([
      'Lead bijdrage.\n<!-- handoff-brief {"decisions":["Merkcampagne eerst"],"keyFacts":["Budget 1500"],"openQuestions":[],"forNext":"Schrijf advertenties","clientFacing":true,"touchesLiveAccount":false} -->',
      "Tweede bijdrage zonder brief.",
    ]);

    const { promise } = run(
      makeCtx({
        teamPaths: ["agents/lead.md", "agents/copy.md"],
        memberTitles: ["Lead", "Copywriter"],
        stages: [[0], [1]],
      }),
    );
    await promise;

    const steps = saveGenerationStepsMock.mock.calls[0][0] as Array<{
      agentTitle: string;
      handoffBrief?: string | null;
    }>;

    // The lead's brief is stored as JSON on its own step.
    const lead = steps.find((s) => s.agentTitle === "Lead");
    expect(lead?.handoffBrief).toBeTruthy();
    const parsed = JSON.parse(lead!.handoffBrief as string) as {
      decisions: string[];
      forNext: string;
      clientFacing: boolean;
    };
    expect(parsed.decisions).toEqual(["Merkcampagne eerst"]);
    expect(parsed.forNext).toBe("Schrijf advertenties");
    expect(parsed.clientFacing).toBe(true);

    // The agent without a brief carries null (nothing to surface).
    const copy = steps.find((s) => s.agentTitle === "Copywriter");
    expect(copy?.handoffBrief ?? null).toBeNull();
  });

  it("streams each agent's parsed brief live as an agent_brief event", async () => {
    h.streamImpl = streamSequence([
      'Lead bijdrage.\n<!-- handoff-brief {"decisions":["Merkcampagne eerst"],"keyFacts":["Budget 1500"],"openQuestions":[],"forNext":"Schrijf advertenties","clientFacing":true,"touchesLiveAccount":false} -->',
      "Tweede bijdrage zonder brief.",
    ]);

    const { sink, promise } = run(
      makeCtx({
        teamPaths: ["agents/lead.md", "agents/copy.md"],
        memberTitles: ["Lead", "Copywriter"],
        stages: [[0], [1]],
      }),
    );
    await promise;

    const briefEvents = sink.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .filter((e) => e.type === "agent_brief");

    // Only the agent that emitted a valid brief surfaces one live, on its index.
    expect(briefEvents).toHaveLength(1);
    const ev = briefEvents[0];
    expect(ev.index).toBe(0);
    const brief = ev.brief as {
      decisions: string[];
      forNext: string;
      clientFacing: boolean;
      agent: string;
    };
    expect(brief.decisions).toEqual(["Merkcampagne eerst"]);
    expect(brief.forNext).toBe("Schrijf advertenties");
    expect(brief.clientFacing).toBe(true);
    expect(brief.agent).toBe("Lead");
  });

  it("skips the planned Humanizer when a brief downgrades clientFacing", async () => {
    // Routing planned client-facing (so the Humanizer IS in the plan), but the
    // team's brief reveals the output is internal — the Humanizer is skipped at
    // execution while the always-on reviewer still runs.
    h.streamImpl = streamSequence([
      'Interne analyse.\n<!-- handoff-brief {"clientFacing":false} -->',
      "Verdict: ok.",
    ]);

    const { sink, promise } = run(
      makeCtx({ qcEnabled: true, clientFacing: true }),
    );
    await promise;

    // The Humanizer was planned up front (routing said client-facing)...
    const plan = sink.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .find((e) => e.type === "plan");
    const modes = (plan?.qc as Array<{ mode: string }>).map((q) => q.mode);
    expect(modes).toContain("humanizer");

    // ...but the brief downgrade means only ONE quality step ran (the reviewer),
    // i.e. the Humanizer was skipped.
    const steps = saveGenerationStepsMock.mock.calls[0][0] as Array<{
      role: string;
    }>;
    expect(steps.filter((s) => s.role === "quality").length).toBe(1);
  });

  it("surfaces the live-account note when a brief upgrades touchesLiveAccount", async () => {
    h.streamImpl = streamSequence([
      'Bod-aanpassingen.\n<!-- handoff-brief {"touchesLiveAccount":true} -->',
    ]);

    const { sink, promise } = run(
      makeCtx({ touchesLiveAccount: false }),
    );
    await promise;

    const notes = sink.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .filter((e) => e.type === "deliverable_note");
    expect(
      notes.some((n) =>
        String(n.message).includes("raakt live uitgaven"),
      ),
    ).toBe(true);
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

describe("toClientFacingReport", () => {
  it("keeps client-facing prose untouched", () => {
    const md = "## Wat we voorstellen\n\nWe optimaliseren je campagnes.";
    expect(toClientFacingReport(md)).toBe(md);
  });

  it("drops internal-only heading sections", () => {
    const md = [
      "## Voorstel",
      "",
      "Een korte intro.",
      "",
      "## Interne nota's",
      "",
      "Niet voor de klant.",
    ].join("\n");
    const out = toClientFacingReport(md);
    expect(out).toContain("Een korte intro.");
    expect(out).not.toContain("Interne nota's");
    expect(out).not.toContain("Niet voor de klant.");
  });

  it("drops sections that are essentially just a placeholder", () => {
    const md = [
      "## Resultaten",
      "",
      "[AAN TE VULLEN]",
      "",
      "## Aanpak",
      "",
      "Concrete stappen die we zetten voor je account.",
    ].join("\n");
    const out = toClientFacingReport(md);
    expect(out).not.toContain("[AAN TE VULLEN]");
    expect(out).toContain("Concrete stappen die we zetten voor je account.");
  });
});

describe("stripHumanizerMeta", () => {
  it("keeps only the humanized version and drops QC meta (heading form)", () => {
    const md = [
      "## Humanized version",
      "",
      "Hi Axel,",
      "",
      "Bedankt voor je reactie. We pakken de kost per conversie aan.",
      "",
      "Met vriendelijke groeten,",
      "Lore",
      "",
      "## Wat veranderde",
      "",
      "- Openingszin korter gemaakt.",
      "",
      "## Preserved",
      "Alle feiten behouden.",
      "",
      "## Flags",
      "Geen.",
    ].join("\n");
    const out = stripHumanizerMeta(md);
    expect(out).toContain("Hi Axel,");
    expect(out).toContain("Met vriendelijke groeten,");
    expect(out).not.toContain("Humanized version");
    expect(out).not.toContain("Wat veranderde");
    expect(out).not.toContain("Preserved");
    expect(out).not.toContain("Flags");
    expect(out).not.toContain("Openingszin korter");
  });

  it("handles numbered/bold labels and English meta titles", () => {
    const md = [
      "1. **Humanized version**",
      "",
      "Hello, here is the reply.",
      "",
      "2. **What changed**",
      "Tone tweaks.",
      "3. **Flags**",
      "None.",
    ].join("\n");
    const out = stripHumanizerMeta(md);
    expect(out).toBe("Hello, here is the reply.");
  });

  it("returns plain prose unchanged when there is no QC structure", () => {
    const md = "Hi Axel,\n\nAlles is in orde.\n\nGroeten,\nLore";
    expect(stripHumanizerMeta(md)).toBe(md);
  });

  describe("runGeneration — fan-out with selection", () => {
    // A workflow doc carrying the opt-in marker; ctx.fanout is parsed from it.
    const fanoutWorkflow = (n: number) => ({
      path: "workflows/ad-copy.md",
      title: "Ad Copy",
      content: `<!-- fanout: ${n} -->\n\n# Ad Copy`,
    });

    it("runs the lead N times in parallel and forwards only the winner", async () => {
      // Each successive lead candidate gets a distinct text; the selection pass
      // (create) picks variant 2.
      h.streamImpl = streamSequence([
        "Candidate angle one.",
        "Candidate angle two.",
        "Candidate angle three.",
      ]);
      let createCalls = 0;
      h.createImpl = async () => {
        createCalls += 1;
        return {
          content: [
            {
              type: "text",
              text: "WINNER: 2\nRATIONALE: Variant 2 heeft de sterkste hook en blijft policy-conform.",
            },
          ],
          usage: { input_tokens: 5, output_tokens: 5 },
        };
      };

      const { sink, promise } = run(
        makeCtx({
          teamPaths: ["agents/ad-copywriter.md"],
          memberTitles: ["Ad Copywriter"],
          workflowPath: "workflows/ad-copy.md",
          workflowDoc: fanoutWorkflow(3) as never,
          fanout: 3,
        }),
      );
      const result = await promise;

      expect(result.status).toBe("completed");
      // The selection (best-of) ranking ran exactly once over the candidates.
      expect(createCalls).toBe(1);

      // Only the winning candidate's text is archived; the losers are gone.
      const saved = saveGenerationMock.mock.calls[0][0];
      const markdown = String(saved.finalMarkdown);
      expect(markdown).toContain("Candidate angle two.");
      expect(markdown).not.toContain("Candidate angle one.");
      expect(markdown).not.toContain("Candidate angle three.");

      // The rationale is recorded in the archive under its own heading.
      expect(markdown).toContain("## Fan-out — interne selectie");
      expect(markdown).toContain("sterkste hook");

      // The winner is streamed to the client under the lead index.
      expect(sink).toHaveBeenCalledWith(
        expect.objectContaining({ content: "Candidate angle two.", index: 0 }),
      );
    });

    it("records the selection as its own audit step attributed to the workflow", async () => {
      h.streamImpl = streamSequence(["One.", "Two."]);
      h.createImpl = async () => ({
        content: [{ type: "text", text: "WINNER: 1\nRATIONALE: Beste keuze." }],
        usage: { input_tokens: 3, output_tokens: 3 },
      });

      const { promise } = run(
        makeCtx({
          teamPaths: ["agents/ad-copywriter.md"],
          memberTitles: ["Ad Copywriter"],
          workflowPath: "workflows/ad-copy.md",
          fanout: 2,
        }),
      );
      await promise;

      const steps = saveGenerationStepsMock.mock.calls[0][0] as Array<{
        role: string;
        status: string;
        agentPath: string;
        stepOrder: number;
      }>;
      const selection = steps.find((s) => s.role === "selection");
      expect(selection).toBeTruthy();
      // Attributed to the workflow (not an agent) so it never pollutes agent KPIs.
      expect(selection?.agentPath).toBe("workflows/ad-copy.md");
      // Step orders are unique across the whole run (no collision with the lead).
      const orders = steps.map((s) => s.stepOrder);
      expect(new Set(orders).size).toBe(orders.length);
    });

    it("skips the selection model call when only one candidate is usable", async () => {
      // First candidate yields text; the rest yield empty (no usable text).
      let call = 0;
      h.streamImpl = () => {
        const text = call === 0 ? "Only usable candidate." : "";
        call += 1;
        return {
          async *[Symbol.asyncIterator]() {
            if (text) {
              yield {
                type: "content_block_delta",
                delta: { type: "text_delta", text },
              };
            }
          },
          finalMessage: async () => ({
            stop_reason: "end_turn",
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        };
      };
      let createCalls = 0;
      h.createImpl = async () => {
        createCalls += 1;
        return { content: [{ type: "text", text: "" }], usage: {} };
      };

      const { promise } = run(
        makeCtx({
          teamPaths: ["agents/ad-copywriter.md"],
          memberTitles: ["Ad Copywriter"],
          workflowPath: "workflows/ad-copy.md",
          fanout: 3,
        }),
      );
      const result = await promise;

      expect(result.status).toBe("completed");
      // No ranking needed for a single usable candidate.
      expect(createCalls).toBe(0);
      const markdown = String(saveGenerationMock.mock.calls[0][0].finalMarkdown);
      expect(markdown).toContain("Only usable candidate.");
    });

    it("falls back to the first usable candidate when selection fails (best-effort)", async () => {
      h.streamImpl = streamSequence(["First angle.", "Second angle."]);
      h.createImpl = async () => {
        throw new Error("selector model exploded");
      };

      const { promise } = run(
        makeCtx({
          teamPaths: ["agents/ad-copywriter.md"],
          memberTitles: ["Ad Copywriter"],
          workflowPath: "workflows/ad-copy.md",
          fanout: 2,
        }),
      );
      const result = await promise;

      // A selection failure degrades the run to partial but never discards work.
      expect(result.status).toBe("partial");
      const markdown = String(saveGenerationMock.mock.calls[0][0].finalMarkdown);
      // The first usable candidate is forwarded.
      expect(markdown).toContain("First angle.");
      expect(markdown).not.toContain("Second angle.");
    });

    it("leaves a non-opted workflow completely unchanged (single lead run, no selection)", async () => {
      h.streamImpl = streamSequence(["Single lead output."]);
      let createCalls = 0;
      h.createImpl = async () => {
        createCalls += 1;
        return { content: [{ type: "text", text: "" }], usage: {} };
      };

      const { sink, promise } = run(
        makeCtx({
          teamPaths: ["agents/ad-copywriter.md"],
          memberTitles: ["Ad Copywriter"],
          workflowPath: "workflows/ad-copy.md",
          // No fanout marker / fanout 0 ⇒ behaves exactly as before.
        }),
      );
      const result = await promise;

      expect(result.status).toBe("completed");
      expect(createCalls).toBe(0);
      const steps = saveGenerationStepsMock.mock.calls[0][0] as Array<{
        role: string;
      }>;
      expect(steps.some((s) => s.role === "selection")).toBe(false);
      const markdown = String(saveGenerationMock.mock.calls[0][0].finalMarkdown);
      expect(markdown).toContain("Single lead output.");
      expect(markdown).not.toContain("## Fan-out — interne selectie");
      expect(sink).toHaveBeenCalledWith(
        expect.objectContaining({ content: "Single lead output.", index: 0 }),
      );
    });
  });

  it("only triggers on standalone meta-label lines, not inline mentions", () => {
    const md = [
      "## Humanized version",
      "",
      "Hi Axel,",
      "",
      "We flaggen niets bijzonders en alle cijfers blijven preserved zoals besproken.",
      "",
      "Groeten,",
      "Lore",
      "",
      "## Flags",
      "Geen.",
    ].join("\n");
    const out = stripHumanizerMeta(md);
    expect(out).toContain("We flaggen niets bijzonders en alle cijfers blijven preserved");
    expect(out).toContain("Groeten,");
    expect(out).not.toContain("## Flags");
    expect(out).not.toContain("Geen.");
  });

  it("drops any preamble before the humanized label", () => {
    const md = [
      "Here is my pass:",
      "",
      "## Humanized version",
      "",
      "De definitieve tekst.",
      "",
      "## Preserved",
      "Niets gewijzigd aan de feiten.",
    ].join("\n");
    const out = stripHumanizerMeta(md);
    expect(out).toBe("De definitieve tekst.");
  });
});
