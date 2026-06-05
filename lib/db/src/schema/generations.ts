import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

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
  // How this run was started. "user" = a person triggered it from the command
  // bar; "autonomous"/"scheduled" are reserved for future background runs so an
  // unattended run is always recognisable and reviewable after the fact.
  triggerSource: text("trigger_source").notNull().default("user"),
  // Outcome of the run: "completed" (full team finished), "partial" (stopped or
  // failed part-way but some work was saved), or "failed".
  status: text("status").notNull().default("completed"),
  // Aggregate wall-clock time and token usage across all steps, when measured.
  durationMs: integer("duration_ms"),
  totalTokens: integer("total_tokens"),
  // Human quality-control verdict on this generation. The user is the single QA
  // gate; their judgment feeds the learning loop (improvement proposals).
  // "approved" | "rejected" | null (not yet reviewed).
  feedbackVerdict: text("feedback_verdict"),
  feedbackNote: text("feedback_note"),
  feedbackAt: timestamp("feedback_at"),
});

export type Generation = typeof generationsTable.$inferSelect;
export type InsertGeneration = typeof generationsTable.$inferInsert;

/**
 * One step within a generation — a single agent invocation (or the closing
 * deliverable). This is the audit trail: it records, per step, who ran, in what
 * order and role, how it ended, how long it took and how many tokens it used.
 * Per-agent KPIs are aggregated from these rows, and the ordered list of steps
 * is exactly "what happened" during a run — essential once agents start running
 * autonomously and the user reviews afterward what took place.
 *
 * Rows are removed automatically when their parent generation is deleted
 * (ON DELETE CASCADE).
 */
export const generationStepsTable = pgTable("generation_steps", {
  id: serial("id").primaryKey(),
  generationId: integer("generation_id")
    .notNull()
    .references(() => generationsTable.id, { onDelete: "cascade" }),
  // For an agent step this is the agent's doc path (e.g. agents/copywriter.md);
  // for the closing deliverable step it is the workflow path. `agentTitle` is
  // the human-readable label shown in the timeline.
  agentPath: text("agent_path").notNull(),
  agentTitle: text("agent_title").notNull(),
  stepOrder: integer("step_order").notNull(),
  // "lead" | "member" | "deliverable".
  role: text("role").notNull(),
  // "completed" | "truncated" | "aborted" | "failed".
  status: text("status").notNull(),
  durationMs: integer("duration_ms"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  charCount: integer("char_count"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type GenerationStep = typeof generationStepsTable.$inferSelect;
export type InsertGenerationStep = typeof generationStepsTable.$inferInsert;
