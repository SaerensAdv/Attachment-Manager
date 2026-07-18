import { Router, type IRouter } from "express";
import { GetDocGraphResponse, GetDocContentQueryParams, GetDocContentResponse, GetDocValidationResponse, GetDocBacklinksQueryParams, GetDocBacklinksResponse, SearchDocsBody, SearchDocsResponse, UpdateDocContentBody, UpdateDocContentResponse } from "@workspace/api-zod";
import { getDocGraph, getDocFile, listDocFiles, writeDocFile } from "../lib/docs";
import { validateDocs } from "../lib/validate-docs";
import { getBacklinks } from "../lib/backlinks";
import { semanticSearch } from "../lib/semantic";
import { loadClientDocs } from "../lib/clients-store";
import { buildKnowledgeItem } from "../lib/knowledge-contract";
import { loadBrainHierarchy } from "../lib/brain-hierarchy";

const router: IRouter = Router();

router.get("/docs/hierarchy", async (_req, res): Promise<void> => {
  const clientDocs = await loadClientDocs();
  const result = loadBrainHierarchy(listDocFiles(clientDocs).map((file) => file.path));
  res.status(result.issues.length ? 503 : 200).json(result);
});
router.get("/docs/graph", async (_req, res): Promise<void> => { const graph = getDocGraph(await loadClientDocs()); res.json(GetDocGraphResponse.parse(graph)); });
router.get("/docs/validate", async (_req, res): Promise<void> => { const report = validateDocs(await loadClientDocs()); res.json(GetDocValidationResponse.parse(report)); });
router.get("/knowledge/item", async (req, res): Promise<void> => { const nodeId = typeof req.query.nodeId === "string" ? req.query.nodeId.trim() : ""; if (!nodeId) { res.status(400).json({ error: "Query parameter 'nodeId' is required" }); return; } const clientDocs = await loadClientDocs(); const file = getDocFile(nodeId, clientDocs); if (!file) { res.status(404).json({ error: "Knowledge item not found" }); return; } const graph = getDocGraph(clientDocs); res.json(buildKnowledgeItem(file, graph.edges.filter((edge) => edge.source === nodeId || edge.target === nodeId))); });
router.get("/docs/content", async (req, res): Promise<void> => { if (typeof req.query.path !== "string" || !req.query.path.length) { res.status(400).json({ error: "Query parameter 'path' is required" }); return; } const parsed = GetDocContentQueryParams.safeParse(req.query); if (!parsed.success) { req.log.warn({ errors: parsed.error.message }, "Invalid docs content query"); res.status(400).json({ error: parsed.error.message }); return; } const file = getDocFile(parsed.data.path, await loadClientDocs()); if (!file) { res.status(404).json({ error: "Document not found" }); return; } res.json(GetDocContentResponse.parse({ id: file.id, path: file.path, title: file.title, category: file.category, content: file.content })); });
router.put("/docs/content", async (req, res): Promise<void> => { const parsed = UpdateDocContentBody.safeParse(req.body); if (!parsed.success) { req.log.warn({ errors: parsed.error.message }, "Invalid docs update body"); res.status(400).json({ error: parsed.error.message }); return; } const updated = writeDocFile(parsed.data.path, parsed.data.content); if (!updated) { res.status(403).json({ error: "Dit document kan niet bewerkt worden" }); return; } res.json(UpdateDocContentResponse.parse({ id: updated.id, path: updated.path, title: updated.title, category: updated.category, content: updated.content })); });
router.get("/docs/backlinks", async (req, res): Promise<void> => { if (typeof req.query.path !== "string" || !req.query.path.length) { res.status(400).json({ error: "Query parameter 'path' is required" }); return; } const parsed = GetDocBacklinksQueryParams.safeParse(req.query); if (!parsed.success) { req.log.warn({ errors: parsed.error.message }, "Invalid backlinks query"); res.status(400).json({ error: parsed.error.message }); return; } res.json(GetDocBacklinksResponse.parse({ backlinks: getBacklinks(parsed.data.path, await loadClientDocs()) })); });
router.post("/docs/search", async (req, res): Promise<void> => { const parsed = SearchDocsBody.safeParse(req.body); if (!parsed.success) { req.log.warn({ errors: parsed.error.message }, "Invalid docs search body"); res.status(400).json({ error: parsed.error.message }); return; } res.json(SearchDocsResponse.parse({ results: await semanticSearch(parsed.data.query, parsed.data.limit ?? 30, await loadClientDocs()) })); });
export default router;
