import { describe, it, expect, vi } from "vitest";

/**
 * Unit tests for the partner-key scope parsing/normalization. The DB-backed
 * issue/revoke/verify paths are covered at the route level; here we pin the pure
 * logic that decides which scopes a key actually holds, because it gates every
 * partner request (an over-broad or empty scope list is a security concern).
 *
 * `@workspace/db` is mocked so importing the store doesn't open a pool.
 */

vi.mock("@workspace/db", () => ({
  db: {},
  pool: {},
  partnerKeysTable: {},
}));

import {
  normalizeScopes,
  parseScopes,
  PARTNER_SCOPES,
} from "./partner-keys-store";

describe("normalizeScopes", () => {
  it("defaults to the full scope set for empty/unknown input", () => {
    expect(normalizeScopes(undefined)).toEqual([...PARTNER_SCOPES]);
    expect(normalizeScopes("")).toEqual([...PARTNER_SCOPES]);
    expect(normalizeScopes([])).toEqual([...PARTNER_SCOPES]);
    expect(normalizeScopes("nonsense,foo")).toEqual([...PARTNER_SCOPES]);
  });

  it("accepts a comma string, trims, lowercases and de-dupes", () => {
    expect(normalizeScopes(" Read , read ,WRITE")).toEqual(["read", "write"]);
  });

  it("accepts an array and drops unknown scopes", () => {
    expect(normalizeScopes(["read", "trigger", "admin"])).toEqual([
      "read",
      "trigger",
    ]);
  });

  it("only ever returns valid scopes", () => {
    for (const scope of normalizeScopes("read,write,trigger,delete")) {
      expect(PARTNER_SCOPES).toContain(scope);
    }
  });
});

describe("parseScopes", () => {
  it("round-trips a stored comma-separated string", () => {
    expect(parseScopes("read,write")).toEqual(["read", "write"]);
  });

  it("falls back to the full set on a malformed stored value", () => {
    expect(parseScopes("")).toEqual([...PARTNER_SCOPES]);
  });
});
