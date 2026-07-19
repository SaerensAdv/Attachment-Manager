import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareBuilds, getRuntimeProvenance, resetRuntimeProvenanceForTests } from "./runtime-provenance";

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); resetRuntimeProvenanceForTests(); });
const temp = () => { const root = mkdtempSync(join(tmpdir(), "atlas-provenance-")); dirs.push(root); return root; };

describe("runtime provenance", () => {
  it("hashes the exact packaged manifest and identifies packaged docs", () => {
    const root = temp(); writeFileSync(join(root, "AGENTS.md"), "# Agents"); mkdirSync(join(root, "agents"));
    writeFileSync(join(root, "runtime-manifest.json"), JSON.stringify({ version: 2, gitSha: "abc", builtAt: "2026-07-19T00:00:00.000Z", docsHash: "docs", counts: { agents: 2 } }));
    const result = getRuntimeProvenance(root);
    expect(result.docsMode).toBe("packaged"); expect(result.manifestPresent).toBe(true); expect(result.manifestHash).toMatch(/^[a-f0-9]{64}$/); expect(result.gitSha).toBe("abc");
  });
  it("identifies a missing docs tree", () => { expect(getRuntimeProvenance(temp()).docsMode).toBe("missing"); });
  it("reports match, mismatch and unknown without guessing", () => { expect(compareBuilds("abc", "abc").status).toBe("match"); expect(compareBuilds("abc", "def").status).toBe("mismatch"); expect(compareBuilds(null, "def").status).toBe("unknown"); });
});
