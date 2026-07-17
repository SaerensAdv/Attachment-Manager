import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  clientsTable,
  generationsTable,
  type Client,
} from "@workspace/db";
import { dbClientPath } from "../lib/clients-store";
import {
  resolveGenerationContext,
  runGeneration,
} from "../lib/generate-engine";
import { partnerAuth } from "../middlewares/partnerAuth";

/**
 * Versioned integration API (`/api/v1/partner/...`), formerly the "partner API".
 *
 * Mounted ahead of the session `requireAuth` gate and self-authenticated with a
 * long-lived integration key (see `partnerAuth`). It gives an external consumer
 * (e.g. a ClickUp push, or another Replit project) a small, stable contract
 * against the brain:
 *   - read a client's current state + latest deliverables,
 *   - write an event/result back as the client's new current state,
 *   - trigger a generation (reusing the autonomous generate engine), and
 *   - poll that generation's status/result.
 *
 * The `/partner` path prefix and key naming are kept for backward compatibility.
 * Responses are deliberately curated: billing, VAT and integration secrets on
 * the client row are never exposed to the consumer.
 */

const router: IRouter = Router();

/** Max length of the persisted currentState, mirroring the CRM's cap. */
const MAX_CURRENT_STATE_LEN = 50_000;
/** How many recent deliverables to include in a client read. */
const RECENT_DELIVERABLES = 5;

function parsePartnerId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Curated, partner-safe view of a client (no billing / secrets). */
function serializePartnerClient(client: Client) {
  return {
    id: client.id,
    name: client.name,
    currentState: client.currentState ?? null,
    profile: {
      business: client.business ?? null,
      world: client.world ?? null,
      services: client.services ?? null,
      audience: client.audience ?? null,
      locations: client.locations ?? null,
      languages: client.languages ?? null,
      mainGoal: client.mainGoal ?? null,
      conversionAction: client.conversionAction ?? null,
      kpis: client.kpis ?? null,
      toneOfVoice: client.toneOfVoice ?? null,
      website: client.website ?? null,
    },
    updatedAt: client.updatedAt.toISOString(),
  };
}

/**
 * GET /clients/:id — the client's current state + recent deliverables. Scope:
 * read.
 */
router.get(
  "/clients/:id",
  partnerAuth("read"),
  async (req, res): Promise<void> => {
    const id = parsePartnerId(String(req.params.id));
    if (id === null) {
      res.status(400).json({ error: "Ongeldige klant-id." });
      return;
    }

    const [client] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, id))
      .limit(1);
    if (!client) {
      res.status(404).json({ error: "Klant niet gevonden." });
      return;
    }

    const deliverables = await db
      .select({
        id: generationsTable.id,
        workflowTitle: generationsTable.workflowTitle,
        status: generationsTable.status,
        finalMarkdown: generationsTable.finalMarkdown,
        createdAt: generationsTable.createdAt,
      })
      .from(generationsTable)
      .where(eq(generationsTable.clientPath, dbClientPath(id)))
      .orderBy(desc(generationsTable.createdAt))
      .limit(RECENT_DELIVERABLES);

    res.json({
      client: serializePartnerClient(client),
      deliverables: deliverables.map((d) => ({
        id: d.id,
        workflowTitle: d.workflowTitle,
        status: d.status,
        finalMarkdown: d.finalMarkdown,
        createdAt: d.createdAt.toISOString(),
      })),
    });
  },
);

/**
 * POST /clients/:id/events — record an event/result from the partner as the
 * client's new current state (newest first, older history retained, capped).
 * Scope: write.
 */
router.post(
  "/clients/:id/events",
  partnerAuth("write"),
  async (req, res): Promise<void> => {
    const id = parsePartnerId(String(req.params.id));
    if (id === null) {
      res.status(400).json({ error: "Ongeldige klant-id." });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const summary =
      typeof body.summary === "string" ? body.summary.trim() : "";
    if (!summary) {
      res.status(400).json({ error: "Veld 'summary' is verplicht." });
      return;
    }
    const type =
      typeof body.type === "string" && body.type.trim()
        ? body.type.trim()
        : "event";

    const [client] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, id))
      .limit(1);
    if (!client) {
      res.status(404).json({ error: "Klant niet gevonden." });
      return;
    }

    const partnerName =
      (req as { partner?: { name?: string } }).partner?.name ?? "partner";
    const stamp = new Date().toISOString();
    const entry = `### ${stamp} — ${type} (via ${partnerName})\n${summary}`;

    const previous = (client.currentState ?? "").trim();
    let next = previous ? `${entry}\n\n${previous}` : entry;
    if (next.length > MAX_CURRENT_STATE_LEN) {
      next = next.slice(0, MAX_CURRENT_STATE_LEN);
    }

    const [updated] = await db
      .update(clientsTable)
      .set({ currentState: next, updatedAt: new Date() })
      .where(eq(clientsTable.id, id))
      .returning();

    res.json({
      ok: true,
      clientId: id,
      currentStateLength: (updated.currentState ?? "").length,
      updatedAt: updated.updatedAt.toISOString(),
    });
  },
);

/**
 * POST /generations — trigger a generation. Reuses the autonomous generate
 * engine and runs server-side to completion (which survives the partner's HTTP
 * disconnect), returning the archived run's id + status. Scope: trigger.
 */
router.post(
  "/generations",
  partnerAuth("trigger"),
  async (req, res): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    // A partner may address the client by numeric id (natural for a spun-off
    // project) or by an explicit clientPath. The numeric id wins when present.
    let clientPath = body.clientPath;
    if (typeof body.clientId === "number" && Number.isInteger(body.clientId)) {
      clientPath = dbClientPath(body.clientId);
    } else if (
      typeof body.clientId === "string" &&
      /^\d+$/.test(body.clientId.trim())
    ) {
      clientPath = dbClientPath(Number(body.clientId.trim()));
    }

    const resolved = await resolveGenerationContext({ ...body, clientPath });
    if (!resolved.ok) {
      res.status(resolved.status).json({ error: resolved.error });
      return;
    }

    const controller = new AbortController();
    const result = await runGeneration(resolved.ctx, {
      sink: () => {},
      signal: controller.signal,
      triggerSource: "partner",
    });

    res.json({
      id: result.generationId,
      status: result.status,
      archived: result.archived,
      approvalStatus: result.approvalStatus ?? null,
      error: result.error ?? null,
    });
  },
);

/**
 * GET /generations/:id — poll a generation's status + result. Scope: read.
 */
router.get(
  "/generations/:id",
  partnerAuth("read"),
  async (req, res): Promise<void> => {
    const id = parsePartnerId(String(req.params.id));
    if (id === null) {
      res.status(400).json({ error: "Ongeldige generatie-id." });
      return;
    }

    const [row] = await db
      .select()
      .from(generationsTable)
      .where(eq(generationsTable.id, id))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Generatie niet gevonden." });
      return;
    }

    res.json({
      id: row.id,
      status: row.status,
      workflowTitle: row.workflowTitle,
      clientName: row.clientName,
      finalMarkdown: row.finalMarkdown,
      approvalStatus: row.approvalStatus ?? null,
      createdAt: row.createdAt.toISOString(),
    });
  },
);

export default router;
