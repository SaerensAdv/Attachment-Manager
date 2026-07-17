import { Router, type IRouter } from "express";
import { listPendingProposals } from "../lib/proposals-store";
import { listPendingApprovals } from "../lib/generations-store";
import { listAlerts } from "../lib/alerts-store";
import { serializeProposal } from "./generations";
import { serializeAlert } from "./alerts";

const router: IRouter = Router();

type SectionStatus = "ok" | "unavailable";

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

function section(status: SectionStatus, count: number, errorCode?: string) {
  return { status, count, errorCode: errorCode ?? null };
}

router.get("/todo", async (_req, res) => {
  // allSettled preserves the useful best-effort behavior while making outages
  // distinguishable from a genuinely empty queue.
  const [proposalsResult, approvalsResult, alertsResult] = await Promise.allSettled([
    listPendingProposals(),
    listPendingApprovals(),
    listAlerts({ unresolvedOnly: true }),
  ]);

  const proposals =
    proposalsResult.status === "fulfilled" ? proposalsResult.value : [];
  const approvals =
    approvalsResult.status === "fulfilled" ? approvalsResult.value : [];
  const alerts = alertsResult.status === "fulfilled" ? alertsResult.value : [];

  const pendingProposals = proposals.map(serializeProposal);
  const pendingApprovals = approvals.map((a) => ({
    generationId: a.id,
    clientName: a.clientName,
    workflowTitle: a.workflowTitle,
    kind: parseDeliveryKind(a.pendingDelivery),
    createdAt: a.createdAt.toISOString(),
  }));
  const unresolvedAlerts = alerts.map(serializeAlert);

  const sections = {
    pendingProposals: section(
      proposalsResult.status === "fulfilled" ? "ok" : "unavailable",
      pendingProposals.length,
      proposalsResult.status === "rejected" ? "PROPOSALS_UNAVAILABLE" : undefined,
    ),
    pendingApprovals: section(
      approvalsResult.status === "fulfilled" ? "ok" : "unavailable",
      pendingApprovals.length,
      approvalsResult.status === "rejected" ? "APPROVALS_UNAVAILABLE" : undefined,
    ),
    unresolvedAlerts: section(
      alertsResult.status === "fulfilled" ? "ok" : "unavailable",
      unresolvedAlerts.length,
      alertsResult.status === "rejected" ? "ALERTS_UNAVAILABLE" : undefined,
    ),
  };

  res.json({
    pendingProposals,
    pendingApprovals,
    unresolvedAlerts,
    sections,
    partial: Object.values(sections).some((s) => s.status === "unavailable"),
  });
});

export default router;
