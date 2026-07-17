import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDocsRoot, splitFrontmatter } from "../lib/docs";

function value(frontmatter: string | null, key: string): string | null {
  if (!frontmatter) return null;
  const match = frontmatter.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+?)\\s*$`, "im"));
  return match?.[1]?.trim() ?? null;
}

describe("agent lifecycle frontmatter", () => {
  it("keeps lifecycle reason and pause date available to the API contract", () => {
    const raw = [
      "---",
      "active: false",
      "paused_date: 2026-07-17",
      "reason: No runs in 30 days",
      "---",
      "# Agent",
    ].join("\n");
    const fm = splitFrontmatter(raw).frontmatter;
    expect(value(fm, "paused_date")).toBe("2026-07-17");
    expect(value(fm, "reason")).toBe("No runs in 30 days");
  });

  it("the repository doc root stays readable for lifecycle enrichment", () => {
    expect(() => readFileSync(join(getDocsRoot(), "AGENTS.md"), "utf8")).not.toThrow();
  });
});
