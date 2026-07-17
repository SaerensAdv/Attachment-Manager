import { describe, it, expect, vi } from "vitest";

/**
 * The client is OPTIONAL across the generation contract: an empty clientPath
 * means internal/agency-general work. These tests pin that an opdracht resolves
 * (and the routing prompt reads) WITHOUT a client, while a present-but-invalid
 * client is still rejected and the other required fields stay required.
 */

type Doc = {
  path: string;
  title: string;
  content: string;
  category: string;
  active?: boolean;
};

const docs: Record<string, Doc> = {
  "agents/orchestrator.md": {
    path: "agents/orchestrator.md",
    title: "Orchestrator",
    content: "routing guide",
    category: "agent",
  },
  "agents/strategist.md": {
    path: "agents/strategist.md",
    title: "Strateeg",
    content: "strateeg-rol",
    category: "agent",
  },
  "agents/paused.md": {
    path: "agents/paused.md",
    title: "Gepauzeerd",
    content: "gepauzeerde-rol",
    category: "agent",
    active: false,
  },
  "workflows/wf.md": {
    path: "workflows/wf.md",
    title: "Workflow: Algemeen",
    content: "stappen",
    category: "workflow",
  },
  "clients/acme.md": {
    path: "clients/acme.md",
    title: "Acme",
    content: "klantcontext",
    category: "client",
  },
};

vi.mock("./docs", () => ({
  getDocFile: (p: string, extra: Doc[] = []) =>
    docs[p] ?? extra.find((d) => d.path === p) ?? null,
  parseFanoutMarker: () => 0,
  MAX_FANOUT: 5,
}));

vi.mock("./clients-store", () => ({
  loadClientDocs: vi.fn(async () => [] as Doc[]),
}));

import { resolveGenerationContext } from "./generation-routing";
import { buildRoutingPrompt } from "./route-request";

const base = {
  agentPath: "agents/strategist.md",
  workflowPath: "workflows/wf.md",
  request: "Maak een interne checklist voor onze onboarding.",
};

describe("resolveGenerationContext — optional client", () => {
  it("resolves without a client (empty client fields)", async () => {
    const res = await resolveGenerationContext(base);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ctx.clientPath).toBe("");
    expect(res.ctx.clientName).toBe("");
    expect(res.ctx.clientContent).toBe("");
    // A markdown deliverable is client-facing by default.
    expect(res.ctx.clientFacing).toBe(true);
  });

  it("resolves with a valid client (client fields filled)", async () => {
    const res = await resolveGenerationContext({
      ...base,
      clientPath: "clients/acme.md",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ctx.clientPath).toBe("clients/acme.md");
    expect(res.ctx.clientName).toBe("Acme");
    expect(res.ctx.clientContent).toBe("klantcontext");
  });

  it("still rejects a present-but-invalid client", async () => {
    const res = await resolveGenerationContext({
      ...base,
      clientPath: "clients/ghost.md",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
  });

  it("still requires agent, workflow and request", async () => {
    expect((await resolveGenerationContext({ ...base, agentPath: "" })).ok).toBe(
      false,
    );
    expect(
      (await resolveGenerationContext({ ...base, workflowPath: "" })).ok,
    ).toBe(false);
    expect((await resolveGenerationContext({ ...base, request: "" })).ok).toBe(
      false,
    );
  });
});

describe("resolveGenerationContext — paused agents", () => {
  it("refuses with a paused-specific message when the only agent is paused", async () => {
    const res = await resolveGenerationContext({
      ...base,
      agentPath: "agents/paused.md",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
    expect(res.error).toContain("gepauzeerd");
  });

  it("silently drops a paused agent but keeps the active team members", async () => {
    const res = await resolveGenerationContext({
      ...base,
      agentPath: "agents/strategist.md",
      additionalAgentPaths: ["agents/paused.md"],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.ctx.teamPaths).toEqual(["agents/strategist.md"]);
  });
});

describe("buildRoutingPrompt — optional client", () => {
  const args = { workflows: [], agents: [] };

  it("renders the no-client (internal/agency) wording when clientTitle is null", () => {
    const prompt = buildRoutingPrompt({ clientTitle: null, ...args });
    expect(prompt).toContain("geen specifieke klant");
    expect(prompt).not.toContain("De opdracht betreft de klant:");
  });

  it("names the client when one is selected", () => {
    const prompt = buildRoutingPrompt({ clientTitle: "Acme", ...args });
    expect(prompt).toContain("De opdracht betreft de klant: Acme.");
  });
});
