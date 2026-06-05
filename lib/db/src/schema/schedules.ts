import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * In-app schedules for autonomous, unattended generation runs. The api-server
 * scheduler ticks periodically, finds schedules whose `nextRunAt` is due, and
 * runs the generation engine with triggerSource="scheduled" — so the result is
 * archived and counted in KPIs exactly like an interactive run, with no external
 * service (n8n / cron host) required.
 *
 * The agent/client/workflow are stored explicitly (not re-routed each time) so
 * an unattended run is fully predictable: the same line-up runs every time until
 * the user edits the schedule. `cronExpr` + `timezone` define when it fires;
 * timezone defaults to Europe/Brussels (the agency's locale).
 */
export const schedulesTable = pgTable("schedules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cronExpr: text("cron_expr").notNull(),
  timezone: text("timezone").notNull().default("Europe/Brussels"),
  agentPath: text("agent_path").notNull(),
  agentTitle: text("agent_title").notNull(),
  additionalAgentPaths: text("additional_agent_paths").notNull().default("[]"),
  clientPath: text("client_path").notNull(),
  clientName: text("client_name").notNull(),
  workflowPath: text("workflow_path").notNull(),
  workflowTitle: text("workflow_title").notNull(),
  request: text("request").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  // When the schedule should next fire (UTC). Recomputed from cronExpr after
  // each run and whenever the schedule is created/edited/re-enabled.
  nextRunAt: timestamp("next_run_at"),
  lastRunAt: timestamp("last_run_at"),
  // Bookkeeping of the most recent fire so the UI can show outcome at a glance.
  lastGenerationId: integer("last_generation_id"),
  lastStatus: text("last_status"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Schedule = typeof schedulesTable.$inferSelect;
export type InsertSchedule = typeof schedulesTable.$inferInsert;
