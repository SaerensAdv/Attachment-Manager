import { create, insertMultiple, search } from "@orama/orama";
import { listDocFiles } from "./docs";
import { semanticSearch } from "./semantic";

const RETRIEVABLE = new Set(["knowledge", "template"]);
const MAX_QUERY_CHARS = 1500;

// Reciprocal Rank Fusion constant. The standard value (60) dampens the weight of
// any single ranker so one strong list cannot fully dominate the other.
const RRF_K = 60;

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
 * Reciprocal Rank Fusion: merge several ranked lists (each ordered best→worst)
 * into a single ranking. An item's fused score is the sum of `1 / (k + rank)`
 * across the lists it appears in (rank is 1-based), so items ranked highly by
 * multiple rankers float to the top. Pure and deterministic — unit tested.
 */
export function reciprocalRankFusion(lists: string[][], k = RRF_K): string[] {
  const score = new Map<string, number>();
  for (const list of lists) {
    list.forEach((path, idx) => {
      score.set(path, (score.get(path) ?? 0) + 1 / (k + idx + 1));
    });
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([path]) => path);
}

/**
 * Lexical (BM25) ranking over the English `knowledge/` and `templates/` docs
 * using Orama. The index is rebuilt per call from the live filesystem docs
 * (cheap for the small corpus) so it never goes stale when docs change at
 * runtime. Returns the matching paths ordered best→worst.
 */
async function rankLexical(term: string): Promise<string[]> {
  const docs = listDocFiles().filter((d) => RETRIEVABLE.has(d.category));
  if (docs.length === 0) return [];

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

  return results.hits.map(
    (hit) => (hit.document as unknown as { path: string }).path,
  );
}

/**
 * Semantic ranking using the multilingual embedding model, restricted to the
 * retrievable categories. Best-effort: `semanticSearch` returns an empty list on
 * any failure (model download, runtime), which the fusion below tolerates.
 */
async function rankSemantic(
  term: string,
  category: Map<string, string>,
): Promise<string[]> {
  const hits = await semanticSearch(term, 50);
  return hits
    .filter((h) => RETRIEVABLE.has(category.get(h.path) ?? ""))
    .map((h) => h.path);
}

/**
 * Hybrid retrieval: fuse the lexical (BM25) and semantic (embedding) rankings of
 * the `knowledge/` and `templates/` docs via Reciprocal Rank Fusion, then return
 * the top knowledge + template paths for the query.
 *
 * The two rankers are complementary: BM25 nails exact keyword/terminology
 * matches, embeddings catch paraphrases and cross-lingual matches (the corpus is
 * English, queries arrive in Dutch). Fusion is robust to either ranker being
 * weak for a given query.
 *
 * Best-effort and additive by contract: if semantic search yields nothing
 * (e.g. the model hasn't downloaded yet), fusion degrades to lexical-only with
 * identical ordering, so behaviour never regresses below pure BM25. Any failure
 * returns an empty result and the caller keeps its mandatory base doc set.
 */
export async function selectRelevantDocs(
  query: string,
  opts: SelectOptions = {},
): Promise<RetrievalResult> {
  const empty: RetrievalResult = { knowledge: [], templates: [] };
  const term = query.trim().slice(0, MAX_QUERY_CHARS);
  if (!term) return empty;

  try {
    const category = new Map(listDocFiles().map((d) => [d.path, d.category]));
    if (category.size === 0) return empty;

    const [lexical, semantic] = await Promise.all([
      rankLexical(term).catch(() => [] as string[]),
      rankSemantic(term, category).catch(() => [] as string[]),
    ]);

    const lists = [lexical, semantic].filter((l) => l.length > 0);
    if (lists.length === 0) return empty;

    const fused = reciprocalRankFusion(lists);

    const exclude = new Set(opts.exclude ?? []);
    const knowledge: string[] = [];
    const templates: string[] = [];
    const kLimit = opts.knowledgeLimit ?? 3;
    const tLimit = opts.templateLimit ?? 2;

    for (const path of fused) {
      if (exclude.has(path)) continue;
      const cat = category.get(path);
      if (cat === "knowledge" && knowledge.length < kLimit) {
        knowledge.push(path);
      } else if (cat === "template" && templates.length < tLimit) {
        templates.push(path);
      }
      if (knowledge.length >= kLimit && templates.length >= tLimit) break;
    }

    return { knowledge, templates };
  } catch {
    return empty;
  }
}
