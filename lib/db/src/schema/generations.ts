import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Persisted AI team generations — the archive/history of work the "brain"
 * produced. Each row is one completed run of a (possibly multi-agent) team for
 * a client + workflow + request. `teamPaths` / `teamTitles` store JSON arrays so
 * the full line-up that produced the output is preserved. `finalMarkdown` is the
 * combined result exactly as assembled server-side, so it can be re-read,
 * re-used, or exported later without re-running the model.
 */
export const generationsTable = pgTable("generations", {
  id: serial("id").primaryKey(),
  clientPath: text("client_path").notNull(),
  clientName: text("client_name").notNull(),
  workflowPath: text("workflow_path").notNull(),
  workflowTitle: text("workflow_title").notNull(),
  leadAgentPath: text("lead_agent_path").notNull(),
  leadAgentTitle: text("lead_agent_title").notNull(),
  teamPaths: text("team_paths").notNull(),
  teamTitles: text("team_titles").notNull(),
  requestText: text("request_text").notNull(),
  finalMarkdown: text("final_markdown").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Generation = typeof generationsTable.$inferSelect;
export type InsertGeneration = typeof generationsTable.$inferInsert;
