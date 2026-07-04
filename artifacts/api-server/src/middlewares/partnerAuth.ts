import { type Request, type Response, type NextFunction } from "express";
import {
  verifyPartnerKey,
  type PartnerScope,
  type VerifiedPartner,
} from "../lib/partner-keys-store";

/**
 * Authentication gate for the versioned partner API (`/api/v1/partner/...`).
 *
 * Partners are spun-off Replit projects, not browser users: they carry no
 * session. Instead each request presents a long-lived partner key, either as
 * `Authorization: Bearer <key>` or the `x-api-key` header. The key is verified
 * against the `partner_keys` store; a valid key attaches the partner identity to
 * `req.partner`. This runs BEFORE the session-based `requireAuth` gate ever
 * sees the request (the partner router is mounted ahead of it), so the two auth
 * mechanisms never collide.
 *
 * Use the factory to require a specific scope per route:
 *   router.get("/clients/:id", partnerAuth("read"), handler)
 */

/** Extract the presented key from the Authorization/x-api-key headers. */
function extractKey(req: Request): string | null {
  const auth = req.header("authorization");
  if (auth) {
    const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (match) return match[1].trim();
  }
  const apiKey = req.header("x-api-key");
  if (apiKey && apiKey.trim()) return apiKey.trim();
  return null;
}

/** Request augmented with the verified partner identity. */
export interface PartnerRequest extends Request {
  partner?: VerifiedPartner;
}

export function partnerAuth(requiredScope: PartnerScope) {
  return async function partnerAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    // Let CORS preflight through untouched.
    if (req.method === "OPTIONS") {
      next();
      return;
    }

    const key = extractKey(req);
    if (!key) {
      res.status(401).json({
        error:
          "Partner-authenticatie vereist: stuur de sleutel als 'Authorization: Bearer <sleutel>' of 'x-api-key'.",
      });
      return;
    }

    const partner = await verifyPartnerKey(key);
    if (!partner) {
      res.status(401).json({ error: "Ongeldige of ingetrokken partner-sleutel." });
      return;
    }

    if (!partner.scopes.includes(requiredScope)) {
      res.status(403).json({
        error: `Deze partner-sleutel heeft geen '${requiredScope}'-recht.`,
      });
      return;
    }

    (req as PartnerRequest).partner = partner;
    next();
  };
}
