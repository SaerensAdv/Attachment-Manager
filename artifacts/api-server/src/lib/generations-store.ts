import {
  db,
  generationsTable,
  type Generation,
  type InsertGeneration,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";

/** Persist a finished generation. Returns the stored row. */
export async function saveGeneration(
  input: InsertGeneration,
): Promise<Generation> {
  const [row] = await db.insert(generationsTable).values(input).returning();
  return row;
}

/** All generations, newest first. */
export async function listGenerations(): Promise<Generation[]> {
  return db
    .select()
    .from(generationsTable)
    .orderBy(desc(generationsTable.createdAt));
}

/** A single generation by id, or null. */
export async function getGeneration(id: number): Promise<Generation | null> {
  const [row] = await db
    .select()
    .from(generationsTable)
    .where(eq(generationsTable.id, id));
  return row ?? null;
}

/**
 * Record the human QA verdict on a generation. The user is the single quality
 * gate; this verdict (+ optional correction note) drives the learning loop.
 */
export async function updateGenerationFeedback(
  id: number,
  verdict: string,
  note: string | null,
): Promise<Generation | null> {
  const [row] = await db
    .update(generationsTable)
    .set({ feedbackVerdict: verdict, feedbackNote: note, feedbackAt: new Date() })
    .where(eq(generationsTable.id, id))
    .returning();
  return row ?? null;
}

/** Delete a generation. Returns true when a row was removed. */
export async function deleteGeneration(id: number): Promise<boolean> {
  const [row] = await db
    .delete(generationsTable)
    .where(eq(generationsTable.id, id))
    .returning();
  return Boolean(row);
}
