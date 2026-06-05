import {
  db,
  schedulesTable,
  type Schedule,
  type InsertSchedule,
} from "@workspace/db";
import { and, asc, eq, isNotNull, lte } from "drizzle-orm";

/** All schedules, newest first. */
export async function listSchedules(): Promise<Schedule[]> {
  return db.select().from(schedulesTable).orderBy(asc(schedulesTable.id));
}

export async function getSchedule(id: number): Promise<Schedule | undefined> {
  const [row] = await db
    .select()
    .from(schedulesTable)
    .where(eq(schedulesTable.id, id));
  return row;
}

export async function createSchedule(input: InsertSchedule): Promise<Schedule> {
  const [row] = await db.insert(schedulesTable).values(input).returning();
  return row;
}

export async function updateSchedule(
  id: number,
  patch: Partial<InsertSchedule>,
): Promise<Schedule | undefined> {
  const [row] = await db
    .update(schedulesTable)
    .set(patch)
    .where(eq(schedulesTable.id, id))
    .returning();
  return row;
}

export async function deleteSchedule(id: number): Promise<boolean> {
  const rows = await db
    .delete(schedulesTable)
    .where(eq(schedulesTable.id, id))
    .returning({ id: schedulesTable.id });
  return rows.length > 0;
}

/** Enabled schedules whose next run is due (nextRunAt <= now). */
export async function listDue(now: Date): Promise<Schedule[]> {
  return db
    .select()
    .from(schedulesTable)
    .where(
      and(
        eq(schedulesTable.enabled, true),
        isNotNull(schedulesTable.nextRunAt),
        lte(schedulesTable.nextRunAt, now),
      ),
    );
}

/**
 * Atomically claim a due schedule by advancing its nextRunAt — but only if it
 * still holds the value we observed. This compare-and-set is the lock that stops
 * a single fire from being processed twice (e.g. overlapping ticks). Returns
 * true when this caller won the claim.
 */
export async function claim(
  id: number,
  expectedNextRunAt: Date,
  newNextRunAt: Date | null,
): Promise<boolean> {
  const rows = await db
    .update(schedulesTable)
    .set({ nextRunAt: newNextRunAt })
    .where(
      and(
        eq(schedulesTable.id, id),
        eq(schedulesTable.enabled, true),
        eq(schedulesTable.nextRunAt, expectedNextRunAt),
      ),
    )
    .returning({ id: schedulesTable.id });
  return rows.length > 0;
}

/** Record the outcome of a fire. */
export async function markRun(
  id: number,
  outcome: { lastGenerationId: number | null; lastStatus: string },
): Promise<void> {
  await db
    .update(schedulesTable)
    .set({
      lastRunAt: new Date(),
      lastGenerationId: outcome.lastGenerationId,
      lastStatus: outcome.lastStatus,
    })
    .where(eq(schedulesTable.id, id));
}
