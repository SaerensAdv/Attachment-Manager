import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * One row per two-way client e-mail conversation. A sent monthly report OPENS a
 * thread; the client's replies arrive on the same Gmail conversation, and the
 * team's approved replies CONTINUE it. The Gmail threadId is the stable key, so
 * routing an inbound message back to the right Head never depends on the (often
 * rewritten) From address.
 *
 * `lastProcessedMessageId` is the inbound poller's claim marker — the Gmail
 * message id of the last client message we already drafted a reply for — so the
 * poller never drafts twice for the same message. `lastMessageIdHeader` is the
 * RFC 822 Message-ID of the most recent message in the thread, used to set
 * In-Reply-To / References on our next reply so it threads correctly.
 */
export const emailThreadsTable = pgTable("email_threads", {
  id: serial("id").primaryKey(),
  gmailThreadId: text("gmail_thread_id").notNull().unique(),
  clientPath: text("client_path").notNull(),
  headAgentPath: text("head_agent_path").notNull(),
  subject: text("subject").notNull().default(""),
  lastProcessedMessageId: text("last_processed_message_id"),
  lastMessageIdHeader: text("last_message_id_header"),
  // "open" = accepting inbound replies; "closed" = ignore further messages.
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type EmailThread = typeof emailThreadsTable.$inferSelect;
export type InsertEmailThread = typeof emailThreadsTable.$inferInsert;
