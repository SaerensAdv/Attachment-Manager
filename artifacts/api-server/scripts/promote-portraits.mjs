/**
 * Promote the full team portrait set into object storage.
 *
 * Source images live in the repo at:
 *   attached_assets/generated_images/<slug>-portrait.png
 * and are promoted to the public object-storage search path at:
 *   portraits/<slug>.png
 * which is exactly where the runtime resolves portraits (see
 * `src/lib/portraits.ts` / `src/lib/team.ts`). Dropping a `portraits/<slug>.png`
 * file is all it takes for a portrait to appear on the Team page and as a node
 * face on the Operations Atlas — no server restart needed.
 *
 * This script is the auditable, reproducible linkage step: it derives the slug
 * set from `agents/*.md`, asserts a source image exists for every employee,
 * uploads each, and fails loudly if any portrait is missing. Run it any time
 * the portrait set or object-storage bucket needs to be (re)built:
 *
 *   node scripts/promote-portraits.mjs
 */
import { Storage } from "@google-cloud/storage";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

/** Parse the first public search path into its bucket and base directory. */
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

/** Walk up from this file to the workspace root (where `agents/` lives). */
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

  const assetsDir = join(root, "attached_assets/generated_images");
  const missing = slugs.filter(
    (slug) => !existsSync(join(assetsDir, `${slug}-portrait.png`)),
  );
  if (missing.length) {
    throw new Error(
      `Missing source portrait(s) for: ${missing.join(", ")} — ` +
        `expected attached_assets/generated_images/<slug>-portrait.png`,
    );
  }

  const { bucket, baseDir } = firstPublicSearchPath();
  const b = storage.bucket(bucket);

  for (const slug of slugs) {
    const src = join(assetsDir, `${slug}-portrait.png`);
    const dest = `${baseDir ? `${baseDir}/` : ""}portraits/${slug}.png`;
    await b.file(dest).save(readFileSync(src), {
      contentType: "image/png",
      resumable: false,
    });
    console.log(`promoted ${slug} -> ${dest}`);
  }

  console.log(`\nDone: promoted ${slugs.length} portraits.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
