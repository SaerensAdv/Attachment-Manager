import { pool } from "@workspace/db";

/**
 * Persistent store for the doc-graph sentence embeddings, so a cold start reuses
 * vectors computed in a prior run instead of re-embedding the whole corpus on
 * every boot. Backed by pgvector in the existing Postgres.
 *
 * This cache is an implementation detail of `semantic.ts` (its sole consumer),
 * not domain data, so it owns its own table via an idempotent self-bootstrap
 * (`CREATE EXTENSION/TABLE IF NOT EXISTS`) rather than the drizzle-kit push
 * flow — that keeps the pgvector extension ordering out of the shared migration
 * path. Every operation is best-effort: any DB failure degrades silently to the
 * in-memory path in `semantic.ts`, never throwing into the search hot path.
 */

const DIM = 384;

export interface StoredEmbedding {
  path: string;
  contentHash: string;
  embedding: number[];
}

export interface EmbeddingInput {
  path: string;
  contentHash: string;
  embedding: number[];
}

/** Serialize a vector to the pgvector text literal, e.g. `[0.1,-0.2,0.3]`. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

/** Parse a pgvector value (text `[..]` literal or array) back to numbers. */
export function parseVector(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(Number) : [];
    } catch {
      return [];
    }
  }
  return [];
}

let ready: Promise<boolean> | null = null;

/** Ensure the pgvector extension + cache table exist. Memoized; retries on failure. */
async function ensureTable(): Promise<boolean> {
  if (!ready) {
    ready = (async () => {
      await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
      await pool.query(
        `CREATE TABLE IF NOT EXISTS doc_embeddings (
           path text PRIMARY KEY,
           content_hash text NOT NULL,
           model text NOT NULL,
           dim integer NOT NULL,
           embedding vector(${DIM}) NOT NULL,
           updated_at timestamptz NOT NULL DEFAULT now()
         )`,
      );
      return true;
    })().catch((err) => {
      // Allow a later retry (e.g. the DB was briefly unreachable at boot).
      ready = null;
      console.error(
        "doc_embeddings init failed (semantic search falls back to in-memory):",
        err instanceof Error ? err.message : String(err),
      );
      return false;
    });
  }
  return ready;
}

/** Load all persisted embeddings for a model. Returns [] on any failure. */
export async function loadStoredEmbeddings(
  model: string,
): Promise<StoredEmbedding[]> {
  if (!(await ensureTable())) return [];
  try {
    const res = await pool.query(
      "SELECT path, content_hash, embedding FROM doc_embeddings WHERE model = $1 AND dim = $2",
      [model, DIM],
    );
    return res.rows.map((r: Record<string, unknown>) => ({
      path: String(r.path),
      contentHash: String(r.content_hash),
      embedding: parseVector(r.embedding),
    }));
  } catch (err) {
    console.error(
      "Kon embeddings niet laden uit doc_embeddings:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}

/** Upsert freshly computed embeddings. Best-effort; never throws. */
export async function upsertEmbeddings(
  model: string,
  items: EmbeddingInput[],
): Promise<void> {
  if (items.length === 0) return;
  if (!(await ensureTable())) return;
  try {
    for (const it of items) {
      await pool.query(
        `INSERT INTO doc_embeddings (path, content_hash, model, dim, embedding, updated_at)
         VALUES ($1, $2, $3, $4, $5::vector, now())
         ON CONFLICT (path) DO UPDATE SET
           content_hash = EXCLUDED.content_hash,
           model = EXCLUDED.model,
           dim = EXCLUDED.dim,
           embedding = EXCLUDED.embedding,
           updated_at = now()`,
        [it.path, it.contentHash, model, DIM, toVectorLiteral(it.embedding)],
      );
    }
  } catch (err) {
    console.error(
      "Kon embeddings niet wegschrijven naar doc_embeddings:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Drop persisted embeddings for docs that no longer exist. Best-effort. */
export async function deleteEmbeddings(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  if (!(await ensureTable())) return;
  try {
    await pool.query("DELETE FROM doc_embeddings WHERE path = ANY($1)", [paths]);
  } catch (err) {
    console.error(
      "Kon verouderde embeddings niet verwijderen uit doc_embeddings:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
