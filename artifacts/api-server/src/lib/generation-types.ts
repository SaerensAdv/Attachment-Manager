import type { DocFile } from "./docs";
import type { DeliverableKind } from "./deliverables";

/** A sink for streamed events. SSE writes them to the client; autonomous no-ops. */
export type GenerationSink = (payload: unknown) => void;

/**
 * Inbound-reply context attached by the email poller (Phase 2). When present on
 * a run whose workflow declares the `email-reply` deliverable, the engine holds
 * a team-drafted reply for approval instead of sending anything, carrying the
 * threading headers needed to land the reply in the original Gmail conversation.
 */
export interface EmailReplyContext {
  /** FK to the email_threads row this conversation belongs to. */
  emailThreadId: number;
  /** Gmail threadId to attach the reply to. */
  gmailThreadId: string;
  /** The whitelisted client recipient (client.reportEmail). */
  recipient: string;
  /** Subject for the reply (e.g. "Re: <original subject>"). */
  subject: string;
  /** Message-ID of the client's inbound message we are replying to. */
  inReplyTo: string | null;
  /** Space-separated References chain (the thread's Message-IDs so far). */
  references: string | null;
  /** The client's inbound message text, kept so a human can review in context. */
  inboundText: string;
}

export interface GenerationContext {
  teamPaths: string[];
  memberTitles: string[];
  clientPath: string;
  clientName: string;
  clientContent: string;
  workflowPath: string;
  workflowTitle: string;
  workflowDoc: DocFile | null;
  deliverableKind: DeliverableKind;
  request: string;
  clientDocs: DocFile[];
  /**
   * Set by the inbound email poller for an `email-reply` run; carries the thread
   * + inbound message so the engine can hold a threaded reply for approval.
   */
  emailReply?: EmailReplyContext;
  /**
   * Execution plan as groups of indices into `teamPaths`. Each group runs in
   * order; agents WITHIN a group run in parallel (independent branches that all
   * build on the same prior work). Defaults to one agent per stage (fully
   * sequential). Every teamPath index appears exactly once.
   */
  stages: number[][];
  /**
   * Whether the team's output is itself the client-facing text (so the
   * Humanizer language pass applies). False for structured artifacts (CSV,
   * Replit prompt, e-mailed report) where the team work is intermediate.
   */
  clientFacing: boolean;
  /** Run the final QC gate (QA & Compliance always; Humanizer if clientFacing). */
  qcEnabled: boolean;
  /** The work touches live spend, tracking or accounts (human-approval note). */
  touchesLiveAccount: boolean;
  /**
   * Fan-out-with-selection: when >= 2, the LEAD agent (index 0) runs this many
   * times with diversity seeds and a best-of selection pass picks the strongest
   * candidate before its output flows downstream. 0 (the default) disables
   * fan-out — the lead runs once, exactly as every non-opted workflow does.
   */
  fanout: number;
}

export type ResolveResult =
  | { ok: true; ctx: GenerationContext }
  | { ok: false; status: number; error: string };

/** The outcome of a run, used by callers to report to the client. */
export interface GenerationResult {
  status: string;
  archived: boolean;
  generationId: number | null;
  finalMarkdown: string;
  aborted: boolean;
  // Set to "pending" when a client-facing deliverable was drafted but is held
  // for human approval before it reaches the client (otherwise null).
  approvalStatus: string | null;
  error?: string;
}

export interface StepRecord {
  agentPath: string;
  agentTitle: string;
  stepOrder: number;
  role: string;
  status: string;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  charCount: number | null;
  errorMessage: string | null;
  /**
   * The agent's parsed handoff brief, serialized to JSON, for the per-agent
   * audit panel. Only set for executor steps that emitted a valid brief; left
   * undefined for QC / deliverable / approval steps and briefless agents.
   */
  handoffBrief?: string | null;
}

/**
 * The structured result of running one team member against a fixed snapshot of
 * the prior work. Returned instead of thrown so a whole stage can run in
 * parallel and reconcile the outcomes deterministically afterward.
 */
export interface MemberOutcome {
  index: number;
  text: string;
  status: "completed" | "truncated" | "aborted" | "failed";
  truncated: boolean;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  errorMessage: string | null;
  /** Context build failed before any model call — fatal for the run. */
  contextFailed: boolean;
  /** A real mid-stream failure (not an abort) — fatal for the run. */
  streamFailed: boolean;
}
