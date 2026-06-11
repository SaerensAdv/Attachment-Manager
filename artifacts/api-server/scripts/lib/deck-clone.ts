/**
 * Deterministic deck clone + token-substitution engine (T7 data-injection
 * pattern, reused by T6/T8).
 *
 * The SOURCE template is any deck directory — either a registered template
 * artifact (saerens-audit-deck-template) or a plain `deck-templates/<kind>/`
 * source tree (used once the project hits the 7-artifact cap and no new deck
 * artifact can be registered). The TARGET must be an already-registered slides
 * artifact (assertSafeTarget enforces this); generated decks reuse a shared
 * output artifact (the audit demo slot), overwritten per run. This engine
 * OVERLAYS the template onto the target and replaces every `[[token]]` marker
 * with a literal string, so the rendered JSX stays fully static — visual
 * editing and PPTX/PDF export keep working, and the deck never fetches at
 * runtime.
 *
 * Safety invariants (any violation throws BEFORE the target is mutated):
 *   - the target's basename is not the template or one of the LIVE client decks
 *     (denylist), AND
 *   - the target really is a scaffolded slides artifact — its
 *     `.replit-artifact/artifact.toml` has `kind = "slides"` and a previewPath
 *     that references the target slug.
 * After substitution it also asserts EVERY token-map key was consumed and NO
 * `[[token]]` marker remains, so template/token drift fails loudly instead of
 * shipping a half-filled deck.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import path from "path";

/**
 * Decks that must NEVER be overwritten: the registered template + the two LIVE
 * client decks, plus the plain-source template basenames (defence-in-depth so a
 * stray `--slug saerens-qbr` can never clobber a template). The shared demo
 * OUTPUT slot is intentionally NOT here — generators overwrite it every run.
 */
const TARGET_DENYLIST = new Set([
  "saerens-audit-deck-template",
  "saerens-qbr",
  "audit-car-audio-limburg",
  "audit-car-audio-studio",
]);

/** Never copied from the template — these are owned by the scaffold/build. */
const COPY_EXCLUDES = new Set([
  ".replit-artifact",
  "node_modules",
  "dist",
  ".tsbuildinfo",
  "package.json",
]);

/** Directories never walked when substituting / scanning the target. */
const WALK_SKIP_DIRS = new Set([".replit-artifact", "node_modules", "dist", ".git"]);

/** Extensions treated as text for substitution + residual-marker scanning. */
const TEXT_EXTS = new Set([
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".mjs",
  ".cjs",
  ".css",
  ".html",
  ".json",
  ".svg",
  ".md",
  ".txt",
]);

/** A `[[token]]` marker: letters, digits, underscore and dots inside `[[ ]]`. */
const TOKEN_MARKER = /\[\[[A-Za-z0-9_.]+\]\]/g;

export interface CloneDeckOptions {
  /** Absolute path to the deck template to copy from. */
  sourceDir: string;
  /** Absolute path to the freshly-scaffolded target artifact. */
  targetDir: string;
  /** `[[token]]` (without brackets) -> literal replacement. */
  tokenMap: Record<string, string>;
  /** Optional provenance file written under `src/data/` (e.g. audit-data.json). */
  provenance?: { file: string; content: string };
  /** Workspace dependency the template's CSS imports. */
  brandDep?: string;
}

export interface CloneDeckResult {
  filesCopied: number;
  filesSubstituted: number;
  keysConsumed: string[];
  slidesWiped: number;
}

function assertSafeTarget(targetDir: string): void {
  const base = path.basename(targetDir);
  if (TARGET_DENYLIST.has(base)) {
    throw new Error(
      `Refusing to overlay onto protected deck "${base}" (template or LIVE client deck).`,
    );
  }
  if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
    throw new Error(
      `Target "${targetDir}" does not exist. Register it first with the artifacts skill (createArtifact), then re-run.`,
    );
  }
  const tomlPath = path.join(targetDir, ".replit-artifact", "artifact.toml");
  if (!existsSync(tomlPath)) {
    throw new Error(
      `Target "${base}" has no .replit-artifact/artifact.toml — it is not a registered artifact.`,
    );
  }
  const toml = readFileSync(tomlPath, "utf8");
  if (!/^\s*kind\s*=\s*"slides"\s*$/m.test(toml)) {
    throw new Error(`Target "${base}" is not a slides artifact (kind != "slides").`);
  }
  const preview = toml.match(/previewPath\s*=\s*"([^"]+)"/)?.[1] ?? "";
  if (!preview.includes(base)) {
    throw new Error(
      `Target "${base}" previewPath "${preview}" does not reference the slug — refusing as a safety check.`,
    );
  }
}

function copyTree(src: string, dest: string): number {
  let count = 0;
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (COPY_EXCLUDES.has(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(to, { recursive: true });
      count += copyTree(from, to);
    } else if (entry.isFile()) {
      mkdirSync(path.dirname(to), { recursive: true });
      cpSync(from, to);
      count += 1;
    }
  }
  return count;
}

function walkTextFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (WALK_SKIP_DIRS.has(entry.name)) continue;
      walkTextFiles(path.join(dir, entry.name), out);
    } else if (entry.isFile() && TEXT_EXTS.has(path.extname(entry.name))) {
      out.push(path.join(dir, entry.name));
    }
  }
}

export function cloneDeck(opts: CloneDeckOptions): CloneDeckResult {
  const { sourceDir, targetDir, tokenMap } = opts;
  const brandDep = opts.brandDep ?? "@workspace/brand";

  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    throw new Error(`Source template "${sourceDir}" not found.`);
  }
  assertSafeTarget(targetDir);

  // 1. Wipe the scaffold's sample slides + manifest so no orphan slide files
  //    survive (validate-slides errors on slides not referenced in the manifest).
  let slidesWiped = 0;
  const slidesDir = path.join(targetDir, "src", "pages", "slides");
  if (existsSync(slidesDir)) {
    for (const f of readdirSync(slidesDir)) {
      rmSync(path.join(slidesDir, f), { recursive: true, force: true });
      slidesWiped += 1;
    }
  }
  // Clear src/data entirely so stale provenance from a prior generation (e.g. a
  // different deck kind's *-data.json overlaid into the shared output slot)
  // never survives. The template overlay restores the schema, manifest and
  // .gitignore; the fresh provenance file is (re)written in step 6.
  const dataDir = path.join(targetDir, "src", "data");
  if (existsSync(dataDir)) {
    for (const f of readdirSync(dataDir)) {
      rmSync(path.join(dataDir, f), { recursive: true, force: true });
    }
  }

  // 2. Full-content overlay from the template (excludes owned by the scaffold).
  const filesCopied = copyTree(sourceDir, targetDir);

  // 3. Substitute every [[token]] across the target's text files.
  const provenanceAbs = opts.provenance
    ? path.join(targetDir, "src", "data", opts.provenance.file)
    : null;
  const textFiles: string[] = [];
  walkTextFiles(targetDir, textFiles);
  const consumed = new Set<string>();
  let filesSubstituted = 0;
  for (const file of textFiles) {
    if (path.basename(file) === "package.json") continue; // deps-merge handled separately
    if (provenanceAbs && file === provenanceAbs) continue;
    let content = readFileSync(file, "utf8");
    let changed = false;
    for (const [key, value] of Object.entries(tokenMap)) {
      const marker = `[[${key}]]`;
      if (content.includes(marker)) {
        content = content.split(marker).join(value);
        consumed.add(key);
        changed = true;
      }
    }
    if (changed) {
      writeFileSync(file, content);
      filesSubstituted += 1;
    }
  }

  // 4. Drift guards: every key consumed AND no residual markers remain.
  const missing = Object.keys(tokenMap).filter((k) => !consumed.has(k));
  if (missing.length > 0) {
    throw new Error(
      `Token map drift: ${missing.length} key(s) never appeared in the template: ${missing.join(", ")}`,
    );
  }
  const residual: string[] = [];
  for (const file of textFiles) {
    if (provenanceAbs && file === provenanceAbs) continue;
    const found = readFileSync(file, "utf8").match(TOKEN_MARKER);
    if (found) {
      residual.push(`${path.relative(targetDir, file)}: ${[...new Set(found)].join(", ")}`);
    }
  }
  if (residual.length > 0) {
    throw new Error(`Unsubstituted [[token]] markers remain:\n  ${residual.join("\n  ")}`);
  }

  // 5. Merge the brand dependency into the scaffold's package.json (keep name/scripts).
  const pkgPath = path.join(targetDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.dependencies = pkg.dependencies ?? {};
  if (pkg.dependencies[brandDep] !== "workspace:*") {
    pkg.dependencies[brandDep] = "workspace:*";
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  // 6. Write the provenance file (committed alongside the manifest).
  if (opts.provenance && provenanceAbs) {
    mkdirSync(path.dirname(provenanceAbs), { recursive: true });
    writeFileSync(provenanceAbs, opts.provenance.content);
  }

  return {
    filesCopied,
    filesSubstituted,
    keysConsumed: [...consumed].sort(),
    slidesWiped,
  };
}
