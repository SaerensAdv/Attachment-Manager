import { describe, it, expect } from "vitest";
import { aliasLocalPart, headDisplayName, headSignature } from "./email-identity";

describe("email identity helpers", () => {
  it("derives a clean alias local-part from a department id", () => {
    expect(aliasLocalPart("paid-media")).toBe("paidmedia");
    expect(aliasLocalPart("seo-web")).toBe("seoweb");
    expect(aliasLocalPart("content-creative")).toBe("contentcreative");
    expect(aliasLocalPart("client-growth")).toBe("clientgrowth");
  });

  it("builds a From display name, with and without a persona name", () => {
    expect(headDisplayName("Sven", "Paid Media")).toBe(
      "Sven — Paid Media, Saerens Advertising",
    );
    expect(headDisplayName(null, "Paid Media")).toBe(
      "Paid Media — Saerens Advertising",
    );
  });

  it("builds a footer signature, with and without a persona name", () => {
    expect(headSignature("Sven", "Paid Media")).toBe(
      "Sven\nPaid Media · Saerens Advertising",
    );
    expect(headSignature(null, "Paid Media")).toBe(
      "Paid Media\nPaid Media · Saerens Advertising",
    );
  });
});
