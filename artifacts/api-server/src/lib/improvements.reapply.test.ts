import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ImprovementProposal } from "@workspace/db";

/**
 * Coverage of `reapplyAcceptedFileProposals` — the startup replay that restores
 * durable file-based "learned rules" after a redeploy rebuilds knowledge/*.md
 * from the repo. The contract is: idempotent, best-effort, and never throwing,
 * so a single broken proposal (or an unreadable proposals table) cannot block
 * server boot.
 *
 * Collaborators are mocked by module path: the proposals store feeds the accepted
 * rows; node:fs + ./docs drive the (real) applyToFile so we can assert exactly
 * which docs were written; ./clients-store decides which paths are DB-client
 * targets (those persist in the DB and must be skipped here).
 */

const listAcceptedProposalsMock = vi.hoisted(() => vi.fn());
vi.mock("./proposals-store", () => ({
  listAcceptedProposals: listAcceptedProposalsMock,
}));

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

// The model client is imported at module top but never reached by the replay.
vi.mock("@workspace/integrations-anthropic-ai", () => ({ anthropic: {} }));

// db/clientsTable are imported at module top; the replay's knowledge path never
// touches them, so a bare stub keeps the module loading.
vi.mock("@workspace/db", () => ({ db: {}, clientsTable: {} }));

type Improvements = typeof import("./improvements");

async function freshModule(): Promise<Improvements> {
  vi.resetModules();
  return import("./improvements");
}

/** Build an accepted proposal row with sensible defaults. */
function proposal(over: Partial<ImprovementProposal>): ImprovementProposal {
  return {
    id: 1,
    generationId: 1,
    targetType: "knowledge",
    targetPath: "knowledge/standards.md",
    targetLabel: "Standaarden",
    rationale: "r",
    proposedText: "Gebruik altijd merknaam in kop 1.",
    status: "accepted",
    createdAt: new Date(),
    decidedAt: new Date(),
    ...over,
  };
}

beforeEach(() => {
  listAcceptedProposalsMock.mockReset();
  existsSyncMock.mockReset();
  existsSyncMock.mockReturnValue(true);
  readFileSyncMock.mockReset();
  readFileSyncMock.mockReturnValue("# Doc\n");
  writeFileSyncMock.mockReset();
});

describe("reapplyAcceptedFileProposals", () => {
  it("replays knowledge file rules and skips client (DB) targets", async () => {
    const { reapplyAcceptedFileProposals } = await freshModule();
    listAcceptedProposalsMock.mockResolvedValue([
      proposal({ id: 1, targetPath: "knowledge/standards.md" }),
      // A client target — persists in the DB already, must be skipped here.
      proposal({
        id: 2,
        targetType: "client",
        targetPath: "clients/db/7.md",
      }),
      // A knowledge-typed row that still resolves to a DB-client path: the
      // belt-and-suspenders isDbClientPath guard must also skip it.
      proposal({
        id: 3,
        targetType: "knowledge",
        targetPath: "clients/db/9.md",
      }),
    ]);

    const res = await reapplyAcceptedFileProposals();

    expect(res).toEqual({ applied: 1, skipped: 0 });
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
    expect(writeFileSyncMock.mock.calls[0][0]).toBe("/docs/knowledge/standards.md");
    const written = writeFileSyncMock.mock.calls[0][1] as string;
    expect(written).toContain("## Geleerde regels (uit reviews)");
    expect(written).toContain("- Gebruik altijd merknaam in kop 1.");
  });

  it("is idempotent: a rule already present is not re-written", async () => {
    const { reapplyAcceptedFileProposals } = await freshModule();
    readFileSyncMock.mockReturnValue(
      "# Doc\n\n## Geleerde regels (uit reviews)\n\n- Gebruik altijd merknaam in kop 1.\n",
    );
    listAcceptedProposalsMock.mockResolvedValue([proposal({ id: 1 })]);

    const res = await reapplyAcceptedFileProposals();

    // Counted as applied (ensured present), but no write happened.
    expect(res).toEqual({ applied: 1, skipped: 0 });
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });

  it("tolerates a deleted target doc: counts it skipped, never throws", async () => {
    const { reapplyAcceptedFileProposals } = await freshModule();
    existsSyncMock.mockReturnValue(false); // doc removed from the repo
    listAcceptedProposalsMock.mockResolvedValue([
      proposal({ id: 1, targetPath: "knowledge/gone.md" }),
      proposal({ id: 2, targetPath: "knowledge/standards.md" }),
    ]);
    // Only the second has a real file; the first throws inside applyToFile.
    existsSyncMock.mockImplementation((p: string) =>
      String(p).endsWith("standards.md"),
    );

    const res = await reapplyAcceptedFileProposals();

    expect(res).toEqual({ applied: 1, skipped: 1 });
    expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it("degrades to a no-op when the proposals table is unreadable", async () => {
    const { reapplyAcceptedFileProposals } = await freshModule();
    listAcceptedProposalsMock.mockRejectedValue(new Error("DB down"));

    const res = await reapplyAcceptedFileProposals();

    expect(res).toEqual({ applied: 0, skipped: 0 });
    expect(writeFileSyncMock).not.toHaveBeenCalled();
  });
});
