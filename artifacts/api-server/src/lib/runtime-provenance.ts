import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface RuntimeManifest {
  version: number;
  gitSha: string | null;
  builtAt: string | null;
  docsHash: string | null;
  counts: Record<string, number>;
  rootFiles?: string[];
}
export interface RuntimeProvenance extends RuntimeManifest {
  processStartedAt: string;
  docsMode: "packaged" | "repository" | "missing";
  deploymentMode: "replit" | "github-actions" | "local" | "unknown";
  manifestPresent: boolean;
  manifestHash: string | null;
}

const processStartedAt = new Date().toISOString();
let cached: RuntimeProvenance | null = null;
const deploymentMode = (): RuntimeProvenance["deploymentMode"] => process.env.REPL_ID ? "replit" : process.env.GITHUB_ACTIONS === "true" ? "github-actions" : process.env.NODE_ENV === "development" ? "local" : "unknown";

export function getRuntimeProvenance(cwd = process.cwd()): RuntimeProvenance {
  if (cached && cwd === process.cwd()) return cached;
  const manifestPath = join(cwd, "runtime-manifest.json");
  const docsPresent = existsSync(join(cwd, "AGENTS.md")) && existsSync(join(cwd, "agents"));
  let manifest: RuntimeManifest = { version: 1, gitSha: process.env.GITHUB_SHA ?? process.env.REPLIT_GIT_COMMIT ?? null, builtAt: null, docsHash: null, counts: {} };
  let manifestPresent = false;
  let manifestHash: string | null = null;
  if (existsSync(manifestPath)) {
    try {
      const raw = readFileSync(manifestPath, "utf8");
      manifest = { ...manifest, ...JSON.parse(raw) };
      manifestHash = createHash("sha256").update(raw).digest("hex");
      manifestPresent = true;
    } catch { manifestPresent = false; manifestHash = null; }
  }
  const result: RuntimeProvenance = { ...manifest, processStartedAt, docsMode: docsPresent ? (manifestPresent ? "packaged" : "repository") : "missing", deploymentMode: deploymentMode(), manifestPresent, manifestHash };
  if (cwd === process.cwd()) cached = result;
  return result;
}

export function compareBuilds(frontendSha: string | null | undefined, apiSha: string | null | undefined) {
  const frontend = frontendSha?.trim() || null;
  const api = apiSha?.trim() || null;
  return {
    frontendSha: frontend,
    apiSha: api,
    status: !frontend || !api ? "unknown" as const : frontend === api ? "match" as const : "mismatch" as const,
  };
}

export function resetRuntimeProvenanceForTests(): void { cached = null; }
