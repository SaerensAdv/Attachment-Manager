import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Point-in-time snapshots of the normalized Workspace Graph (Fase 3.5). Each row
 * is ONE fully-composed graph payload (nodes + edges) plus the metadata the
 * routes and the sync-status UI need. Exactly one row is `active` at a time; a
 * sync builds a new `building` row and, only once it is complete, atomically
 * flips it to `active` and the previous active to `superseded`. A failed sync
 * leaves the current active untouched (partial data never reaches the UI).
 *
 * Defined in the Drizzle schema so the types are first-class, but CREATED by an
 * idempotent `CREATE TABLE IF NOT EXISTS` self-bootstrap in the snapshot store —
 * this project never runs drizzle-kit push (it would drop the unmanaged
 * pgvector/crawl/alerts tables it doesn't know about).
 */
export const graphSnapshotsTable = pgTable("graph_snapshots", {
  id: serial("id").primaryKey(),
  /** building -> active | superseded | failed. */
  status: text("status").notNull().default("building"),
  /** The full normalized graph `{ nodes, edges }`. Content-free by construction. */
  payload: jsonb("payload"),
  /** Denormalized sizes so the UI/status can read counts without parsing payload. */
  nodeCount: integer("node_count").notNull().default(0),
  edgeCount: integer("edge_count").notNull().default(0),
  /**
   * Stable hash of the payload. When a fresh build hashes identical to the
   * current active snapshot, no new active row is created (the sync is a no-op
   * flip that just refreshes `last_synced_at`).
   */
  contentHash: text("content_hash"),
  /** Short, non-sensitive failure reason for a `failed` row (never a secret). */
  error: text("error"),
  /** The newest `updatedAt` observed across all sources — the data's freshness. */
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  /** When this snapshot last completed a successful sync (incl. no-op flips). */
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type GraphSnapshot = typeof graphSnapshotsTable.$inferSelect;
export type InsertGraphSnapshot = typeof graphSnapshotsTable.$inferInsert;
