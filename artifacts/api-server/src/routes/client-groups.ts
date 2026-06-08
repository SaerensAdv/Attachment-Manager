import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import {
  db,
  clientGroupsTable,
  clientsTable,
  type ClientGroup,
} from "@workspace/db";

const router: IRouter = Router();

const MAX_NAME_LEN = 200;
const MAX_NOTES_LEN = 5_000;

function asTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Validate + normalize a group request body, or return an error. */
function parseBody(body: unknown): { name: string; notes: string | null } | { error: string } {
  const obj = (body ?? {}) as Record<string, unknown>;
  const name = asTrimmed(obj.name);
  if (!name) return { error: "Naam is verplicht." };
  if (name.length > MAX_NAME_LEN) {
    return { error: `Naam is te lang (max ${MAX_NAME_LEN} tekens).` };
  }
  const notes = asTrimmed(obj.notes);
  if (notes && notes.length > MAX_NOTES_LEN) {
    return { error: `Notities zijn te lang (max ${MAX_NOTES_LEN} tekens).` };
  }
  return { name, notes };
}

function serialize(group: ClientGroup) {
  return {
    ...group,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

/** List all groups with a count of how many client fiches belong to each. */
router.get("/client-groups", async (_req, res) => {
  const groups = await db
    .select()
    .from(clientGroupsTable)
    .orderBy(asc(clientGroupsTable.name));

  // One pass over the client rows to count members per group.
  const clientRows = await db
    .select({ id: clientsTable.id, groupId: clientsTable.groupId })
    .from(clientsTable);
  const counts = new Map<number, number>();
  for (const c of clientRows) {
    if (c.groupId != null) {
      counts.set(c.groupId, (counts.get(c.groupId) ?? 0) + 1);
    }
  }

  res.json({
    groups: groups.map((g) => ({
      ...serialize(g),
      memberCount: counts.get(g.id) ?? 0,
    })),
  });
});

/** A single group plus the client fiches that belong to it (lightweight cards). */
router.get("/client-groups/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [group] = await db
    .select()
    .from(clientGroupsTable)
    .where(eq(clientGroupsTable.id, id));
  if (!group) {
    res.status(404).json({ error: "Klantgroep niet gevonden." });
    return;
  }
  const members = await db
    .select({
      id: clientsTable.id,
      name: clientsTable.name,
      business: clientsTable.business,
      website: clientsTable.website,
    })
    .from(clientsTable)
    .where(eq(clientsTable.groupId, id))
    .orderBy(asc(clientsTable.name));

  res.json({ group: serialize(group), members });
});

router.post("/client-groups", async (req, res) => {
  const parsed = parseBody(req.body);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const [row] = await db
    .insert(clientGroupsTable)
    .values({ name: parsed.name, notes: parsed.notes })
    .returning();
  res.status(201).json(serialize(row));
});

router.put("/client-groups/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const parsed = parseBody(req.body);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const [row] = await db
    .update(clientGroupsTable)
    .set({ name: parsed.name, notes: parsed.notes, updatedAt: new Date() })
    .where(eq(clientGroupsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Klantgroep niet gevonden." });
    return;
  }
  res.json(serialize(row));
});

/**
 * Delete a group. The clients.group_id FK is ON DELETE SET NULL, so member
 * fiches are not deleted — they simply become ungrouped.
 */
router.delete("/client-groups/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [row] = await db
    .delete(clientGroupsTable)
    .where(eq(clientGroupsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Klantgroep niet gevonden." });
    return;
  }
  res.json({ ok: true });
});

export default router;
