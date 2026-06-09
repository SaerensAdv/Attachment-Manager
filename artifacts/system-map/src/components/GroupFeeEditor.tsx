import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateClientGroup,
  getGetClientGroupsQueryKey,
  getGetClientsRevenueQueryKey,
  type ClientGroupSummary,
} from "@workspace/api-client-react";
import { Euro, Check, Loader2 } from "lucide-react";

/**
 * Inline editor for a klantgroep's (kapstok) monthly fee, shown in the register
 * overview panel. Some relationships are billed at group level instead of per
 * fiche (e.g. LCS), so the group carries its own fee that feeds the revenue
 * dashboard. Saving sends the full group body (name + notes + fee) since the API
 * PUT replaces the row, then refreshes the groups + revenue queries.
 */
export default function GroupFeeEditor({
  group,
}: {
  group: ClientGroupSummary;
}) {
  const queryClient = useQueryClient();
  const updateMut = useUpdateClientGroup();
  const [draft, setDraft] = useState<string>(
    group.monthlyFee == null ? "" : String(group.monthlyFee),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const current = group.monthlyFee == null ? "" : String(group.monthlyFee);
  const dirty = draft.trim() !== current;

  async function save() {
    if (!dirty || updateMut.isPending) return;
    setError(null);
    setSaved(false);
    const trimmed = draft.trim();
    try {
      await updateMut.mutateAsync({
        id: group.id,
        data: {
          name: group.name,
          notes: group.notes ?? null,
          monthlyFee: trimmed === "" ? null : Number(trimmed),
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getGetClientGroupsQueryKey(),
      });
      await queryClient.invalidateQueries({
        queryKey: getGetClientsRevenueQueryKey(),
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fee opslaan mislukt.",
      );
    }
  }

  return (
    <div className="mb-3 border border-foreground/20 bg-background/50 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Euro className="w-3.5 h-3.5 text-accent" />
        <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-accent">
          Maand-fee (kapstok)
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center border border-foreground/40 bg-background flex-1 min-w-0">
          <span className="px-2 font-['Space_Mono'] text-sm text-muted-foreground">
            €
          </span>
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            placeholder="nog niet ingevuld"
            data-testid={`input-group-fee-${group.id}`}
            className="w-full bg-transparent py-1.5 pr-2 font-['Space_Mono'] text-sm outline-none"
          />
        </div>
        <button
          onClick={save}
          disabled={!dirty || updateMut.isPending}
          data-testid={`button-save-group-fee-${group.id}`}
          className="shrink-0 border border-foreground bg-foreground text-background px-3 py-1.5 font-['Space_Mono'] text-[10px] uppercase tracking-widest hover:bg-accent hover:border-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {updateMut.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : saved ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            "Opslaan"
          )}
        </button>
      </div>
      {error ? (
        <p className="mt-2 font-['Inter'] text-xs text-destructive">{error}</p>
      ) : (
        <p className="mt-2 font-['Inter'] text-[11px] text-muted-foreground leading-snug">
          Vul dit in als je deze groep als geheel factureert (bv. LCS). Laat leeg
          als je per fiche factureert.
        </p>
      )}
    </div>
  );
}
