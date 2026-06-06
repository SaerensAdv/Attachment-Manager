import { createHash } from "node:crypto";
import { listDocFiles, type DocFile } from "./docs";
import {
  loadStoredEmbeddings,
  upsertEmbeddings,
  deleteEmbeddings,
} from "./semantic-store";

const MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

export interface SemanticHit {
  path: string;
  score: number;
}

/**
 * Lazily-loaded feature-extraction pipeline. Transformers.js and its
 * onnxruntime-node backend are kept external in the esbuild bundle, so this
 * dynamic import resolves from node_modules at runtime. The multilingual model
 * (~120MB) is downloaded once on first use and cached on disk by the library;
 * it runs fully locally afterwards, with no external API or key.
 */
let pipePromise: Promise<unknown> | null = null;
async function getExtractor(): Promise<(texts: string[], opts: unknown) => Promise<{ data: Float32Array; dims: number[] }>> {
  if (!pipePromise) {
    pipePromise = (async () => {
      const tf = (await import("@huggingface/transformers")) as unknown as {
        pipeline?: (task: string, model: string) => Promise<unknown>;
        env?: { allowLocalModels?: boolean };
        default?: {
          pipeline?: (task: string, model: string) => Promise<unknown>;
          env?: { allowLocalModels?: boolean };
        };
      };
      const pipeline = tf.pipeline ?? tf.default?.pipeline;
      const env = tf.env ?? tf.default?.env;
      if (env) env.allowLocalModels = false;
      if (!pipeline) throw new Error("transformers pipeline unavailable");
      return pipeline("feature-extraction", MODEL);
    })().catch((err) => {
      // Allow a later retry (e.g. a transient model download failure).
      pipePromise = null;
      throw err;
    });
  }
  return pipePromise as Promise<
    (texts: string[], opts: unknown) => Promise<{ data: Float32Array; dims: number[] }>
  >;
}

// Per-doc embedding cache, keyed by path and invalidated when the doc content
// hash changes, so runtime edits are reflected automatically.
const vecByPath = new Map<string, number[]>();
const hashByPath = new Map<string, string>();

// Seed the in-memory cache from persisted embeddings exactly once per process.
// Memoized as an in-flight promise so concurrent first queries await the same
// seed instead of each racing to recompute the whole corpus. Best-effort: a
// failed load just means an empty cache and a normal (re)compute.
let seedPromise: Promise<void> | null = null;
async function seedOnce(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      for (const e of await loadStoredEmbeddings(MODEL)) {
        if (e.embedding.length > 0) {
          vecByPath.set(e.path, e.embedding);
          hashByPath.set(e.path, e.contentHash);
        }
      }
    })().catch(() => {});
  }
  return seedPromise;
}

function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

function embedText(d: DocFile): string {
  const body = d.content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${d.title}. ${d.summary ?? ""}. ${body}`.slice(0, 1200);
}

function dot(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

async function embedBatch(
  extractor: (texts: string[], opts: unknown) => Promise<{ data: Float32Array; dims: number[] }>,
  texts: string[],
): Promise<number[][]> {
  const out = await extractor(texts, { pooling: "mean", normalize: true });
  const dim = out.dims[out.dims.length - 1];
  const flat = Array.from(out.data);
  const rows: number[][] = [];
  for (let i = 0; i < texts.length; i++) rows.push(flat.slice(i * dim, (i + 1) * dim));
  return rows;
}

/**
 * Semantic search over all docs using multilingual sentence embeddings. Vectors
 * are normalized, so the dot product equals cosine similarity. Best-effort: any
 * failure (model download, runtime) yields an empty list so the caller can fall
 * back to lexical search.
 */
export async function semanticSearch(
  query: string,
  limit = 30,
  extra: DocFile[] = [],
): Promise<SemanticHit[]> {
  const term = query.trim();
  if (!term) return [];
  try {
    const extractor = await getExtractor();
    const docs = listDocFiles(extra);
    if (docs.length === 0) return [];

    // Cold start: seed the cache from persisted vectors so unchanged docs are
    // not re-embedded. Best-effort — an empty/failed load just means we compute.
    await seedOnce();

    // (Re)embed any new or changed docs in a single batch.
    const stale = docs.filter((d) => hashByPath.get(d.path) !== sha1(d.content));
    if (stale.length > 0) {
      const rows = await embedBatch(extractor, stale.map(embedText));
      stale.forEach((d, i) => {
        vecByPath.set(d.path, rows[i]);
        hashByPath.set(d.path, sha1(d.content));
      });
      // Persist so the next cold start reuses these instead of recomputing.
      void upsertEmbeddings(
        MODEL,
        stale.map((d, i) => ({
          path: d.path,
          contentHash: sha1(d.content),
          embedding: rows[i],
        })),
      );
    }
    // Drop embeddings for docs that no longer exist — in memory and persisted.
    const present = new Set(docs.map((d) => d.path));
    const removed: string[] = [];
    for (const key of [...vecByPath.keys()]) {
      if (!present.has(key)) {
        vecByPath.delete(key);
        hashByPath.delete(key);
        removed.push(key);
      }
    }
    if (removed.length > 0) void deleteEmbeddings(removed);

    const [qvec] = await embedBatch(extractor, [term]);
    return docs
      .map((d) => ({ path: d.path, score: dot(qvec, vecByPath.get(d.path) ?? []) }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, limit));
  } catch {
    return [];
  }
}

/** Kick off model load and doc embedding in the background, ignoring errors. */
export function warmSemanticIndex(): void {
  void semanticSearch("warmup", 1).catch(() => {});
}
