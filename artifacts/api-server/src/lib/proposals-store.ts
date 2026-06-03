import {
  db,
  improvementProposalsTable,
  type ImprovementProposal,
  type InsertImprovementProposal,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

/** Persist a batch of generated improvement proposals. */
export async function createProposals(
  inputs: InsertImprovementProposal[],
): Promise<ImprovementProposal[]> {
  if (inputs.length === 0) return [];
  return db.insert(improvementProposalsTable).values(inputs).returning();
}

/** All proposals for one generation, newest first. */
export async function listProposalsForGeneration(
  generationId: number,
): Promise<ImprovementProposal[]> {
  return db
    .select()
    .from(improvementProposalsTable)
    .where(eq(improvementProposalsTable.generationId, generationId))
    .orderBy(desc(improvementProposalsTable.createdAt));
}

/** A single proposal by id, or null. */
export async function getProposal(
  id: number,
): Promise<ImprovementProposal | null> {
  const [row] = await db
    .select()
    .from(improvementProposalsTable)
    .where(eq(improvementProposalsTable.id, id));
  return row ?? null;
}

/**
 * Atomically claim a still-pending proposal and stamp the decision time.
 * The `status = 'pending'` guard makes the transition a compare-and-set, so
 * two concurrent accept/reject calls cannot both win: the loser updates zero
 * rows and gets `null` back (the caller maps that to a 409). This is what keeps
 * the side effect (applyProposal) from running twice.
 */
export async function claimProposalStatus(
  id: number,
  status: "accepted" | "rejected",
): Promise<ImprovementProposal | null> {
  const [row] = await db
    .update(improvementProposalsTable)
    .set({ status, decidedAt: new Date() })
    .where(
      and(
        eq(improvementProposalsTable.id, id),
        eq(improvementProposalsTable.status, "pending"),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Roll an accepted proposal back to pending when the apply side effect failed
 * after the claim. Guarded on `status = 'accepted'` so it only undoes a claim
 * this request actually made and never clobbers a rejection.
 */
export async function revertProposalToPending(id: number): Promise<void> {
  await db
    .update(improvementProposalsTable)
    .set({ status: "pending", decidedAt: null })
    .where(
      and(
        eq(improvementProposalsTable.id, id),
        eq(improvementProposalsTable.status, "accepted"),
      ),
    );
}
