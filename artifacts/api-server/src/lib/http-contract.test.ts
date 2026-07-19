import { describe, expect, it } from "vitest";
import { actionResult, apiProblem } from "./http-contract";

describe("shared HTTP contracts", () => {
  it("builds stable safe error envelopes", () => {
    expect(apiProblem({ error: "Unavailable", code: "SOURCE_UNAVAILABLE", retryable: true })).toEqual({
      error: "Unavailable", code: "SOURCE_UNAVAILABLE", detail: null, retryable: true, correlationId: null,
    });
  });

  it("never implies an unverified action succeeded", () => {
    expect(actionResult({ action: "gmail.draft.create", code: "DRAFT_CREATED", message: "Draft created", changed: true, verified: true })).toMatchObject({
      ok: true, changed: true, verified: true, target: null,
    });
  });
});
