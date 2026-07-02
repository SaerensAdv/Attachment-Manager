import { Router, type IRouter } from "express";
import { saerensLogoPngBuffer } from "../lib/brand-logo";

/**
 * Public brand assets served without authentication, so external consumers
 * (notably Gmail's image proxy, which fetches an email's `<img>` sources with no
 * session) can load them. The SA logo used to ride along as a `cid:` inline part
 * in outbound email, but Gmail's send-time rewrite drops inline images in the
 * DELIVERED mail; referencing this endpoint by absolute URL is the robust fix.
 *
 * The path is added to the auth allow-list (`requireAuth`) so it stays reachable
 * without a session even though it is mounted under `/api`.
 */
const router: IRouter = Router();

router.get("/brand/logo.png", (_req, res) => {
  const png = saerensLogoPngBuffer();
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Length", png.length);
  // Immutable brand asset: let recipients + Gmail's proxy cache it aggressively.
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.send(png);
});

export default router;
