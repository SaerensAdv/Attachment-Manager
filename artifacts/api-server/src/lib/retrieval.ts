import { create, insertMultiple, search } from "@orama/orama";
import { listDocFiles } from "./docs";

const RETRIEVABLE = new Set(["knowledge", "template"]);
const MAX_QUERY_CHARS = 1500;

export interface RetrievalResult {
  knowledge: string[];
  templates: string[];
}

export interface SelectOptions {
  knowledgeLimit?: number;
  templateLimit?: number;
  exclude?: Iterable<string>;
}

/**
 * Lexical (BM25) retrieval over the English `knowledge/` and `templates/` docs
 * using Orama. The index is rebuilt per call from the live filesystem docs
 * (cheap for the small corpus) so it never goes stale when docs change at
 * runtime.
 *
 * This is intentionally embedding-free: the Replit AI integrations (OpenAI,
 * Gemini, Anthropic) do not expose an embeddings API, so true semantic vectors
 * would require a user-supplied key. For a corpus of a few dozen short markdown
 * docs, BM25 keyword relevance is robust and instant. To upgrade to semantic
 * search later, add a `vector` field to the schema below and supply embeddings
 * at insert + search time.
 */
export async function selectRelevantDocs(
  query: string,
  opts: SelectOptions = {},
): Promise<RetrievalResult> {
  const empty: RetrievalResult = { knowledge: [], templates: [] };
  const term = query.trim().slice(0, MAX_QUERY_CHARS);
  if (!term) return empty;

  try {
    const docs = listDocFiles().filter((d) => RETRIEVABLE.has(d.category));
    if (docs.length === 0) return empty;

    const db = create({
      schema: {
        path: "string",
        title: "string",
        category: "string",
        content: "string",
      },
    });

    await insertMultiple(
      db,
      docs.map((d) => ({
        path: d.path,
        title: d.title,
        category: d.category,
        content: `${d.title}\n${d.summary ?? ""}\n${d.content}`,
      })),
    );

    const results = await search(db, {
      term,
      properties: ["title", "content"],
      limit: Math.max(docs.length, 20),
    });

    const exclude = new Set(opts.exclude ?? []);
    const knowledge: string[] = [];
    const templates: string[] = [];
    const kLimit = opts.knowledgeLimit ?? 3;
    const tLimit = opts.templateLimit ?? 2;

    for (const hit of results.hits) {
      const doc = hit.document as unknown as { path: string; category: string };
      if (exclude.has(doc.path)) continue;
      if (doc.category === "knowledge" && knowledge.length < kLimit) {
        knowledge.push(doc.path);
      } else if (doc.category === "template" && templates.length < tLimit) {
        templates.push(doc.path);
      }
      if (knowledge.length >= kLimit && templates.length >= tLimit) break;
    }

    return { knowledge, templates };
  } catch {
    return empty;
  }
}
