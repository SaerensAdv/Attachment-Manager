import { describe, it, expect } from "vitest";
import type { Client } from "@workspace/db";
import {
  clientToMarkdown,
  clientToDoc,
  dbClientPath,
  isDbClientPath,
  dbClientIdFromPath,
} from "./clients-store";

/**
 * Build a Client row for tests. clientToMarkdown only reads specific fields
 * (all via optional chaining), so unspecified fields stay undefined — which is
 * exactly how empty columns behave at runtime.
 */
function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 42,
    name: "Test Client",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  } as Client;
}

describe("client doc-path helpers", () => {
  it("round-trips an id through the synthetic doc path", () => {
    const path = dbClientPath(7);
    expect(path).toBe("clients/db/7.md");
    expect(isDbClientPath(path)).toBe(true);
    expect(dbClientIdFromPath(path)).toBe(7);
  });

  it("rejects non-db paths and invalid ids", () => {
    expect(isDbClientPath("clients/_template.md")).toBe(false);
    expect(dbClientIdFromPath("clients/_template.md")).toBeNull();
    expect(dbClientIdFromPath("clients/db/0.md")).toBeNull();
    expect(dbClientIdFromPath("clients/db/abc.md")).toBeNull();
  });
});

describe("clientToMarkdown", () => {
  it("renders the name as an H1 and omits empty sections", () => {
    const md = clientToMarkdown(makeClient({ name: "Acme NV" }));
    expect(md).toContain("# Client: Acme NV");
    // No data was provided, so no field sections should be emitted.
    expect(md).not.toContain("## Business");
    expect(md).not.toContain("## Links");
  });

  it("includes populated paragraph and bullet sections", () => {
    const md = clientToMarkdown(
      makeClient({
        business: "Sells widgets",
        services: "Widgets\nGadgets",
        website: "https://example.com",
      }),
    );
    expect(md).toContain("## Business\n\nSells widgets");
    expect(md).toContain("## Services / Products\n\n- Widgets\n- Gadgets");
    expect(md).toContain("## Links");
    expect(md).toContain("- Website: https://example.com");
  });

  it("escapes a backtick fence inside pasted code-block data", () => {
    // Pasted Google Ads data that itself contains a ``` fence must not be able
    // to close the markdown code block early (markdown injection guard).
    const md = clientToMarkdown(
      makeClient({ googleAdsLive: "before\n```\nmalicious\n```\nafter" }),
    );
    expect(md).toContain("## Google Ads live performance");
    // The opening fence must be longer than any backtick run in the content.
    expect(md).toContain("````\nbefore");
  });
});

describe("clientToDoc", () => {
  it("produces a client-category DocFile with the synthetic path", () => {
    const doc = clientToDoc(makeClient({ id: 3, name: "Foo" }));
    expect(doc.id).toBe("clients/db/3.md");
    expect(doc.path).toBe("clients/db/3.md");
    expect(doc.category).toBe("client");
    expect(doc.title).toBe("Client: Foo");
    expect(doc.content).toContain("# Client: Foo");
  });
});
