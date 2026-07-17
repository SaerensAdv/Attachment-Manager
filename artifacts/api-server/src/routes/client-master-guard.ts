import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import { CLICKUP_OWNED_CLIENT_FIELDS } from "../lib/clickup-company-master";

/** Reject local overwrites of ClickUp-owned identity fields on linked clients. */
export async function guardClickUpOwnedClientFields(req: Request, res: Response, next: NextFunction) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { next(); return; }
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client || !(client.clickupCompanyId ?? "").trim()) { next(); return; }
  const conflicts = CLICKUP_OWNED_CLIENT_FIELDS.filter((field) => {
    if (!(field in (req.body ?? {}))) return false;
    const incoming = String((req.body as Record<string,unknown>)[field] ?? "").trim();
    const current = String((client as unknown as Record<string,unknown>)[field] ?? "").trim();
    return incoming !== current;
  });
  if (conflicts.length) {
    res.status(409).json({
      error: "Deze velden worden beheerd door ClickUp Companies. Pas ze in ClickUp aan en synchroniseer opnieuw.",
      code: "CLICKUP_OWNED_FIELDS",
      fields: conflicts,
    });
    return;
  }
  next();
}
