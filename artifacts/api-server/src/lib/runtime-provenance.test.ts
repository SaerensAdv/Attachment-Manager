import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRuntimeProvenance, resetRuntimeProvenanceForTests } from "./runtime-provenance";

let dir = "";
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); resetRuntimeProvenanceForTests(); });
describe("runtime provenance", () => {
  it("reads the packaged build manifest", () => {
    dir = mkdtempSync(join(tmpdir(), "atlas-runtime-")); mkdirSync(join(dir, "agents")); writeFileSync(join(dir, "AGENTS.md"), "# A"); writeFileSync(join(dir, "runtime-manifest.json"), JSON.stringify({ version: 1, gitSha: "abc", builtAt: "2026-07-18T00:00:00Z", docsHash: "hash", counts: { agents: 26 } }));
    const result = getRuntimeProvenance(dir);
    expect(result).toMatchObject({ gitSha: "abc", docsMode: "packaged", manifestPresent: true, counts: { agents: 26 } });
  });
  it("identifies a missing docs tree", () => { dir = mkdtempSync(join(tmpdir(), "atlas-runtime-")); expect(getRuntimeProvenance(dir).docsMode).toBe("missing"); });
});
