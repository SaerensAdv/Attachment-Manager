import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { File } from "@google-cloud/storage";
import sharp from "sharp";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// On-the-fly resized variants are cached on local disk so each (object, width)
// pair is only decoded/encoded once per deploy. Thumbnails are tiny (a few KB)
// so this stays well within the container's scratch space.
const THUMB_CACHE_DIR = join(tmpdir(), "portrait-thumb-cache");
// Clamp requested widths so the cache can't be blown up by arbitrary values and
// nobody can request an upscale larger than our source portraits.
const MIN_THUMB_WIDTH = 16;
const MAX_THUMB_WIDTH = 1024;
const THUMB_WEBP_QUALITY = 82;

/** Parse and clamp the `?w=` width param, or null when absent/invalid. */
function parseWidth(raw: unknown): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(MAX_THUMB_WIDTH, Math.max(MIN_THUMB_WIDTH, n));
}

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets (employee portraits and style-example portraits) from
 * PUBLIC_OBJECT_SEARCH_PATHS. These are unconditionally public — no auth or ACL
 * checks. This is the serving endpoint that turns a stored portrait into a URL.
 *
 * With a `?w=<px>` query param the image is resized to that width (aspect ratio
 * preserved, never upscaled) and re-encoded as WebP. The full-size object stays
 * the source of truth; the roster and graph faces request a small thumbnail so
 * they appear instantly instead of streaming the ~1.3MB original.
 */
router.get(
  "/storage/public-objects/*filePath",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join("/") : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const width = parseWidth(req.query.w);
      if (width !== null) {
        const served = await serveResized(file, filePath, width, res);
        if (served) return;
        // Fall through to the original stream if the object isn't a resizable
        // image (e.g. unexpected content type) — never fail a portrait request.
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, "Error serving public object");
      res.status(500).json({ error: "Failed to serve public object" });
    }
  },
);

/**
 * Serve a width-resized WebP variant of an image object, using a disk cache
 * keyed by the object's storage generation so a replaced portrait busts its
 * thumbnail automatically. Returns false when the object isn't a resizable
 * image so the caller can fall back to streaming the original.
 */
async function serveResized(
  file: File,
  filePath: string,
  width: number,
  res: Response,
): Promise<boolean> {
  const [metadata] = await file.getMetadata();
  const contentType = (metadata.contentType as string) || "";
  if (!contentType.startsWith("image/")) return false;

  // Generation/etag changes whenever the object is replaced, so it makes the
  // cached thumbnail self-invalidating without any manual cache busting.
  const version = String(
    metadata.generation ?? metadata.etag ?? metadata.updated ?? "",
  );
  const key = createHash("sha1")
    .update(`${filePath}\u0000${width}\u0000${version}`)
    .digest("hex");
  const cachePath = join(THUMB_CACHE_DIR, `${key}.webp`);

  let body = await readCachedThumb(cachePath);
  if (!body) {
    const [original] = await file.download();
    body = await sharp(original)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: THUMB_WEBP_QUALITY })
      .toBuffer();
    await writeCachedThumb(cachePath, body);
  }

  res.status(200);
  res.setHeader("Content-Type", "image/webp");
  res.setHeader("Content-Length", String(body.length));
  // Variants are immutable for a given object generation, so they can be cached
  // hard by the browser; a replaced portrait yields a new URL via its version.
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.end(body);
  return true;
}

async function readCachedThumb(cachePath: string): Promise<Buffer | null> {
  try {
    return await readFile(cachePath);
  } catch {
    return null;
  }
}

async function writeCachedThumb(cachePath: string, body: Buffer): Promise<void> {
  try {
    await mkdir(THUMB_CACHE_DIR, { recursive: true });
    await writeFile(cachePath, body);
  } catch {
    // A read-only or full scratch disk just means we re-encode next time; the
    // request still succeeds, so swallow cache-write failures.
  }
}

export default router;
