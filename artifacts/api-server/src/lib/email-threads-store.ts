import {
  db,
  emailThreadsTable,
  generationsTable,
  type EmailThread,
  type Generation,
} from "@workspace/db";
import { and, desc, eq, isNull, ne, or } from "drizzle-orm";

/** A single conversation by its Gmail threadId, or null. */
export async function getThreadByGmailId(
  gmailThreadId: string,
): Promise<EmailThread | null> {
  const [row] = await db
    .select()
    .from(emailThreadsTable)
    .where(eq(emailThreadsTable.gmailThreadId, gmailThreadId));
  return row ?? null;
}

/** A single conversation by its row id, or null. */
export async function getThreadById(id: number): Promise<EmailThread | null> {
  const [row] = await db
    .select()
    .from(emailThreadsTable)
    .where(eq(emailThreadsTable.id, id));
  return row ?? null;
}

/** All open conversations (the inbound poller iterates these), newest first. */
export async function listOpenThreads(): Promise<EmailThread[]> {
  return db
    .select()
    .from(emailThreadsTable)
    .where(eq(emailThreadsTable.status, "open"))
    .orderBy(desc(emailThreadsTable.updatedAt));
}

/**
 * Record (or refresh) a conversation when we SEND into it. Creates the row on a
 * first send (a monthly report opening a thread) and, on a later send (a reply),
 * advances the latest Message-ID so the next reply threads correctly. Owner +
 * client are set once at creation and left stable on update.
 */
export async function recordOutboundThread(input: {
  gmailThreadId: string;
  clientPath: string;
  headAgentPath: string;
  subject: string;
  lastMessageIdHeader: string | null;
}): Promise<EmailThread> {
  const now = new Date();
  const [row] = await db
    .insert(emailThreadsTable)
    .values({
      gmailThreadId: input.gmailThreadId,
      clientPath: input.clientPath,
      headAgentPath: input.headAgentPath,
      subject: input.subject,
      lastMessageIdHeader: input.lastMessageIdHeader,
      status: "open",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: emailThreadsTable.gmailThreadId,
      set: {
        subject: input.subject,
        lastMessageIdHeader: input.lastMessageIdHeader,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

/**
 * Claim an inbound message for processing by advancing the thread's
 * `lastProcessedMessageId`, but only when it isn't already that id. This is the
 * double-fire guard: if a concurrent poller tick already claimed the same
 * message, the conditional UPDATE matches no row and returns false, so the team
 * drafts a reply exactly once per inbound message.
 */
export async function claimInbound(
  threadId: number,
  messageId: string,
): Promise<boolean> {
  const [row] = await db
    .update(emailThreadsTable)
    .set({ lastProcessedMessageId: messageId, updatedAt: new Date() })
    .where(
      and(
        eq(emailThreadsTable.id, threadId),
        or(
          isNull(emailThreadsTable.lastProcessedMessageId),
          ne(emailThreadsTable.lastProcessedMessageId, messageId),
        ),
      ),
    )
    .returning();
  return Boolean(row);
}

/** Set a conversation's status ("open" | "closed"). */
export async function setThreadStatus(
  id: number,
  status: string,
): Promise<void> {
  await db
    .update(emailThreadsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(emailThreadsTable.id, id));
}

/** Link a generation (run) to the conversation it belongs to. */
export async function linkGenerationThread(
  generationId: number,
  emailThreadId: number,
): Promise<Generation | null> {
  const [row] = await db
    .update(generationsTable)
    .set({ emailThreadId })
    .where(eq(generationsTable.id, generationId))
    .returning();
  return row ?? null;
}
