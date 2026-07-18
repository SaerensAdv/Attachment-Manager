import { Router, type IRouter } from "express";
import { isOwner } from "../middlewares/requireAuth";
import { loadBrainHierarchy } from "../lib/brain-hierarchy";
import { listDocFiles } from "../lib/docs";
import { auditStoredHistoricalSources } from "../lib/historical-source-compatibility";
import { getSourceResolutionTelemetry, resolveBrainSource } from "../lib/source-resolver";
import { buildSourceInventory } from "../lib/source-inventory";

const router: IRouter = Router();
router.get("/docs/source-resolution", (req, res): void => {
  if (!isOwner(req)) { res.status(403).json({ error: "Owner access required" }); return; }
  const source = typeof req.query.source === "string" ? req.query.source.trim() : "";
  if (!source) { res.status(400).json({ error: "Query parameter 'source' is required" }); return; }
  const files = listDocFiles();
  const hierarchy = loadBrainHierarchy(files.map((file) => file.path));
  if (hierarchy.issues.length) { res.status(503).json({ error: "Source hierarchy is invalid", issues: hierarchy.issues.map((issue) => issue.code) }); return; }
  const resolution = resolveBrainSource(source, hierarchy);
  if (!resolution) { res.status(404).json({ error: "Source not found" }); return; }
  res.json(resolution);
});
router.get("/docs/source-inventory", (req, res): void => {
  if (!isOwner(req)) { res.status(403).json({ error: "Owner access required" }); return; }
  const inventory = buildSourceInventory(listDocFiles());
  res.status(inventory.drift.length ? 409 : 200).json(inventory);
});
router.get("/docs/historical-compatibility", async (req, res): Promise<void> => {
  if (!isOwner(req)) { res.status(403).json({ error: "Owner access required" }); return; }
  const audit = await auditStoredHistoricalSources();
  res.status(audit.unresolved ? 409 : 200).json({ ...audit, telemetry: getSourceResolutionTelemetry() });
});
router.get("/docs/source-resolution-telemetry", (req, res): void => {
  if (!isOwner(req)) { res.status(403).json({ error: "Owner access required" }); return; }
  res.json(getSourceResolutionTelemetry());
});
export default router;
