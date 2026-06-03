import { objectStorageClient } from "./objectStorage";

/**
 * Object-storage layout (all under the public search path):
 *   portraits/<slug>.png            -> the chosen portrait for an employee
 *   portrait-styles/<slug>-<style>.png -> generated style-direction examples
 *
 * Portraits are keyed by agent slug (the agent filename without ".md"), so the
 * coupling between an employee and their portrait is fully deterministic and a
 * follow-up only has to drop a "<slug>.png" file to make a portrait appear.
 */
const PORTRAIT_PREFIX = "portraits/";
const STYLE_PREFIX = "portrait-styles/";

/**
 * Thumbnail widths (px) for the resized variants served via `?w=`. One small
 * size covers every roster avatar and the tiny round Kaart nodes (even at 2x
 * DPR); a medium size covers the larger style-comparison gallery tiles.
 */
export const PORTRAIT_THUMB_WIDTH = 256;
const STYLE_EXAMPLE_WIDTH = 512;

/** The three art directions explored for the portrait foundation. */
export const PORTRAIT_STYLES = [
  { key: "editorial", label: "Redactioneel portret" },
  { key: "photographic", label: "Fotorealistische headshot" },
  { key: "avatar", label: "Gestileerde avatar" },
] as const;

export type PortraitStyleKey = (typeof PORTRAIT_STYLES)[number]["key"];

export interface StyleExample {
  style: string;
  label: string;
  url: string;
}

export interface PortraitIndex {
  /** Slugs that have a chosen portrait at portraits/<slug>.png. */
  portraits: Set<string>;
  /** Generated style examples grouped by slug. */
  styleExamples: Map<string, StyleExample[]>;
}

/** Object name (relative to the public search path) for a chosen portrait. */
export function portraitObjectName(slug: string): string {
  return `${PORTRAIT_PREFIX}${slug}.png`;
}

/** Object name (relative to the public search path) for a style example. */
export function styleExampleObjectName(slug: string, style: string): string {
  return `${STYLE_PREFIX}${slug}-${style}.png`;
}

/**
 * Build the public, browser-reachable URL that serves a stored object. Pass a
 * `width` to request a resized WebP thumbnail (the serving route resizes on the
 * fly and caches the result), so small displays don't download the full image.
 */
export function publicObjectUrl(
  objectName: string,
  opts?: { width?: number },
): string {
  const base = `/api/storage/public-objects/${objectName}`;
  if (opts?.width && Number.isFinite(opts.width)) {
    return `${base}?w=${Math.round(opts.width)}`;
  }
  return base;
}

function labelForStyle(style: string): string {
  return PORTRAIT_STYLES.find((s) => s.key === style)?.label ?? style;
}

/** Parse the first public search path into its bucket and base directory. */
function firstPublicSearchPath(): { bucket: string; baseDir: string } | null {
  const raw = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
  const first = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)[0];
  if (!first) return null;
  const normalized = first.startsWith("/") ? first : `/${first}`;
  const parts = normalized.split("/").filter((p) => p.length > 0);
  if (parts.length < 1) return null;
  const bucket = parts[0];
  const baseDir = parts.slice(1).join("/");
  return { bucket, baseDir };
}

/**
 * List the stored portraits and style examples once. Best-effort: any storage
 * error (or missing configuration) yields an empty index so the team roster
 * still renders with placeholders and "press seal" fallbacks.
 */
export async function loadPortraitIndex(): Promise<PortraitIndex> {
  const portraits = new Set<string>();
  const styleExamples = new Map<string, StyleExample[]>();

  try {
    const loc = firstPublicSearchPath();
    if (!loc) return { portraits, styleExamples };

    const prefix = loc.baseDir ? `${loc.baseDir}/` : "";
    const [files] = await objectStorageClient
      .bucket(loc.bucket)
      .getFiles({ prefix });

    const styleKeys = PORTRAIT_STYLES.map((s) => s.key);

    for (const file of files) {
      // Strip the base directory so names are relative to the search path.
      const rel = loc.baseDir
        ? file.name.slice(loc.baseDir.length + 1)
        : file.name;

      if (rel.startsWith(PORTRAIT_PREFIX) && rel.endsWith(".png")) {
        const slug = rel.slice(PORTRAIT_PREFIX.length, -".png".length);
        if (slug) portraits.add(slug);
        continue;
      }

      if (rel.startsWith(STYLE_PREFIX) && rel.endsWith(".png")) {
        const base = rel.slice(STYLE_PREFIX.length, -".png".length);
        // Filenames are "<slug>-<style>"; slugs may contain hyphens, so match
        // against the known style suffixes rather than splitting naively.
        const style = styleKeys.find((k) => base.endsWith(`-${k}`));
        if (!style) continue;
        const slug = base.slice(0, base.length - style.length - 1);
        if (!slug) continue;
        const list = styleExamples.get(slug) ?? [];
        list.push({
          style,
          label: labelForStyle(style),
          // Gallery thumbnails display a few hundred px wide; serve a medium
          // resized variant instead of the full ~1.3MB source.
          url: publicObjectUrl(rel, { width: STYLE_EXAMPLE_WIDTH }),
        });
        styleExamples.set(slug, list);
      }
    }

    // Keep style examples in a stable, meaningful order.
    for (const list of styleExamples.values()) {
      list.sort(
        (a, b) =>
          styleKeys.indexOf(a.style as PortraitStyleKey) -
          styleKeys.indexOf(b.style as PortraitStyleKey),
      );
    }
  } catch {
    // Storage unreachable or not configured — fall back to an empty index.
    return { portraits: new Set(), styleExamples: new Map() };
  }

  return { portraits, styleExamples };
}
