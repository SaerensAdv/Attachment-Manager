import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface RuntimeManifest {
  version: number;
  gitSha: string | null;
  builtAt: string | null;
  docsHash: string | null;
  counts: Record<string, number>;
}
export interface RuntimeProvenance extends RuntimeManifest {
  processStartedAt: string;
  docsMode: "packaged" | "repository" | "missing";
  manifestPresent: boolean;
}

const processStartedAt = new Date().toISOString();
let cached: RuntimeProvenance | null = null;

export function getRuntimeProvenance(cwd = process.cwd()): RuntimeProvenance {
  if (cached && cwd === process.cwd()) return cached;
  const manifestPath = join(cwd, "runtime-manifest.json");
  const docsPresent = existsSync(join(cwd, "AGENTS.md")) && existsSync(join(cwd, "agents"));
  let manifest: RuntimeManifest = { version: 1, gitSha: process.env.GITHUB_SHA ?? process.env.REPLIT_GIT_COMMIT ?? null, builtAt: null, docsHash: null, counts: {} };
  let manifestPresent = false;
  if (existsSync(manifestPath)) {
    try { manifest = { ...manifest, ...JSON.parse(readFileSync(manifestPath, "utf8")) }; manifestPresent = true; }
    catch { manifestPresent = false; }
  }
  const result: RuntimeProvenance = { ...manifest, processStartedAt, docsMode: docsPresent ? (manifestPresent ? "packaged" : "repository") : "missing", manifestPresent };
  if (cwd === process.cwd()) cached = result;
  return result;
}

export function resetRuntimeProvenanceForTests(): void { cached = null; }
