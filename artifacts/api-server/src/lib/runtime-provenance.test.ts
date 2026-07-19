import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compareBuilds, getRuntimeProvenance, resetRuntimeProvenanceForTests } from "./runtime-provenance";

describe("runtime provenance", () => {
  it("hashes the exact packaged manifest and identifies packaged docs", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-provenance-"));
    writeFileSync(join(root, "AGENTS.md"), "# Agents"); mkdirSync(join(root, "agents"));
    writeFileSync(join(root, "runtime-manifest.json"), JSON.stringify({ version: 2, gitSha: "abc", builtAt: "2026-07-19T00:00:00.000Z", docsHash: "docs", counts: { agents: 2 } }));
    resetRuntimeProvenanceForTests(); const result = getRuntimeProvenance(root);
    expect(result.docsMode).toBe("packaged"); expect(result.manifestPresent).toBe(true); expect(result.manifestHash).toMatch(/^[a-f0-9]{64}$/); expect(result.gitSha).toBe("abc");
  });

  it("reports match, mismatch and unknown without guessing", () => {
    expect(compareBuilds("abc", "abc").status).toBe("match");
    expect(compareBuilds("abc", "def").status).toBe("mismatch");
    expect(compareBuilds(null, "def").status).toBe("unknown");
  });
});
