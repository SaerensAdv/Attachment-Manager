import { describe, it, expect, afterEach, vi } from "vitest";

// The owner helpers only read process.env; mock the roster so importing this
// module doesn't pull in the docs/portraits graph.
vi.mock("./team", () => ({ getTeamRoster: vi.fn(async () => []) }));

import {
  ownerName,
  ownerDisplayName,
  ownerSignatureText,
} from "./email-identity";

const ORIG = process.env.OWNER_NAME;
afterEach(() => {
  if (ORIG === undefined) delete process.env.OWNER_NAME;
  else process.env.OWNER_NAME = ORIG;
});

describe("owner email identity (all client mail is signed by the owner)", () => {
  it("defaults to the agency owner when OWNER_NAME is unset", () => {
    delete process.env.OWNER_NAME;
    expect(ownerName()).toBe("Axel Saerens");
    expect(ownerDisplayName()).toBe("Axel Saerens — Saerens Advertising");
  });

  it("signs with exactly two lines: owner name, then agency name", () => {
    delete process.env.OWNER_NAME;
    expect(ownerSignatureText()).toBe("Axel Saerens\nSaerens Advertising");
    expect(ownerSignatureText().split("\n")).toEqual([
      "Axel Saerens",
      "Saerens Advertising",
    ]);
  });

  it("honours an OWNER_NAME override", () => {
    process.env.OWNER_NAME = "Jane Doe";
    expect(ownerName()).toBe("Jane Doe");
    expect(ownerDisplayName()).toBe("Jane Doe — Saerens Advertising");
    expect(ownerSignatureText()).toBe("Jane Doe\nSaerens Advertising");
  });

  it("falls back to the default when OWNER_NAME is blank", () => {
    process.env.OWNER_NAME = "   ";
    expect(ownerName()).toBe("Axel Saerens");
  });
});
