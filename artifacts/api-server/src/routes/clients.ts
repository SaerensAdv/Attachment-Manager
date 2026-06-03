import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clientsTable, type Client } from "@workspace/db";

const router: IRouter = Router();

/** Editable text fields, in the order they appear on the form. */
const FIELDS = [
  "business",
  "world",
  "services",
  "audience",
  "locations",
  "languages",
  "mainGoal",
  "conversionAction",
  "kpis",
  "budget",
  "toneOfVoice",
  "channels",
  "restrictions",
  "website",
  "landingPages",
  "currentState",
  "googleAdsData",
  "searchConsoleData",
] as const;

type FieldKey = (typeof FIELDS)[number];

/** Free-form paste fields that can hold large exports — bounded to keep the
 * generated client markdown (and thus agent prompt context) within sane limits. */
const LARGE_FIELDS: readonly FieldKey[] = [
  "currentState",
  "googleAdsData",
  "searchConsoleData",
];
const MAX_LARGE_FIELD_LEN = 50_000;

interface ClientInput {
  name: string;
  values: Partial<Record<FieldKey, string | null>>;
}

function asTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Validate + normalize a request body into a client payload, or return error. */
function parseBody(body: unknown): ClientInput | { error: string } {
  const obj = (body ?? {}) as Record<string, unknown>;
  const name = asTrimmed(obj.name);
  if (!name) return { error: "Naam is verplicht." };

  const values: Partial<Record<FieldKey, string | null>> = {};
  for (const key of FIELDS) {
    values[key] = asTrimmed(obj[key]);
  }
  for (const key of LARGE_FIELDS) {
    const value = values[key];
    if (value && value.length > MAX_LARGE_FIELD_LEN) {
      return {
        error: `Veld "${key}" is te groot (max ${MAX_LARGE_FIELD_LEN.toLocaleString("nl-BE")} tekens). Plak een samenvatting of de kerncijfers.`,
      };
    }
  }
  return { name, values };
}

/** Shape a DB row for the API response (timestamps as ISO strings). */
function serialize(client: Client) {
  return {
    ...client,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  };
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get("/clients", async (_req, res) => {
  const rows = await db
    .select()
    .from(clientsTable)
    .orderBy(clientsTable.name);
  res.json({ clients: rows.map(serialize) });
});

router.get("/clients/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [row] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }
  res.json(serialize(row));
});

router.post("/clients", async (req, res) => {
  const parsed = parseBody(req.body);
  if ("error" in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const [row] = await db
    .insert(clientsTable)
    .values({ name: parsed.name, ...parsed.values })
    .returning();
  res.status(201).json(serialize(row));
});

router.put("/clients/:id", async (req, res) => {
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
    .update(clientsTable)
    .set({ name: parsed.name, ...parsed.values, updatedAt: new Date() })
    .where(eq(clientsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }
  res.json(serialize(row));
});

router.delete("/clients/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const [row] = await db
    .delete(clientsTable)
    .where(eq(clientsTable.id, id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }
  res.status(204).end();
});

export default router;
