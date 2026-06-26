import { Layers, Euro, Loader2, Plus } from "lucide-react";
import { INPUT_CLASS } from "@/lib/clients-form";
import type { ClientGroupSummary } from "@workspace/api-client-react";
import type { ClientEditorApi } from "@/hooks/useClientEditor";

/** Klantgroep ("kapstok") selector + maandelijkse fee for the open dossier. */
export default function GroupFeeFields({
  editor,
  groups,
}: {
  editor: ClientEditorApi;
  groups: ClientGroupSummary[];
}) {
  const {
    groupId,
    setGroupId,
    newGroupName,
    setNewGroupName,
    handleCreateGroup,
    creatingGroup,
    monthlyFee,
    setMonthlyFee,
  } = editor;
  return (
    <>
                  {/* Klantgroep (kapstok) — overkoepelend dossier */}
                  <div className="flex flex-col gap-2 border border-foreground/30 bg-foreground/5 p-4">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-accent" />
                      <label
                        htmlFor="client-group-select"
                        className="font-['Space_Mono'] text-[10px] uppercase tracking-widest"
                      >
                        Klantgroep (kapstok)
                      </label>
                    </div>
                    <p className="font-['Inter'] text-xs text-muted-foreground">
                      Bundel meerdere website-fiches onder één overkoepelend
                      dossier. Elke fiche houdt haar eigen gegevens.
                    </p>
                    <select
                      id="client-group-select"
                      data-testid="select-client-group"
                      value={groupId ?? ""}
                      onChange={(e) =>
                        setGroupId(
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                      className={`${INPUT_CLASS} w-full`}
                    >
                      <option value="">Zonder groep</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="text"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleCreateGroup();
                          }
                        }}
                        placeholder="Nieuwe klantgroep..."
                        data-testid="input-new-group"
                        className={`${INPUT_CLASS} flex-1`}
                      />
                      <button
                        type="button"
                        onClick={handleCreateGroup}
                        disabled={!newGroupName.trim() || creatingGroup}
                        data-testid="button-create-group"
                        className="py-2 px-3 border border-foreground font-['Space_Mono'] text-[10px] uppercase tracking-widest flex items-center gap-1.5 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none shrink-0"
                      >
                        {creatingGroup ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        Maak
                      </button>
                    </div>
                  </div>

                  {/* Maandelijkse fee — voedt het omzet-overzicht op het dashboard */}
                  <div className="flex flex-col gap-2 border border-foreground/30 bg-foreground/5 p-4">
                    <div className="flex items-center gap-2">
                      <Euro className="w-4 h-4 text-accent" />
                      <label
                        htmlFor="client-monthly-fee"
                        className="font-['Space_Mono'] text-[10px] uppercase tracking-widest"
                      >
                        Maandelijkse fee
                      </label>
                    </div>
                    <p className="font-['Inter'] text-xs text-muted-foreground">
                      Brutobedrag per maand dat deze klant oplevert. Voedt het
                      omzet-overzicht op het dashboard.
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="font-['Playfair_Display'] font-black text-lg text-muted-foreground">
                        €
                      </span>
                      <input
                        id="client-monthly-fee"
                        type="number"
                        min={0}
                        step={50}
                        inputMode="numeric"
                        value={monthlyFee ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "") {
                            setMonthlyFee(null);
                            return;
                          }
                          const n = Math.round(Number(v));
                          setMonthlyFee(
                            Number.isFinite(n) ? Math.max(0, n) : null,
                          );
                        }}
                        placeholder="0"
                        data-testid="input-monthly-fee"
                        className={`${INPUT_CLASS} w-40`}
                      />
                      <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground">
                        / maand
                      </span>
                    </div>
                  </div>
    </>
  );
}
