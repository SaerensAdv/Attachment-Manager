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

describe("buildGenerationContext optional client", () => {
  it("states the absence is intentional internal work when no client is set", async () => {
    const { systemPrompt } = await buildGenerationContext({
      agentPath: "agents/humanizer.md",
      clientPath: "",
      workflowPath: "workflows/wf.md",
    });
    expect(systemPrompt).toContain("Er is geen specifieke klant geselecteerd");
    expect(systemPrompt).toContain("intern/algemeen werk");
    // The client's own profile must not leak in when none is selected.
    expect(systemPrompt).not.toContain("client context");
  });

  it("includes the real client context when a client is set", async () => {
    const { systemPrompt } = await buildGenerationContext({
      agentPath: "agents/humanizer.md",
      clientPath: "clients/acme.md",
      workflowPath: "workflows/wf.md",
    });
    expect(systemPrompt).toContain("client context");
    expect(systemPrompt).not.toContain("Er is geen specifieke klant geselecteerd");
  });
});

import {
  renderHandoffSummary,
  HANDOFF_BRIEF_INSTRUCTION,
  type HandoffBrief,
} from "./generate-context";

function makeBrief(over: Partial<HandoffBrief> = {}): HandoffBrief {
  return {
    agent: "Strateeg",
    decisions: [],
    keyFacts: [],
    openQuestions: [],
    forNext: null,
    clientFacing: null,
    touchesLiveAccount: null,
    ...over,
  };
}

describe("renderHandoffSummary", () => {
  it("returns an empty string when there is nothing useful to show", () => {
    expect(renderHandoffSummary([])).toBe("");
    // A brief carrying only the internal flags renders nothing visible.
    expect(
      renderHandoffSummary([
        makeBrief({ clientFacing: true, touchesLiveAccount: true }),
      ]),
    ).toBe("");
  });

  it("renders decisions, key facts, open questions and the next-agent note", () => {
    const out = renderHandoffSummary([
      makeBrief({
        agent: "Strateeg",
        decisions: ["Focus op zoeknetwerk"],
        keyFacts: ["Budget = 1500 EUR/maand"],
        openQuestions: ["Welke landingspagina?"],
        forNext: "Schrijf 3 RSA-varianten.",
      }),
    ]);
    expect(out).toContain("Handoff tot nu toe");
    expect(out).toContain("**Strateeg**");
    expect(out).toContain("Focus op zoeknetwerk");
    expect(out).toContain("Budget = 1500 EUR/maand");
    expect(out).toContain("Welke landingspagina?");
    expect(out).toContain("Schrijf 3 RSA-varianten.");
  });

  it("never renders the internal QC flags", () => {
    const out = renderHandoffSummary([
      makeBrief({
        decisions: ["Iets"],
        clientFacing: true,
        touchesLiveAccount: true,
      }),
    ]);
    expect(out).not.toContain("clientFacing");
    expect(out).not.toContain("touchesLiveAccount");
  });
});

describe("buildGenerationContext handoff brief wiring", () => {
  const teamDocs = {
    ...docs,
    "agents/strateeg.md": {
      path: "agents/strateeg.md",
      title: "Strateeg",
      content: "strategy role",
    },
  };

  it("injects the handoff instruction for an executor and a 'Handoff so far' recap from prior briefs", async () => {
    docs["agents/strateeg.md"] = teamDocs["agents/strateeg.md"];
    const { systemPrompt } = await buildGenerationContext({
      agentPath: "agents/strateeg.md",
      clientPath: "clients/acme.md",
      workflowPath: "workflows/wf.md",
      team: {
        members: ["Lead", "Strateeg"],
        position: 1,
        priorWork: "## Lead\n\nEerste bijdrage.",
        isFinal: true,
        handoffBriefs: [
          makeBrief({ agent: "Lead", decisions: ["Kies merkcampagne"] }),
        ],
      },
    });
    // The executor is told to emit its own brief.
    expect(systemPrompt).toContain(HANDOFF_BRIEF_INSTRUCTION);
    // And it receives the prior team's brief as a clean recap.
    expect(systemPrompt).toContain("Handoff tot nu toe");
    expect(systemPrompt).toContain("Kies merkcampagne");
  });

  it("does NOT inject the handoff instruction for a QC pass", async () => {
    const { systemPrompt } = await buildGenerationContext({
      agentPath: "agents/qa-compliance-reviewer.md",
      clientPath: "clients/acme.md",
      workflowPath: "workflows/wf.md",
      qc: { mode: "reviewer", draft: DRAFT },
    });
    expect(systemPrompt).not.toContain(HANDOFF_BRIEF_INSTRUCTION);
  });
});
