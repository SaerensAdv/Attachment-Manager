import { Router, type IRouter } from "express";
import {
  getProposal,
  claimProposalStatus,
  revertProposalToPending,
} from "../lib/proposals-store";
import { applyProposal, verifyProposalApplied } from "../lib/improvements";
import { serializeProposal } from "./generations";

const router: IRouter = Router();

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.post("/proposals/:id/accept", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  // Claim the proposal atomically BEFORE applying side effects, so two
  // concurrent accepts can't both apply the change. The loser of the race
  // gets null and is mapped to 409 (or 404 if it truly doesn't exist).
  const claimed = await claimProposalStatus(id, "accepted");
  if (!claimed) {
    const existing = await getProposal(id);
    if (!existing) {
      res.status(404).json({ error: "Voorstel niet gevonden." });
    } else {
      res.status(409).json({ error: "Dit voorstel is al behandeld." });
    }
    return;
  }
  let changed: boolean;
  try {
    ({ changed } = await applyProposal(claimed));
  } catch (err) {
    // Apply failed: undo the claim so the proposal stays actionable. The revert
    // itself is best-effort — even if it throws, the user must still get the
    // actionable 502 detail rather than an opaque 500.
    try {
      await revertProposalToPending(id);
    } catch {
      // swallow — surfacing the original apply failure matters more here
    }
    res.status(502).json({
      error: "Het toepassen van de verbetering is mislukt.",
      detail: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  // Honest double-check: re-read the target and confirm the rule really landed,
  // so the UI can show "bevestigd in het document" instead of blindly trusting
  // the write. Best-effort — a false here never fails the (already-applied)
  // request, it just downgrades the confirmation copy.
  const { present } = await verifyProposalApplied(claimed);
  res.json({
    proposal: serializeProposal(claimed),
    changed,
    verified: present,
  });
});

router.post("/proposals/:id/reject", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Ongeldige id." });
    return;
  }
  const claimed = await claimProposalStatus(id, "rejected");
  if (!claimed) {
    const existing = await getProposal(id);
    if (!existing) {
      res.status(404).json({ error: "Voorstel niet gevonden." });
    } else {
      res.status(409).json({ error: "Dit voorstel is al behandeld." });
    }
    return;
  }
  res.json(serializeProposal(claimed));
});

export default router;
