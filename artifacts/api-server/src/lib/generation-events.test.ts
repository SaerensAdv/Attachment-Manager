import { describe, expect, it } from "vitest";
import {
  createGenerationEventEnvelope,
  isGenerationWireEvent,
  type GenerationEvent,
} from "./generation-events";

describe("generation SSE event contract", () => {
  it("adds one correlation id and a monotonic sequence", () => {
    const envelope = createGenerationEventEnvelope();
    const events: GenerationEvent[] = [
      { type: "deliverable_note", message: "read-only" },
      { content: "hello", index: 0 },
      {
        done: true,
        archived: true,
        generationId: 42,
        approvalRequired: false,
      },
    ];
    const wire = events.map(envelope.wrap);

    expect(wire.map((e) => e.sequence)).toEqual([1, 2, 3]);
    expect(new Set(wire.map((e) => e.correlationId)).size).toBe(1);
    expect(wire.every(isGenerationWireEvent)).toBe(true);
  });

  it("rejects unversioned or malformed SSE payloads", () => {
    expect(isGenerationWireEvent({ type: "plan" })).toBe(false);
    expect(
      isGenerationWireEvent({
        type: "deliverable_note",
        message: "x",
        correlationId: "run",
        sequence: 0,
        emittedAt: "not-a-date",
      }),
    ).toBe(false);
  });
});
