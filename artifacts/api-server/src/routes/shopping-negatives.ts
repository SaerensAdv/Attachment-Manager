import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import {
  fetchShoppingTermRelevanceData,
  GoogleAdsConfigError,
} from "../lib/google-ads";
import { scoreShoppingTerms } from "../lib/shopping-relevance";
import {
  addAdGroupNegativeKeywords,
  MAX_NEGATIVE_OPS,
  type NegativeMatchType,
  type NegativeKeywordOp,
} from "../lib/google-ads-mutate";
import {
  createShoppingTermRun,
  getShoppingTermRun,
  listShoppingTermRuns,
  saveShoppingDecisions,
  getLearnedRules,
  getWriteEnabled,
  setWriteEnabled,
  getDecisionsForClient,
  claimDecisionForApply,
  markDecisionApplied,
  revertDecisionToPending,
  type DecisionInput,
} from "../lib/shopping-negatives-store";
import { recordAlert } from "../lib/alerts-store";
import { parseId } from "./clients-shared";

/**
 * Routes for the Shopping search-term exclusion tool.
 *
 * Read paths (create/list/read a scored run, save review decisions) are like any
 * other client action. The apply path is special: it is the app's only live
 * WRITE to Google Ads, so it is guarded three ways — a mandatory server-side
 * dry-run (`validateOnly`), a per-client write switch, and the claim-before-write
 * / revert-on-fail compare-and-set in the store — so a negative can never be
 * pushed twice and nothing writes unless the user explicitly opted in.
 */
const router: IRouter = Router();

const MATCH_TYPES: NegativeMatchType[] = ["EXACT", "PHRASE", "BROAD"];

function normalizeMatchType(raw: unknown): NegativeMatchType {
  const t = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return (MATCH_TYPES as string[]).includes(t) ? (t as NegativeMatchType) : "EXACT";
}

async function loadCustomerId(
  id: number,
): Promise<{ clientId: number; customerId: string } | { error: string; status: number }> {
  const [row] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!row) return { error: "Klant niet gevonden.", status: 404 };
  const customerId = (row.googleAdsCustomerId ?? "").replace(/\D/g, "");
  if (!customerId) {
    return {
      error:
        "Deze klant heeft nog geen Google Ads customer ID. Vul het in en bewaar eerst.",
      status: 400,
    };
  }
  return { clientId: id, customerId };
}

/**
 * Create a run: pull the live (read-only) Shopping data, score every triggering
 * search term against the products in its ad group (deterministic + best-effort
 * LLM + learned rules), persist the snapshot, and return it for review.
 */
router.post("/clients/:id/shopping-terms/runs", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const resolved = await loadCustomerId(id);
  if ("error" in resolved) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }

  try {
    const [rules, data] = await Promise.all([
      getLearnedRules(id),
      fetchShoppingTermRelevanceData(resolved.customerId),
    ]);
    const result = await scoreShoppingTerms(data, rules);
    const runId = await createShoppingTermRun(id, result);
    const run = await getShoppingTermRun(runId);
    res.status(201).json(run);
  } catch (err) {
    if (err instanceof GoogleAdsConfigError) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(502).json({
      error: "Kon de zoektermen niet analyseren.",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

/** List past runs for a client (headers only), newest first. */
router.get("/clients/:id/shopping-terms/runs", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const runs = await listShoppingTermRuns(id);
  res.json({ runs });
});

/** Read one run with its scored terms and any saved decisions. */
router.get("/shopping-terms/runs/:runId", async (req, res) => {
  const runId = parseId(req.params.runId);
  if (runId === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const run = await getShoppingTermRun(runId);
  if (!run) {
    res.status(404).json({ error: "Analyse niet gevonden." });
    return;
  }
  res.json(run);
});

/** Save the user's keep/exclude decisions for a run (also learns rules). */
router.post("/shopping-terms/runs/:runId/decisions", async (req, res) => {
  const runId = parseId(req.params.runId);
  if (runId === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const rawList = Array.isArray(req.body?.decisions) ? req.body.decisions : [];
  const items: DecisionInput[] = [];
  for (const raw of rawList) {
    if (typeof raw !== "object" || raw === null) continue;
    const obj = raw as Record<string, unknown>;
    const scoreId = Number(obj.scoreId);
    if (!Number.isInteger(scoreId) || scoreId <= 0) continue;
    const decision = obj.decision === "keep" ? "keep" : "exclude";
    items.push({
      scoreId,
      decision,
      matchType: normalizeMatchType(obj.matchType),
      note: typeof obj.note === "string" ? obj.note : null,
    });
  }
  if (items.length === 0) {
    res.status(400).json({ error: "Geen geldige beslissingen aangeleverd." });
    return;
  }

  try {
    const saved = await saveShoppingDecisions(runId, items);
    res.json({ decisions: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("niet gevonden")) {
      res.status(404).json({ error: message });
      return;
    }
    res.status(500).json({ error: "Kon de beslissingen niet opslaan.", detail: message });
  }
});

/** Read the per-client "may write to Google Ads" switch. */
router.get("/clients/:id/shopping-terms/settings", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const writeEnabled = await getWriteEnabled(id);
  res.json({ writeEnabled });
});

/** Flip the per-client "may write to Google Ads" switch. */
router.post("/clients/:id/shopping-terms/settings", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const enabled = req.body?.writeEnabled === true;
  await setWriteEnabled(id, enabled);
  res.json({ writeEnabled: enabled });
});

interface ApplyOutcome {
  decisionId: number;
  term: string;
  adGroupId: string;
  status: "created" | "duplicate" | "failed" | "skipped";
  resourceName: string | null;
  error: string | null;
}

/**
 * Apply chosen exclusions to Google Ads. Default is a DRY-RUN
 * (`validateOnly !== false`): it builds the exact operations and asks Google to
 * validate them without persisting. A real write requires `validateOnly: false`
 * AND the per-client write switch to be on; each decision is then claimed
 * (pending -> applied) before its single live mutate and reverted on failure, so
 * exactly-once holds even under retries.
 */
router.post("/clients/:id/shopping-terms/apply", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const resolved = await loadCustomerId(id);
  if ("error" in resolved) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }
  const { customerId } = resolved;

  // Safety default: only an explicit `validateOnly: false` performs a real write.
  const dryRun = req.body?.validateOnly !== false;

  const rawIds = Array.isArray(req.body?.decisionIds) ? req.body.decisionIds : [];
  const decisionIds = rawIds
    .map((x: unknown) => Number(x))
    .filter((x: number) => Number.isInteger(x) && x > 0);
  if (decisionIds.length === 0) {
    res.status(400).json({ error: "Geen beslissingen geselecteerd." });
    return;
  }
  if (decisionIds.length > MAX_NEGATIVE_OPS) {
    res.status(400).json({
      error: `Te veel uitsluitingen in één keer (max ${MAX_NEGATIVE_OPS}).`,
    });
    return;
  }

  const decisions = await getDecisionsForClient(id, decisionIds);
  const excludes = decisions.filter((d) => d.decision === "exclude");
  if (excludes.length === 0) {
    res.status(400).json({
      error: "Geen uitsluitingen in de selectie (enkel 'behouden').",
    });
    return;
  }

  // Dry-run: validate every op server-side, claim nothing, persist nothing.
  if (dryRun) {
    const ops: NegativeKeywordOp[] = excludes.map((d) => ({
      adGroupId: d.adGroupId,
      text: d.term,
      matchType: normalizeMatchType(d.matchType),
    }));
    try {
      const { results } = await addAdGroupNegativeKeywords(customerId, ops, {
        validateOnly: true,
      });
      const outcomes: ApplyOutcome[] = results.map((r, i) => ({
        decisionId: excludes[i].id,
        term: excludes[i].term,
        adGroupId: excludes[i].adGroupId,
        status: r.status,
        resourceName: r.resourceName,
        error: r.error,
      }));
      res.json({ validateOnly: true, results: outcomes });
    } catch (err) {
      if (err instanceof GoogleAdsConfigError) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(502).json({
        error: "Kon de proefcontrole niet uitvoeren.",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  // Real write — must be explicitly enabled for this client.
  const writeEnabled = await getWriteEnabled(id);
  if (!writeEnabled) {
    res.status(403).json({
      error:
        "Live schrijven naar Google Ads staat uit voor deze klant. Zet de schakelaar aan en probeer opnieuw.",
    });
    return;
  }

  const outcomes: ApplyOutcome[] = [];
  let batchError: string | null = null;
  for (const d of excludes) {
    // Claim atomically BEFORE the live mutate so two concurrent applies can't
    // both push the same negative. A lost claim (already applied / not pending)
    // is reported as skipped.
    const claimed = await claimDecisionForApply(d.id);
    if (!claimed) {
      outcomes.push({
        decisionId: d.id,
        term: d.term,
        adGroupId: d.adGroupId,
        status: "skipped",
        resourceName: d.adsResourceName,
        error: null,
      });
      continue;
    }

    try {
      const { results } = await addAdGroupNegativeKeywords(
        customerId,
        [
          {
            adGroupId: d.adGroupId,
            text: d.term,
            matchType: normalizeMatchType(d.matchType),
          },
        ],
        { validateOnly: false },
      );
      const one = results[0];
      if (!one || one.status === "failed") {
        const detail = one?.error ?? "Onbekende fout bij het toepassen.";
        await revertDecisionToPending(d.id, detail);
        await recordAlert({
          source: "shopping-negatives",
          severity: "warn",
          message: `Uitsluiting niet toegepast: "${d.term}".`,
          context: { key: `apply-fail-${d.id}`, clientId: id, decisionId: d.id, detail },
        }).catch(() => {});
        outcomes.push({
          decisionId: d.id,
          term: d.term,
          adGroupId: d.adGroupId,
          status: "failed",
          resourceName: null,
          error: detail,
        });
      } else {
        await markDecisionApplied(d.id, one.resourceName);
        outcomes.push({
          decisionId: d.id,
          term: d.term,
          adGroupId: d.adGroupId,
          status: one.status,
          resourceName: one.resourceName,
          error: null,
        });
      }
    } catch (err) {
      // Batch-fatal (auth / quota / 5xx / network): revert this claim and stop —
      // the remaining ops would hit the same wall.
      const message = err instanceof Error ? err.message : String(err);
      await revertDecisionToPending(d.id, message).catch(() => {});
      await recordAlert({
        source: "shopping-negatives",
        severity: "error",
        message: "Live schrijven naar Google Ads afgebroken.",
        context: { key: `apply-abort-${id}`, clientId: id, decisionId: d.id, detail: message },
      }).catch(() => {});
      outcomes.push({
        decisionId: d.id,
        term: d.term,
        adGroupId: d.adGroupId,
        status: "failed",
        resourceName: null,
        error: message,
      });
      batchError = message;
      break;
    }
  }

  res.status(batchError ? 502 : 200).json({
    validateOnly: false,
    results: outcomes,
    error: batchError,
  });
});

export default router;
