import { Router, type IRouter } from "express";
import {
  GetDocGraphResponse,
  GetDocContentQueryParams,
  GetDocContentResponse,
} from "@workspace/api-zod";
import { getDocGraph, getDocFile } from "../lib/docs";

const router: IRouter = Router();

router.get("/docs/graph", (req, res): void => {
  const graph = getDocGraph();
  res.json(GetDocGraphResponse.parse(graph));
});

router.get("/docs/content", (req, res): void => {
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

  const file = getDocFile(parsed.data.path);
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

export default router;
