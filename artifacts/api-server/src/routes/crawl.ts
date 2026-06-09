import { Router, type IRouter } from "express";
import { db, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { summarizeCrawl } from "../lib/screaming-frog";

const router: IRouter = Router();

/**
 * Receive a Screaming Frog crawl export for a client ("Model B": the user runs
 * the licensed desktop crawler and pushes the CSV here). The latest crawl is
 * stored on the client record and rendered into the client doc the agents read,
 * exactly like the other live-data fields.
 *
 * Like the autonomous trigger, this endpoint is callable from outside (the push
 * runs on the user's own machine), so it is gated behind a shared secret:
 * `x-trigger-secret` must match SCREAMING_FROG_INTAKE_SECRET, or — when that is
 * unset — AUTONOMOUS_TRIGGER_SECRET (so it works out of the box with the secret
 * the agency already has, and can be separated later). When neither is set the
 * endpoint is disabled (503), so an open intake is never exposed by accident.
 *
 * The raw CSV is the request body (parsed as text by a route-scoped parser in
 * app.ts). The target client is `?clientId=N`; an optional `?crawledAt=<ISO>`
 * records when the crawl actually ran.
 */
router.post("/crawl-intake", async (req, res): Promise<void> => {
  const expected =
    process.env.SCREAMING_FROG_INTAKE_SECRET ||
    process.env.AUTONOMOUS_TRIGGER_SECRET;
  if (!expected) {
    res.status(503).json({
      error:
        "Crawl-intake is uitgeschakeld: stel SCREAMING_FROG_INTAKE_SECRET (of AUTONOMOUS_TRIGGER_SECRET) in om hem te activeren.",
    });
    return;
  }
  const provided = req.header("x-trigger-secret");
  if (provided !== expected) {
    res.status(401).json({ error: "Ongeldige of ontbrekende trigger-secret." });
    return;
  }

  const rawId = req.query.clientId;
  const id = Number(typeof rawId === "string" ? rawId : NaN);
  if (!Number.isInteger(id) || id <= 0) {
    res
      .status(400)
      .json({ error: "Geef een geldige clientId mee (?clientId=N)." });
    return;
  }

  const csv = typeof req.body === "string" ? req.body : "";
  if (!csv.trim()) {
    res.status(400).json({
      error: "Lege body: stuur de Screaming Frog CSV-export als request body.",
    });
    return;
  }

  let crawledAt: Date | undefined;
  const rawAt = req.query.crawledAt;
  if (typeof rawAt === "string" && rawAt.trim()) {
    const parsed = new Date(rawAt);
    if (!Number.isNaN(parsed.getTime())) crawledAt = parsed;
  }

  const [row] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, id));
  if (!row) {
    res.status(404).json({ error: "Klant niet gevonden." });
    return;
  }

  const summary = summarizeCrawl(csv, { crawledAt });

  // A malformed or non-Screaming-Frog upload yields zero usable records. Reject
  // it instead of overwriting the last good crawl with a "no data" placeholder,
  // so one bad push can never erase the technical context the agents rely on.
  if (summary.records.length === 0) {
    res.status(400).json({ error: summary.text });
    return;
  }

  const [updated] = await db
    .update(clientsTable)
    .set({
      crawlLive: summary.text,
      crawlLiveAt: summary.fetchedAt,
      updatedAt: new Date(),
    })
    .where(eq(clientsTable.id, id))
    .returning();

  res.json({
    id: updated.id,
    name: updated.name,
    crawlLiveAt: updated.crawlLiveAt ? updated.crawlLiveAt.toISOString() : null,
    stats: summary.stats,
  });
});

export default router;
