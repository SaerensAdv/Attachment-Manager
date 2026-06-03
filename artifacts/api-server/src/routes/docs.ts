import { Router, type IRouter } from "express";
import {
  GetDocGraphResponse,
  GetDocContentQueryParams,
  GetDocContentResponse,
  GetDocValidationResponse,
  GetDocBacklinksQueryParams,
  GetDocBacklinksResponse,
  SearchDocsBody,
  SearchDocsResponse,
  UpdateDocContentBody,
  UpdateDocContentResponse,
} from "@workspace/api-zod";
import { getDocGraph, getDocFile, writeDocFile } from "../lib/docs";
import { validateDocs } from "../lib/validate-docs";
import { getBacklinks } from "../lib/backlinks";
import { semanticSearch } from "../lib/semantic";
import { loadClientDocs } from "../lib/clients-store";

const router: IRouter = Router();

router.get("/docs/graph", async (req, res): Promise<void> => {
  const graph = getDocGraph(await loadClientDocs());
  res.json(GetDocGraphResponse.parse(graph));
});

router.get("/docs/validate", async (req, res): Promise<void> => {
  const report = validateDocs(await loadClientDocs());
  res.json(GetDocValidationResponse.parse(report));
});

router.get("/docs/content", async (req, res): Promise<void> => {
  // `path` is coerced to a string by the generated schema, so a missing param
  // would slip through as the literal "undefined". Guard presence explicitly.
  if (typeof req.query.path !== "string" || req.query.path.length === 0) {
    res.status(400).json({ error: "Query parameter 'path' is required" });
    return;
  }

  const parsed = GetDocContentQueryParams.safeParse(req.query);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid docs content query");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const file = getDocFile(parsed.data.path, await loadClientDocs());
  if (!file) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  res.json(
    GetDocContentResponse.parse({
      id: file.id,
      path: file.path,
      title: file.title,
      category: file.category,
      content: file.content,
    }),
  );
});

router.put("/docs/content", async (req, res): Promise<void> => {
  const parsed = UpdateDocContentBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid docs update body");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Only real, on-disk documents are editable; synthetic DB-backed client docs
  // and any path outside the docs root are rejected.
  const updated = writeDocFile(parsed.data.path, parsed.data.content);
  if (!updated) {
    res.status(403).json({ error: "Dit document kan niet bewerkt worden" });
    return;
  }

  res.json(
    UpdateDocContentResponse.parse({
      id: updated.id,
      path: updated.path,
      title: updated.title,
      category: updated.category,
      content: updated.content,
    }),
  );
});

router.get("/docs/backlinks", async (req, res): Promise<void> => {
  if (typeof req.query.path !== "string" || req.query.path.length === 0) {
    res.status(400).json({ error: "Query parameter 'path' is required" });
    return;
  }

  const parsed = GetDocBacklinksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid backlinks query");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const backlinks = getBacklinks(parsed.data.path, await loadClientDocs());
  res.json(GetDocBacklinksResponse.parse({ backlinks }));
});

router.post("/docs/search", async (req, res): Promise<void> => {
  const parsed = SearchDocsBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid docs search body");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const limit = parsed.data.limit ?? 30;
  const results = await semanticSearch(
    parsed.data.query,
    limit,
    await loadClientDocs(),
  );
  res.json(SearchDocsResponse.parse({ results }));
});

export default router;
