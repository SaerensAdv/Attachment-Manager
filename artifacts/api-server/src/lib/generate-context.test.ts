import { describe, it, expect, vi } from "vitest";

/**
 * The final QC gate (humanizer / reviewer) runs as a lone agent — it is given
 * `qc.draft` but NO `team`. This asserts the draft actually reaches the system
 * prompt in that lone-agent case; if the QC block were gated on team membership
 * the reviewer/humanizer would silently run without the team's output to review.
 */

const docs: Record<string, { path: string; title: string; content: string }> = {
  "AGENTS.md": { path: "AGENTS.md", title: "Global", content: "global rules" },
  "agents/qa-compliance-reviewer.md": {
    path: "agents/qa-compliance-reviewer.md",
    title: "QA & Compliance Reviewer",
    content: "review role",
  },
  "agents/humanizer.md": {
    path: "agents/humanizer.md",
    title: "Humanizer",
    content: "humanize role",
  },
  "clients/acme.md": {
    path: "clients/acme.md",
    title: "Acme",
    content: "client context",
  },
  "workflows/wf.md": {
    path: "workflows/wf.md",
    title: "Workflow",
    content: "workflow steps",
  },
};

vi.mock("./docs", () => ({
  getDocFile: (p: string) => docs[p] ?? null,
}));

vi.mock("./retrieval", () => ({
  selectRelevantDocs: vi.fn(async () => ({ knowledge: [], templates: [] })),
}));

import { buildGenerationContext } from "./generate-context";

const DRAFT = "## Copywriter\n\nEERSTE DRAFT TEKST VAN HET TEAM.";

describe("buildGenerationContext QC framing", () => {
  it("includes the team draft for a lone reviewer (no team set)", async () => {
    const { systemPrompt } = await buildGenerationContext({
      agentPath: "agents/qa-compliance-reviewer.md",
      clientPath: "clients/acme.md",
      workflowPath: "workflows/wf.md",
      qc: { mode: "reviewer", draft: DRAFT },
    });
    expect(systemPrompt).toContain("EERSTE DRAFT TEKST VAN HET TEAM.");
  });

  it("includes the team draft for a lone humanizer (no team set)", async () => {
    const { systemPrompt } = await buildGenerationContext({
      agentPath: "agents/humanizer.md",
      clientPath: "clients/acme.md",
      workflowPath: "workflows/wf.md",
      qc: { mode: "humanizer", draft: DRAFT },
    });
    expect(systemPrompt).toContain("EERSTE DRAFT TEKST VAN HET TEAM.");
  });

  it("omits QC framing entirely for a normal lone executor", async () => {
    const { systemPrompt } = await buildGenerationContext({
      agentPath: "agents/humanizer.md",
      clientPath: "clients/acme.md",
      workflowPath: "workflows/wf.md",
    });
    expect(systemPrompt).not.toContain("EERSTE DRAFT TEKST VAN HET TEAM.");
  });
});
