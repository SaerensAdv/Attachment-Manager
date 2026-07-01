import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ImprovementProposal } from "@workspace/db";

/**
 * Coverage of the apply/verify contract that backs the accept route's UX
 * feedback: `applyProposal` reports whether it actually wrote the rule (`changed`)
 * vs it already being present, and `verifyProposalApplied` re-reads the on-disk
 * target to honestly confirm the rule landed. Both are exercised over a knowledge
 * (file) target — the real-world case — with node:fs mocked so we control the doc.
 */

vi.mock("./proposals-store", () => ({
  listAcceptedProposals: vi.fn(),
}));
vi.mock("./alerts-store", () => ({ recordAlert: vi.fn(async () => {}) }));

const existsSyncMock = vi.hoisted(() => vi.fn((_p: string) => true));
const readFileSyncMock = vi.hoisted(() => vi.fn((_p: string) => "# Doc\n"));
const writeFileSyncMock = vi.hoisted(() => vi.fn());
vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
}));

vi.mock("./docs", () => ({
  getDocsRoot: () => "/docs",
  listDocFiles: vi.fn(() => []),
}));

vi.mock("./clients-store", () => ({
  loadClientDocs: vi.fn(async () => []),
  isDbClientPath: (p: string) => p.startsWith("clients/db/"),
  dbClientIdFromPath: vi.fn(),
}));

vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@workspace/integrations-anthropic-ai", () => ({ anthropic: {} }));
vi.mock("@workspace/db", () => ({ db: {}, clientsTable: {} }));

type Improvements = typeof import("./improvements");

async function freshModule(): Promise<Improvements> {
  vi.resetModules();
  return import("./improvements");
}

function proposal(over: Partial<ImprovementProposal>): ImprovementProposal {
  return {
    id: 1,
    generationId: 1,
    targetType: "knowledge",
    targetPath: "knowledge/replit-builds.md",
    targetLabel: "Replit Builds",
    rationale: "r",
    proposedText: "Installeer altijd de laatste stabiele versie van Next.js.",
    status: "accepted",
    createdAt: new Date(),
    decidedAt: new Date(),
    ...over,
  };
}

beforeEach(() => {
  existsSyncMock.mockReset();
  existsSyncMock.mockReturnValue(true);
  readFileSyncMock.mockReset();
  readFileSyncMock.mockReturnValue("# Doc\n");
  writeFileSyncMock.mockReset();
});

describe("applyProposal", () => {
  it("reports changed=true when the rule is newly written", async () => {
    const { applyProposal } = await freshModule();
    const res = await applyProposal(proposal({}));
    expect(res).toEqual({ changed: true });
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it("reports changed=false when the rule is already present (idempotent)", async () => {
    const { applyProposal } = await freshModule();
    readFileSyncMock.mockReturnValue(
      "# Doc\n\n## Geleerde regels (uit reviews)\n\n- Installeer altijd de laatste stabiele versie van Next.js.\n",
    );
    const res = await applyProposal(proposal({}));
    expect(res).toEqual({ changed: false });
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it("throws when the target doc no longer exists", async () => {
    const { applyProposal } = await freshModule();
    existsSyncMock.mockReturnValue(false);
    await expect(applyProposal(proposal({}))).rejects.toThrow(
      /bestaat niet meer/,
    );
  });
});

describe("verifyProposalApplied", () => {
  it("confirms present=true when the rule is in the doc", async () => {
    const { verifyProposalApplied } = await freshModule();
    readFileSyncMock.mockReturnValue(
      "# Doc\n\n## Geleerde regels (uit reviews)\n\n- Installeer altijd de laatste stabiele versie van Next.js.\n",
    );
    const res = await verifyProposalApplied(proposal({}));
    expect(res).toEqual({ present: true });
  });

  it("reports present=false when the rule is absent", async () => {
    const { verifyProposalApplied } = await freshModule();
    readFileSyncMock.mockReturnValue("# Doc\n");
    const res = await verifyProposalApplied(proposal({}));
    expect(res).toEqual({ present: false });
  });

  it("reports present=false (never throws) when the doc is gone", async () => {
    const { verifyProposalApplied } = await freshModule();
    existsSyncMock.mockReturnValue(false);
    const res = await verifyProposalApplied(proposal({}));
    expect(res).toEqual({ present: false });
  });
});
