import { anthropic } from "@workspace/integrations-anthropic-ai";
import { buildGenerationContext, type HandoffBrief } from "./generate-context";
import { QC_HUMANIZER_PATH, QC_REVIEWER_PATH } from "./generation-routing";
import type { DocFile } from "./docs";
import type { GenerationSink, StepRecord, MemberOutcome } from "./generation-types";

/**
 * The agent/step runner: runs ONE agent — a team member or a closing QC-gate
 * agent — against a fixed snapshot of the prior work and reports a structured
 * outcome. Pure with respect to the run's shared state: nothing here mutates
 * the orchestrator's step trail, run status or cursors. `runMember` returns its
 * outcome and `runQcStep` returns the step it produced plus whether the run
 * should be downgraded to "partial", and the orchestrator applies those effects
 * (assigning step order, pushing the step, folding the status) in sequence. This
 * keeps the orchestrator the single owner of the audit trail's ordering.
 */

/**
 * Inputs an agent run needs, built once by the orchestrator and shared by every
 * member + QC run. Read-only by convention: nothing here mutates them, but they
 * hold live array references (e.g. clientDocs), so they are not deeply immutable.
 */
export interface AgentRunContext {
  send: GenerationSink;
  signal: AbortSignal;
  isGone: () => boolean;
  grandTotal: number;
  request: string;
  teamPaths: string[];
  memberTitles: string[];
  clientPath: string;
  workflowPath: string;
  clientDocs: DocFile[];
  /** When the QA & Compliance Reviewer will run it owns the single approval
   * section, so executors suppress their own. */
  reviewerWillRun: boolean;
}

/**
 * The result of a QC-gate step. The step carries everything but its order; the
 * orchestrator assigns `stepOrder` from its running counter and pushes it, so
 * the QC steps stay numbered ahead of the deliverable. `downgrade` marks a run
 * "partial" without ever discarding the team's markdown.
 */
export interface QcStepResult {
  text: string;
  step: Omit<StepRecord, "stepOrder">;
  downgrade: boolean;
}

/**
 * Run one team member against a fixed snapshot of the prior work. Returns a
 * structured result (MemberOutcome) instead of throwing so that callers can run
 * a whole stage in parallel and reconcile outcomes deterministically.
 */
export async function runMember(
  rc: AgentRunContext,
  i: number,
  stagePrior: string,
  stageBriefs: HandoffBrief[],
): Promise<MemberOutcome> {
  const path = rc.teamPaths[i];
  const isFinal = i === rc.teamPaths.length - 1;
  const startedAt = Date.now();

  let systemPrompt: string;
  try {
    ({ systemPrompt } = await buildGenerationContext({
      agentPath: path,
      clientPath: rc.clientPath,
      workflowPath: rc.workflowPath,
      extraDocs: rc.clientDocs,
      team: {
        members: rc.memberTitles,
        position: i,
        priorWork: stagePrior,
        isFinal,
        handoffBriefs: stageBriefs,
      },
      // When the QA & Compliance Reviewer will run, it owns the single
      // human-approval section, so no executor writes its own.
      suppressApproval: rc.reviewerWillRun,
    }));
  } catch (err) {
    return {
      index: i,
      text: "",
      status: "failed",
      truncated: false,
      durationMs: Date.now() - startedAt,
      inputTokens: null,
      outputTokens: null,
      errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      contextFailed: true,
      streamFailed: false,
    };
  }

  rc.send({
    type: "agent_start",
    index: i,
    total: rc.grandTotal,
    agent: { path, title: rc.memberTitles[i] },
    role: i === 0 ? "lead" : "member",
  });

  let agentText = "";
  let truncated = false;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  try {
    const stream = anthropic.messages.stream(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: rc.request }],
      },
      { signal: rc.signal },
    );

    for await (const event of stream) {
      if (rc.isGone()) break;
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        agentText += event.delta.text;
        rc.send({ content: event.delta.text, index: i });
      }
    }

    if (!rc.isGone()) {
      const finalMsg = await stream.finalMessage();
      truncated = finalMsg.stop_reason === "max_tokens";
      inputTokens = finalMsg.usage?.input_tokens ?? null;
      outputTokens = finalMsg.usage?.output_tokens ?? null;
    }
  } catch (streamErr) {
    const isAbort =
      streamErr instanceof Error && streamErr.name === "AbortError";
    if (!isAbort && !rc.isGone()) {
      // Real mid-step failure: keep partial output, mark fatal so the
      // caller archives + reports it after reconciling the stage.
      return {
        index: i,
        text: agentText,
        status: "failed",
        truncated: false,
        durationMs: Date.now() - startedAt,
        inputTokens,
        outputTokens,
        errorMessage: (streamErr instanceof Error
          ? streamErr.message
          : String(streamErr)
        ).slice(0, 500),
        contextFailed: false,
        streamFailed: true,
      };
    }
    // Abort: fall through to the aborted outcome below.
  }

  const aborted = rc.isGone();
  if (!aborted) rc.send({ type: "agent_done", index: i, truncated });
  return {
    index: i,
    text: agentText,
    status: aborted ? "aborted" : truncated ? "truncated" : "completed",
    truncated,
    durationMs: Date.now() - startedAt,
    inputTokens,
    outputTokens,
    errorMessage: null,
    contextFailed: false,
    streamFailed: false,
  };
}

/**
 * Run one QC-gate agent over a fixed draft. Best-effort: returns text (empty on
 * failure/abort) plus the step it produced and whether the run should be marked
 * partial. It never throws and never discards the team's work.
 */
export async function runQcStep(
  rc: AgentRunContext,
  mode: "humanizer" | "reviewer",
  index: number,
  title: string,
  draft: string,
): Promise<QcStepResult> {
  const startedAt = Date.now();
  const agentPath = mode === "humanizer" ? QC_HUMANIZER_PATH : QC_REVIEWER_PATH;
  let systemPrompt: string;
  try {
    ({ systemPrompt } = await buildGenerationContext({
      agentPath,
      clientPath: rc.clientPath,
      workflowPath: rc.workflowPath,
      extraDocs: rc.clientDocs,
      qc: { mode, draft },
    }));
  } catch (err) {
    return {
      text: "",
      step: {
        agentPath,
        agentTitle: title,
        role: "quality",
        status: "failed",
        durationMs: Date.now() - startedAt,
        inputTokens: null,
        outputTokens: null,
        charCount: null,
        errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      },
      downgrade: true,
    };
  }

  rc.send({
    type: "agent_start",
    index,
    total: rc.grandTotal,
    agent: {
      path: agentPath,
      title,
    },
    role: "quality",
  });

  let text = "";
  let truncated = false;
  let inTok: number | null = null;
  let outTok: number | null = null;
  let status = "completed";
  try {
    const stream = anthropic.messages.stream(
      {
        model: "claude-sonnet-4-6",
        max_tokens: mode === "humanizer" ? 16000 : 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: rc.request }],
      },
      { signal: rc.signal },
    );
    for await (const event of stream) {
      if (rc.isGone()) break;
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        text += event.delta.text;
        rc.send({ content: event.delta.text, index });
      }
    }
    if (!rc.isGone()) {
      const finalMsg = await stream.finalMessage();
      truncated = finalMsg.stop_reason === "max_tokens";
      inTok = finalMsg.usage?.input_tokens ?? null;
      outTok = finalMsg.usage?.output_tokens ?? null;
    }
    status = rc.isGone() ? "aborted" : truncated ? "truncated" : "completed";
    if (!rc.isGone()) rc.send({ type: "agent_done", index, truncated });
  } catch (qcErr) {
    if (rc.isGone() || (qcErr instanceof Error && qcErr.name === "AbortError")) {
      status = "aborted";
    } else {
      // Best-effort: report, mark partial, keep the team's markdown intact.
      status = "failed";
      rc.send({ type: "agent_done", index, truncated: false });
    }
  }
  const step: Omit<StepRecord, "stepOrder"> = {
    agentPath,
    agentTitle: title,
    role: "quality",
    status,
    durationMs: Date.now() - startedAt,
    inputTokens: inTok,
    outputTokens: outTok,
    charCount: text.length || null,
    errorMessage: null,
  };
  // An aborted pass contributes nothing; the team's work stands.
  return {
    text: status === "aborted" ? "" : text,
    step,
    downgrade: status !== "completed",
  };
}
