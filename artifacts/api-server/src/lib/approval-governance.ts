import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import { getGeneration } from "./generations-store";
import { recordActionEvent } from "./action-events";

export const approvalGovernanceAudit: RequestHandler = async (req, res, next) => {
  const match = /^\/generations\/(\d+)\/(approve|request-changes)$/.exec(req.path);
  if (req.method !== "POST" || !match) { next(); return; }
  const id = Number(match[1]); const action = match[2] === "approve" ? "approval.gmail_draft.create" : "approval.changes_request";
  const before = await getGeneration(id).catch(() => null); const snapshotHash = before?.pendingDelivery ? createHash("sha256").update(before.pendingDelivery).digest("hex") : null;
  res.on("finish", () => { void recordActionEvent({ action, targetType: "generation", targetId: id, previousState: { approvalStatus: before?.approvalStatus ?? null, heldSnapshotHash: snapshotHash }, nextState: { httpStatus: res.statusCode, succeeded: res.statusCode >= 200 && res.statusCode < 300 }, providerResult: match[2] === "approve" ? { effect: "gmail_draft_only", sendsEmail: false } : { effect: "delivery_blocked", sendsEmail: false } }); });
  next();
};
