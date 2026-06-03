/**
 * Verify the full team portrait set is present in object storage.
 *
 * Derives the expected slug set from `agents/*.md`, lists the public
 * object-storage search path, and asserts that a `portraits/<slug>.png` object
 * exists for every employee — the exact key the runtime resolves (see
 * `src/lib/portraits.ts`). Fails loudly (exit 1) on any gap, so this can guard
 * the linkage after running `promote-portraits.mjs`.
 *
 *   node scripts/verify-portraits.mjs
 */
import { Storage } from "@google-cloud/storage";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function firstPublicSearchPath() {
  const raw = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
  const first = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)[0];
  if (!first) throw new Error("PUBLIC_OBJECT_SEARCH_PATHS is not configured");
  const parts = first.replace(/^\//, "").split("/").filter(Boolean);
  return { bucket: parts[0], baseDir: parts.slice(1).join("/") };
}

function resolveRepoRoot() {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (true) {
    if (existsSync(join(dir, "agents")) && existsSync(join(dir, "AGENTS.md"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error("Could not locate the repo root");
    dir = parent;
  }
}

async function main() {
  const root = resolveRepoRoot();
  const slugs = readdirSync(join(root, "agents"))
    .filter((n) => n.endsWith(".md"))
    .map((n) => n.replace(/\.md$/, ""))
    .sort();

  const { bucket, baseDir } = firstPublicSearchPath();
  const prefix = `${baseDir ? `${baseDir}/` : ""}portraits/`;
  const [files] = await storage.bucket(bucket).getFiles({ prefix });
  const present = new Set(
    files
      .map((f) => f.name.slice(prefix.length))
      .filter((n) => n.endsWith(".png"))
      .map((n) => n.slice(0, -".png".length)),
  );

  const missing = slugs.filter((slug) => !present.has(slug));
  console.log(
    `Expected ${slugs.length} portraits, found ${slugs.length - missing.length}.`,
  );

  if (missing.length) {
    console.error(`Missing portraits for: ${missing.join(", ")}`);
    process.exit(1);
  }

  console.log("OK: every employee has a portrait in object storage.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
