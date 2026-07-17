import { describe, expect, it } from "vitest";
import { buildKnowledgeItem } from "./knowledge-contract";
import type { DocFile } from "./docs";

function doc(path: string): DocFile {
  return {
    id: path,
    path,
    title: "Title",
    category: path.startsWith("clients/db/") ? "client" : "knowledge",
    summary: null,
    fanout: null,
    active: true,
    content: "# Title\n\nBody",
  };
}

describe("knowledge item contract", () => {
  it("marks repository knowledge read-only with a canonical URL", () => {
    const item = buildKnowledgeItem(doc("knowledge/x.md"), []);
    expect(item.source).toBe("github");
    expect(item.editable).toBe(false);
    expect(item.canonicalUrl).toContain("/blob/main/knowledge/x.md");
  });

  it("does not fabricate a canonical URL for synthetic client cache docs", () => {
    const item = buildKnowledgeItem(doc("clients/db/42.md"), []);
    expect(item.source).toBe("replit-cache");
    expect(item.canonicalUrl).toBeNull();
    expect(item.updatedAt).toBeNull();
  });
});
