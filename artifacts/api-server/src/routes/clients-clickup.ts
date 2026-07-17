import { Router, type IRouter } from "express";
import { and, eq, isNull, or } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import { syncClickUpCompanies } from "../lib/clickup-sync";
import { asTrimmed } from "./clients-shared";

const router: IRouter = Router();

/**
 * ClickUp link-only sync (read-only): match app clients to the master companies
 * in ClickUp (CRM → Companies) and return a review payload — proposed links,
 * already-linked clients, and what stays unmatched on both sides. Nothing is
 * created or changed here; the user confirms via POST /clients/clickup/apply.
 */
router.get("/clients/clickup/sync", async (_req, res) => {
  try {
    const result = await syncClickUpCompanies();
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: "Kon de ClickUp-synchronisatie niet uitvoeren.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

/** A ClickUp task id: alphanumeric token (e.g. "86carekxx"). */
function validateCompanyId(raw: string): string | { error: string } {
  if (!/^[a-z0-9]{4,40}$/i.test(raw)) {
    return { error: "Ongeldig ClickUp bedrijf-id." };
  }
  return raw;
}

/** Postgres unique-violation (SQLSTATE 23505) — the partial unique index on
 * `clients.clickup_company_id` firing when a company is already linked. */
function isUniqueViolation(err: unknown): boolean {
  const code =
    (err as { code?: string })?.code ??
    (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

/**
 * Apply confirmed ClickUp links: store the ClickUp company id on each chosen app
 * client. Strictly non-destructive:
 *  - compare-and-fill — only sets `clickupCompanyId` when it's still empty, as a
 *    single conditional UPDATE so a concurrent writer can't slip in between a
 *    read and the write. An already-linked client is skipped, never overwritten.
 *  - one company → one client — enforced by a partial unique index on
 *    `clickup_company_id` in the DB (plus an app-level pre-check and within-batch
 *    tracking), so the same ClickUp company can never be linked to two clients,
 *    even under a concurrent/double-clicked apply.
 * Nothing is ever written to ClickUp.
 */
router.post("/clients/clickup/apply", async (req, res) => {
  const body = (req.body ?? {}) as { links?: unknown };
  const links = Array.isArray(body.links) ? body.links : [];

  const linked: { clientId: number; companyId: string }[] = [];
  const errors: string[] = [];

  // Company ids already taken by an existing link, so we never point two clients
  // at the same ClickUp company. Refreshed once up front; within-batch additions
  // are tracked as we go.
  const rows = links.length
    ? await db
        .select({ id: clientsTable.id, companyId: clientsTable.clickupCompanyId })
        .from(clientsTable)
    : [];
  const takenCompanies = new Set(
    rows.map((r) => (r.companyId ?? "").trim()).filter(Boolean),
  );

  for (const raw of links) {
    const l = (raw ?? {}) as Record<string, unknown>;
    const clientId = Number(l.clientId);
    const companyRaw = asTrimmed(l.companyId);
    if (!Number.isInteger(clientId) || clientId <= 0 || !companyRaw) {
      errors.push("Ongeldige koppeling overgeslagen.");
      continue;
    }
    const checked = validateCompanyId(companyRaw);
    if (typeof checked !== "string") {
      errors.push(checked.error);
      continue;
    }
    if (takenCompanies.has(checked)) {
      errors.push(
        `ClickUp-bedrijf ${checked} is al aan een klant gekoppeld, overgeslagen.`,
      );
      continue;
    }

    // Only fill when still empty — atomic compare-and-fill (never overwrite).
    let updated;
    try {
      [updated] = await db
        .update(clientsTable)
        .set({ clickupCompanyId: checked, updatedAt: new Date() })
        .where(
          and(
            eq(clientsTable.id, clientId),
            or(
              isNull(clientsTable.clickupCompanyId),
              eq(clientsTable.clickupCompanyId, ""),
            ),
          ),
        )
        .returning();
    } catch (err) {
      // The partial unique index rejected it: another client just claimed this
      // ClickUp company (concurrent/double-clicked apply). Treat as taken.
      if (isUniqueViolation(err)) {
        takenCompanies.add(checked);
        errors.push(
          `ClickUp-bedrijf ${checked} is al aan een klant gekoppeld, overgeslagen.`,
        );
        continue;
      }
      throw err;
    }
    if (updated) {
      linked.push({ clientId, companyId: checked });
      takenCompanies.add(checked);
      continue;
    }

    // Nothing updated: either the client is gone or it's already linked.
    const [current] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId));
    if (!current) {
      errors.push(`Klant ${clientId} niet gevonden.`);
    } else {
      errors.push(
        `${current.name}: is al aan een ClickUp-bedrijf gekoppeld, overgeslagen.`,
      );
    }
  }

  res.json({ linked, errors });
});

export default router;
