import { describe, expect, it } from "vitest";
import { clientFieldOwnership, CLICKUP_OWNED_CLIENT_FIELDS } from "./clickup-company-master";

describe("ClickUp company master ownership", () => {
  it("locks identity fields only after a ClickUp link exists", () => {
    expect(clientFieldOwnership(false).clickupOwned).toEqual([]);
    expect(clientFieldOwnership(true).clickupOwned).toEqual([...CLICKUP_OWNED_CLIENT_FIELDS]);
  });

  it("keeps integration configuration Replit-owned", () => {
    const ownership = clientFieldOwnership(true);
    expect(ownership.replitOwned).toContain("googleAdsCustomerId");
    expect(ownership.replitOwned).toContain("ga4PropertyId");
    expect(ownership.derived).toContain("googleAdsLive");
  });
});
