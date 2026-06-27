import { Router, type IRouter } from "express";
import { listPendingProposals } from "../lib/proposals-store";
import { listPendingApprovals } from "../lib/generations-store";
import { listAlerts } from "../lib/alerts-store";
import { serializeProposal } from "./generations";
import { serializeAlert } from "./alerts";

const router: IRouter = Router();

/**
 * Read the held deliverable's `kind` from the pending-delivery JSON snapshot,
 * tolerantly. The snapshot shape can change over time and bad/empty JSON must
 * never break the overview, so any parse failure degrades to null.
 */
function parseDeliveryKind(pendingDelivery: string | null): string | null {
  if (!pendingDelivery) return null;
  try {
    const parsed = JSON.parse(pendingDelivery) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "kind" in parsed &&
      typeof (parsed as { kind: unknown }).kind === "string"
    ) {
      return (parsed as { kind: string }).kind;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * "Te doen" overview: a single aggregate of everything waiting on the operator —
 * learned-rule proposals awaiting a decision, client-facing deliverables held
 * for approval, and unresolved system alerts. Each source is best-effort so a
 * single failing store degrades that section to empty instead of failing the
 * whole overview.
 */
router.get("/todo", async (_req, res) => {
  const [proposals, approvals, alerts] = await Promise.all([
    listPendingProposals().catch(() => []),
    listPendingApprovals().catch(() => []),
    listAlerts({ unresolvedOnly: true }).catch(() => []),
  ]);

  res.json({
    pendingProposals: proposals.map(serializeProposal),
    pendingApprovals: approvals.map((a) => ({
      generationId: a.id,
      clientName: a.clientName,
      workflowTitle: a.workflowTitle,
      kind: parseDeliveryKind(a.pendingDelivery),
      createdAt: a.createdAt.toISOString(),
    })),
    unresolvedAlerts: alerts.map(serializeAlert),
  });
});

export default router;
