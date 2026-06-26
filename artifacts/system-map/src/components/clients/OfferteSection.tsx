import { FileDown, Plus, Trash2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { INPUT_CLASS } from "@/lib/clients-form";
import type { ClientEditorApi } from "@/hooks/useClientEditor";

/** Section XIII — offerte (AI-prose + handmatige prijsregels). */
export default function OfferteSection({
  editor,
}: {
  editor: ClientEditorApi;
}) {
  const {
    editing,
    offerteProse,
    setOfferteProse,
    offerteLines,
    updateOfferteLine,
    removeOfferteLine,
    addOfferteLine,
    offerteValidUntil,
    setOfferteValidUntil,
    handleOfferte,
    offerteGenerating,
    offerteHasValidLine,
  } = editor;
  return (
    <>
                  {/* Section XIII — offerte (existing clients only) */}
                  {typeof editing === "number" && (
                    <>
                      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                        <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                          XIII. Offerte
                        </h3>
                        <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                          Hybride — AI-tekst + jouw prijzen
                        </span>
                      </div>

                      <p className="font-['Inter'] text-sm text-muted-foreground -mt-4">
                        Stelt een vrijblijvende offerte op: plak de voorsteltekst
                        (bv. uit de sales-proposal generatie) en vul de
                        prijsregels in. Geen factuurnummer, geen
                        btw-berekening — een offerte is niet-bindend. De PDF is
                        het document zelf.
                      </p>

                      <div className="flex flex-col gap-1.5">
                        <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                          Voorsteltekst (markdown)
                        </label>
                        <Textarea
                          value={offerteProse}
                          onChange={(e) => setOfferteProse(e.target.value)}
                          placeholder={
                            "## Wat we voorstellen\n\nKorte intro…\n\n- Aanpak\n- Wat je mag verwachten"
                          }
                          rows={8}
                          data-testid="input-offerte-prose"
                          className={INPUT_CLASS}
                        />
                        <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                          Interne nota's en [AAN TE VULLEN]-placeholders worden
                          automatisch verwijderd. Tekst optioneel — alleen
                          prijzen mag ook.
                        </span>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                          Prijsregels (excl. btw)
                        </label>
                        {offerteLines.map((line, i) => (
                          <div
                            key={i}
                            className="grid gap-2 sm:grid-cols-[1fr_110px_130px_auto] items-center"
                          >
                            <Input
                              value={line.label}
                              onChange={(e) =>
                                updateOfferteLine(i, { label: e.target.value })
                              }
                              placeholder="Omschrijving"
                              data-testid={`input-offerte-line-label-${i}`}
                              className={INPUT_CLASS}
                            />
                            <Input
                              value={line.amountEur}
                              onChange={(e) =>
                                updateOfferteLine(i, {
                                  amountEur: e.target.value,
                                })
                              }
                              placeholder="€ bedrag"
                              inputMode="decimal"
                              data-testid={`input-offerte-line-amount-${i}`}
                              className={INPUT_CLASS}
                            />
                            <select
                              value={line.recurrence}
                              onChange={(e) =>
                                updateOfferteLine(i, {
                                  recurrence: e.target.value as
                                    | "eenmalig"
                                    | "maandelijks",
                                })
                              }
                              data-testid={`select-offerte-line-recurrence-${i}`}
                              className={`${INPUT_CLASS} w-full`}
                            >
                              <option value="maandelijks">Per maand</option>
                              <option value="eenmalig">Eenmalig</option>
                            </select>
                            <button
                              onClick={() => removeOfferteLine(i)}
                              disabled={offerteLines.length <= 1}
                              data-testid={`button-offerte-line-remove-${i}`}
                              title="Regel verwijderen"
                              className="p-2 border-2 border-foreground/30 text-muted-foreground hover:border-destructive hover:text-destructive transition-colors disabled:opacity-30 disabled:pointer-events-none"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={addOfferteLine}
                          disabled={offerteLines.length >= 25}
                          data-testid="button-offerte-line-add"
                          className="self-start py-2 px-3 border-2 border-dashed border-foreground/40 text-foreground font-['Space_Mono'] text-[10px] uppercase tracking-widest flex items-center gap-2 hover:border-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Regel toevoegen
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                          <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                            Geldig tot
                          </label>
                          <Input
                            value={offerteValidUntil}
                            onChange={(e) =>
                              setOfferteValidUntil(e.target.value)
                            }
                            placeholder="Leeg = 30 dagen (bv. 31 juli 2026)"
                            data-testid="input-offerte-valid-until"
                            className={INPUT_CLASS}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleOfferte}
                          disabled={offerteGenerating || !offerteHasValidLine}
                          data-testid="button-offerte-download"
                          className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {offerteGenerating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <FileDown className="w-4 h-4" />
                          )}
                          Offerte (PDF)
                        </button>
                        {!offerteHasValidLine && (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Vul minstens één prijsregel in
                          </span>
                        )}
                      </div>
                    </>
                  )}
    </>
  );
}
