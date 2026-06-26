import { Router, type IRouter } from "express";
import { and, eq, isNull, or } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import { discoverClients } from "../lib/client-discovery";
import { asTrimmed } from "./clients-shared";

const router: IRouter = Router();

/**
 * Discovery (read-only): find accounts the agency manages that aren't yet a
 * client, plus missing integration keys we can confidently fill on existing
 * clients. Returns a review payload — nothing is created or changed here; the
 * user confirms via POST /clients/discovery/apply.
 */
router.get("/clients/discovery", async (_req, res) => {
  try {
    const result = await discoverClients();
    res.json(result);
  } catch (err) {
    res.status(502).json({
      error: "Kon klantontdekking niet uitvoeren.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

/** Validate a Google Ads customer id value (digits, optionally dash-grouped). */
function validateAdsId(raw: string): string | { error: string } {
  if (!/^[\d\s-]+$/.test(raw)) {
    return {
      error: "Google Ads customer ID mag enkel cijfers en streepjes bevatten.",
    };
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 12) {
    return { error: "Google Ads customer ID moet 8 tot 12 cijfers bevatten." };
  }
  return raw;
}

/** Validate a Search Console property value (sc-domain: or url-prefix). */
function validateScUrl(raw: string): string | { error: string } {
  const ok =
    /^sc-domain:[a-z0-9.-]+$/i.test(raw) || /^https?:\/\/[^\s]+$/i.test(raw);
  if (!ok) {
    return {
      error:
        'Search Console-property moet "sc-domain:voorbeeld.be" of "https://voorbeeld.be/" zijn.',
    };
  }
  return raw;
}

/**
 * Apply confirmed discovery results: fill missing keys on existing clients and
 * create the new clients the user ticked. Everything is validated again here
 * (the review payload is user-editable) and enrichments only ever fill a key
 * that is still empty — we never overwrite an existing value.
 */
router.post("/clients/discovery/apply", async (req, res) => {
  const body = (req.body ?? {}) as {
    enrichments?: unknown;
    newClients?: unknown;
  };
  const enrichments = Array.isArray(body.enrichments) ? body.enrichments : [];
  const newClients = Array.isArray(body.newClients) ? body.newClients : [];

  const enriched: { clientId: number; field: string }[] = [];
  const created: { id: number; name: string }[] = [];
  const errors: string[] = [];

  // --- Enrichments: fill a single empty key on an existing client. ----------
  for (const raw of enrichments) {
    const e = (raw ?? {}) as Record<string, unknown>;
    const clientId = Number(e.clientId);
    const field = String(e.field ?? "");
    const value = asTrimmed(e.value);
    if (!Number.isInteger(clientId) || clientId <= 0 || !value) {
      errors.push("Ongeldige aanvulling overgeslagen.");
      continue;
    }
    if (field !== "googleAdsCustomerId" && field !== "searchConsoleSiteUrl") {
      errors.push(`Onbekend veld "${field}" overgeslagen.`);
      continue;
    }
    const checked =
      field === "googleAdsCustomerId"
        ? validateAdsId(value)
        : validateScUrl(value);
    if (typeof checked !== "string") {
      errors.push(`${field}: ${checked.error}`);
      continue;
    }
    // Never clobber an existing value — only fill when still empty. Done as a
    // single conditional UPDATE so a concurrent writer can't slip a value in
    // between a read and the write (atomic compare-and-fill).
    const fieldCol =
      field === "googleAdsCustomerId"
        ? clientsTable.googleAdsCustomerId
        : clientsTable.searchConsoleSiteUrl;
    const [updated] = await db
      .update(clientsTable)
      .set({ [field]: checked, updatedAt: new Date() })
      .where(
        and(
          eq(clientsTable.id, clientId),
          or(isNull(fieldCol), eq(fieldCol, "")),
        ),
      )
      .returning();
    if (updated) {
      enriched.push({ clientId, field });
      continue;
    }
    // Nothing updated: either the client is gone or the key is already set.
    const [current] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId));
    if (!current) {
      errors.push(`Klant ${clientId} niet gevonden.`);
    } else {
      errors.push(`${current.name}: ${field} is al ingevuld, overgeslagen.`);
    }
  }

  // --- New clients: validate + insert. --------------------------------------
  // Guard against duplicates (stale review payloads, manual edits, double
  // submits): skip a candidate whose name / Ads-ID / SC-property already exists
  // on a client, and track within-batch so the same key can't be inserted twice.
  const existingForDupe = newClients.length
    ? await db.select().from(clientsTable)
    : [];
  const digitsOf = (v: string | null | undefined) =>
    (v ?? "").replace(/\D/g, "");
  const takenNames = new Set(
    existingForDupe.map((c) => c.name.trim().toLowerCase()),
  );
  const takenAds = new Set(
    existingForDupe.map((c) => digitsOf(c.googleAdsCustomerId)).filter(Boolean),
  );
  const takenSc = new Set(
    existingForDupe
      .map((c) => (c.searchConsoleSiteUrl ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  for (const raw of newClients) {
    const n = (raw ?? {}) as Record<string, unknown>;
    const name = asTrimmed(n.name);
    if (!name) {
      errors.push("Nieuwe klant zonder naam overgeslagen.");
      continue;
    }
    const values: Record<string, string> = {};
    const adsRaw = asTrimmed(n.googleAdsCustomerId);
    if (adsRaw) {
      const checked = validateAdsId(adsRaw);
      if (typeof checked !== "string") {
        errors.push(`${name}: ${checked.error}`);
        continue;
      }
      values.googleAdsCustomerId = checked;
    }
    const scRaw = asTrimmed(n.searchConsoleSiteUrl);
    if (scRaw) {
      const checked = validateScUrl(scRaw);
      if (typeof checked !== "string") {
        errors.push(`${name}: ${checked.error}`);
        continue;
      }
      values.searchConsoleSiteUrl = checked;
    }
    const website = asTrimmed(n.website);
    if (website) values.website = website;

    const nameKey = name.toLowerCase();
    const adsKey = values.googleAdsCustomerId
      ? digitsOf(values.googleAdsCustomerId)
      : "";
    const scKey = values.searchConsoleSiteUrl
      ? values.searchConsoleSiteUrl.toLowerCase()
      : "";
    if (takenNames.has(nameKey)) {
      errors.push(`${name}: bestaat al als klant, overgeslagen.`);
      continue;
    }
    if (adsKey && takenAds.has(adsKey)) {
      errors.push(`${name}: Google Ads-ID is al in gebruik, overgeslagen.`);
      continue;
    }
    if (scKey && takenSc.has(scKey)) {
      errors.push(
        `${name}: Search Console-property is al in gebruik, overgeslagen.`,
      );
      continue;
    }

    const [inserted] = await db
      .insert(clientsTable)
      .values({ name, ...values })
      .returning();
    created.push({ id: inserted.id, name: inserted.name });
    takenNames.add(nameKey);
    if (adsKey) takenAds.add(adsKey);
    if (scKey) takenSc.add(scKey);
  }

  res.json({ enriched, created, errors });
});

export default router;
