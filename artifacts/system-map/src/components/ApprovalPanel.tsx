import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useApproveGeneration,
  useRequestGenerationChanges,
  getGetGenerationsQueryKey,
  getGetGenerationQueryKey,
  getGetGenerationStepsQueryKey,
} from "@workspace/api-client-react";
import {
  Loader2,
  Send,
  ThumbsDown,
  MailCheck,
  AlertTriangle,
} from "lucide-react";

/**
 * The human approval checkpoint for a client-facing report. A run drafts the
 * monthly report + cover e-mail but HOLDS the send; a human releases it (approve)
 * or holds it back with notes (request changes). Reused by the live run panel
 * and the archive, so a held report from any trigger — interactive, scheduled or
 * autonomous — can be reviewed and resolved here.
 */
export default function ApprovalPanel({
  generationId,
  status,
  approvalNote,
  recipient,
  reviewerVerdict,
  onRequestedChanges,
  onResolved,
}: {
  generationId: number;
  /** Current approval state: "pending" | "approved" | "changes_requested". */
  status: string | null;
  /** The reviewer note recorded when changes were requested (if any). */
  approvalNote?: string | null;
  /** The client recipient the report goes to (shown for confidence). */
  recipient?: string | null;
  /** Internal reviewer verdict surfaced live (archive shows it in the body). */
  reviewerVerdict?: string | null;
  /**
   * Called after changes are requested, with the note, so the caller can
   * regenerate with that context (only wired in the live run flow).
   */
  onRequestedChanges?: (note: string) => void;
  /** Called after any resolution so the parent can refresh its view. */
  onResolved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const approveMut = useApproveGeneration();
  const changesMut = useRequestGenerationChanges();
  const busy = approveMut.isPending || changesMut.isPending;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getGetGenerationsQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getGetGenerationQueryKey(generationId),
    });
    queryClient.invalidateQueries({
      queryKey: getGetGenerationStepsQueryKey(generationId),
    });
    onResolved?.();
  };

  const handleApprove = async () => {
    setError(null);
    try {
      await approveMut.mutateAsync({ id: generationId });
      refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Goedkeuren mislukt. Probeer het opnieuw.",
      );
    }
  };

  const handleRequestChanges = async () => {
    setError(null);
    const trimmed = note.trim();
    try {
      await changesMut.mutateAsync({
        id: generationId,
        data: { note: trimmed || null },
      });
      refresh();
      onRequestedChanges?.(trimmed);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Aanvraag mislukt. Probeer het opnieuw.",
      );
    }
  };

  if (status === "approved") {
    return (
      <div className="border-2 border-foreground bg-background/40 px-5 py-4 flex items-center gap-3">
        <MailCheck className="w-5 h-5 text-accent shrink-0" />
        <div>
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
            Goedkeuring
          </p>
          <p className="font-['Inter'] text-sm text-foreground">
            Goedgekeurd en verzonden naar de klant.
          </p>
        </div>
      </div>
    );
  }

  if (status === "changes_requested") {
    return (
      <div className="border-2 border-foreground bg-background/40 px-5 py-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <div>
            <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
              Goedkeuring
            </p>
            <p className="font-['Inter'] text-sm text-foreground">
              Wijzigingen gevraagd — rapport is niet verzonden.
            </p>
          </div>
        </div>
        {approvalNote && (
          <p className="mt-3 font-['Inter'] text-sm text-muted-foreground border-l-2 border-foreground/30 pl-3 whitespace-pre-wrap">
            {approvalNote}
          </p>
        )}
      </div>
    );
  }

  // Pending: the report is drafted and held — a human decides before it goes out.
  return (
    <div className="border-2 border-foreground bg-accent/5 px-5 py-5">
      <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
        Goedkeuring vereist
      </p>
      <h3 className="font-['Playfair_Display'] font-black text-xl uppercase tracking-tight mb-2">
        Rapport klaar — wacht op jouw akkoord
      </h3>
      <p className="font-['Inter'] text-sm text-muted-foreground mb-4 max-w-2xl">
        Dit maandrapport is opgesteld maar nog niet verzonden. Keur het goed om
        het{recipient ? ` naar ${recipient}` : " naar de klant"} te sturen, of
        vraag wijzigingen om het tegen te houden en opnieuw te genereren.
      </p>

      {reviewerVerdict && (
        <div className="mb-4 border-l-2 border-accent pl-3">
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
            Oordeel interne reviewer
          </p>
          <p className="font-['Inter'] text-sm text-foreground whitespace-pre-wrap">
            {reviewerVerdict}
          </p>
        </div>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        data-testid="input-approval-note"
        rows={3}
        placeholder="Optioneel: wat moet er anders? Deze nota wordt meegegeven aan een nieuwe versie."
        className="w-full border-2 border-foreground bg-card px-4 py-3 text-sm font-['Inter'] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 focus:border-accent resize-y mb-3"
      />

      {error && (
        <p className="text-sm text-destructive font-['Inter'] mb-3">{error}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleApprove}
          disabled={busy}
          data-testid="button-approve-report"
          className="py-2.5 px-4 bg-foreground text-background border-2 border-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 shadow-[4px_4px_0px_hsl(var(--accent))] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-40 disabled:pointer-events-none"
        >
          {approveMut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          Goedkeuren & versturen
        </button>
        <button
          type="button"
          onClick={handleRequestChanges}
          disabled={busy}
          data-testid="button-request-changes"
          className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-destructive hover:border-destructive hover:text-destructive-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          {changesMut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ThumbsDown className="w-4 h-4" />
          )}
          Wijzigingen vragen
        </button>
      </div>
    </div>
  );
}
