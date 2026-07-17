import type { DocFile } from "./docs";
import type { DeliverableKind } from "./deliverables";
import type { GenerationEvent } from "./generation-events";

/** A typed sink for streamed events. SSE writes them; autonomous runs no-op. */
export type GenerationSink = (payload: GenerationEvent) => void;

export interface EmailReplyContext {
  emailThreadId: number;
  gmailThreadId: string;
  recipient: string;
  subject: string;
  inReplyTo: string | null;
  references: string | null;
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
  emailReply?: EmailReplyContext;
  stages: number[][];
  clientFacing: boolean;
  qcEnabled: boolean;
  touchesLiveAccount: boolean;
  fanout: number;
}

export type ResolveResult =
  | { ok: true; ctx: GenerationContext }
  | { ok: false; status: number; error: string };

export interface GenerationResult {
  status: string;
  archived: boolean;
  generationId: number | null;
  finalMarkdown: string;
  aborted: boolean;
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
  handoffBrief?: string | null;
}

export interface MemberOutcome {
  index: number;
  text: string;
  status: "completed" | "truncated" | "aborted" | "failed";
  truncated: boolean;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  errorMessage: string | null;
  contextFailed: boolean;
  streamFailed: boolean;
}

export type { GenerationEvent, GenerationWireEvent } from "./generation-events";
