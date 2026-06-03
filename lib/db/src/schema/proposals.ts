import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { generationsTable } from "./generations";

/**
 * Improvement proposals are the "learning" half of the loop: when the user
 * reviews a generation and leaves a verdict/correction, the system proposes
 * concrete, durable documentation changes. Each proposal targets one doc (an
 * agency `knowledge/` standard or a client profile) and is applied only after
 * the user accepts it — non-destructively, by appending the proposed text.
 *
 * `targetType` is "knowledge" (a file under knowledge/) or "client" (a DB
 * client, applied to its restrictions field). `status` is pending until the
 * user accepts or rejects it.
 */
export const improvementProposalsTable = pgTable("improvement_proposals", {
  id: serial("id").primaryKey(),
  generationId: integer("generation_id")
    .notNull()
    .references(() => generationsTable.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull(),
  targetPath: text("target_path").notNull(),
  targetLabel: text("target_label").notNull(),
  rationale: text("rationale").notNull(),
  proposedText: text("proposed_text").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  decidedAt: timestamp("decided_at"),
});

export type ImprovementProposal =
  typeof improvementProposalsTable.$inferSelect;
export type InsertImprovementProposal =
  typeof improvementProposalsTable.$inferInsert;
