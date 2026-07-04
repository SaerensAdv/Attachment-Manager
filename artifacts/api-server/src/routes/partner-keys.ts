import { Router, type IRouter } from "express";
import {
  issuePartnerKey,
  revokePartnerKey,
  listPartnerKeys,
} from "../lib/partner-keys-store";

/**
 * Owner-facing management of partner API keys. This router is mounted UNDER the
 * session `requireAuth` gate (via routes/index.ts), so only the logged-in
 * operator can issue, list, or revoke keys — the keys themselves authenticate
 * the separate, publicly-mounted partner API (see routes/partner.ts).
 *
 * Deliberately minimal (no full UI): issue returns the plaintext key exactly
 * once, list returns metadata only (never the secret or its hash), and revoke is
 * idempotent.
 */

const router: IRouter = Router();

/** GET /partner-keys — list all keys (metadata only). */
router.get("/partner-keys", async (_req, res): Promise<void> => {
  const keys = await listPartnerKeys();
  res.json({
    keys: keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      active: k.active,
      createdAt: k.createdAt.toISOString(),
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
      revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
    })),
  });
});

/**
 * POST /partner-keys — issue a new key. Body: { name, scopes? }. The plaintext
 * `key` is returned exactly once and can never be recovered afterwards.
 */
router.post("/partner-keys", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "Een naam voor de partner-sleutel is verplicht." });
    return;
  }
  try {
    const issued = await issuePartnerKey(name, body.scopes);
    res.status(201).json({
      id: issued.id,
      name: issued.name,
      prefix: issued.prefix,
      scopes: issued.scopes,
      // Shown once, never stored in plaintext — the operator must copy it now.
      key: issued.key,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Uitgeven van sleutel mislukt.",
    });
  }
});

/** DELETE /partner-keys/:id — revoke a key (idempotent). */
router.delete("/partner-keys/:id", async (req, res): Promise<void> => {
  const id = Number(String(req.params.id));
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Ongeldige sleutel-id." });
    return;
  }
  const revoked = await revokePartnerKey(id);
  if (!revoked) {
    res.status(404).json({ error: "Sleutel niet gevonden of al ingetrokken." });
    return;
  }
  res.json({ ok: true, id });
});

export default router;
