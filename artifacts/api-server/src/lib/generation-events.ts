import { randomUUID } from "node:crypto";

export type GenerationRole = "lead" | "member" | "quality";

export interface GenerationPlanMember {
  index: number;
  path: string;
  title: string;
  role: "lead" | "member";
  stage?: number;
}

export interface GenerationPlanQcStep {
  index: number;
  path: string;
  title: string;
  mode: "humanizer" | "reviewer";
}

export interface FanoutCandidateEventItem {
  variant: number;
  text: string;
  status: string;
  winner: boolean;
  reason: string;
}

/**
 * Stable, discriminated contract emitted by the generation engine.
 *
 * The `content`, terminal `done`, and terminal `error` events predate the typed
 * event names and intentionally remain explicit union members for backwards
 * compatibility. New event shapes must be added here before they are emitted.
 */
export type GenerationEvent =
  | {
      type: "plan";
      total: number;
      clientFacing: boolean;
      touchesLiveAccount: boolean;
      stages: GenerationPlanMember[][];
      members: GenerationPlanMember[];
      qc: GenerationPlanQcStep[];
    }
  | { type: "deliverable_note"; message: string }
  | {
      type: "agent_start";
      index: number;
      total: number;
      agent: { path: string; title: string };
      role: GenerationRole;
    }
  | { type: "agent_done"; index: number; truncated: boolean }
  | { type: "agent_brief"; index: number; brief: unknown }
  | {
      type: "fanout_candidates";
      rationale: string;
      candidates: FanoutCandidateEventItem[];
    }
  | {
      type: "deliverable_start";
      deliverable: { title?: string; [key: string]: unknown };
    }
  | { type: "deliverable_delta"; content: string }
  | { type: "deliverable_done"; truncated: boolean }
  | { type: "deliverable_error"; message: string }
  | {
      type: "approval_required";
      recipient: string;
      clientReport: string;
      reviewerVerdict: string | null;
    }
  | { content: string; index: number; type?: never }
  | {
      done: true;
      archived: boolean;
      generationId: number | null;
      approvalRequired: boolean;
      type?: never;
    }
  | { error: string; type?: never };

/** Metadata added at the HTTP/SSE boundary, never by individual agents. */
export interface GenerationEventMeta {
  correlationId: string;
  sequence: number;
  emittedAt: string;
}

export type GenerationWireEvent = GenerationEvent & GenerationEventMeta;

export function createGenerationEventEnvelope() {
  const correlationId = randomUUID();
  let sequence = 0;
  return {
    correlationId,
    wrap(event: GenerationEvent): GenerationWireEvent {
      sequence += 1;
      return {
        ...event,
        correlationId,
        sequence,
        emittedAt: new Date().toISOString(),
      } as GenerationWireEvent;
    },
  };
}

/** Minimal runtime guard for consumers receiving JSON over SSE. */
export function isGenerationWireEvent(value: unknown): value is GenerationWireEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  if (typeof event.correlationId !== "string" || !event.correlationId) return false;
  if (!Number.isInteger(event.sequence) || Number(event.sequence) < 1) return false;
  if (typeof event.emittedAt !== "string" || Number.isNaN(Date.parse(event.emittedAt))) {
    return false;
  }
  if (event.done === true) return typeof event.archived === "boolean";
  if (typeof event.error === "string") return true;
  if (typeof event.content === "string") {
    return event.type === "deliverable_delta" || Number.isInteger(event.index);
  }
  return typeof event.type === "string";
}
