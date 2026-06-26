import { Presentation, Loader2 } from "lucide-react";
import type { ClientEditorApi } from "@/hooks/useClientEditor";

/** Section XIV — deck-generatie. */
export default function DeckSection({
  editor,
}: {
  editor: ClientEditorApi;
}) {
  const { editing, form, handleGenerateDeck, deckBusy, deckResult } = editor;
  return (
    <>
                  {/* Section XIV — decks (existing clients only) */}
                  {typeof editing === "number" && (
                    <>
                      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                        <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                          XIV. Decks
                        </h3>
                        <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                          Live data → presentatie
                        </span>
                      </div>

                      <p className="font-['Inter'] text-sm text-muted-foreground -mt-4">
                        Genereert een presentatie op basis van de live Google
                        Ads-cijfers: het audit-deck (dit jaar t.o.v. vorig jaar)
                        of het QBR-deck (laatste volledige kwartaal, met QoQ en
                        YoY). De cijfers worden automatisch ingevuld; de
                        strategische duiding en doelstellingen blijven open
                        ([...]) zodat je ze zelf afwerkt. De deck wordt opgebouwd
                        in het gedeelde demo-deck en is daarna exporteerbaar naar
                        PPTX/PDF. Bewaar eerst je wijzigingen — de generatie
                        gebruikt het opgeslagen customer ID, niet wat nog in het
                        formulier staat.
                      </p>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => handleGenerateDeck("audit")}
                          disabled={
                            deckBusy !== null ||
                            !form.googleAdsCustomerId.trim()
                          }
                          data-testid="button-generate-audit-deck"
                          className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {deckBusy === "audit" ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Presentation className="w-4 h-4" />
                          )}
                          Audit-deck genereren
                        </button>
                        <button
                          onClick={() => handleGenerateDeck("qbr")}
                          disabled={
                            deckBusy !== null ||
                            !form.googleAdsCustomerId.trim()
                          }
                          data-testid="button-generate-qbr-deck"
                          className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {deckBusy === "qbr" ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Presentation className="w-4 h-4" />
                          )}
                          QBR-deck genereren
                        </button>
                        {!form.googleAdsCustomerId.trim() && (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Vul eerst het customer ID in
                          </span>
                        )}
                      </div>

                      {deckResult && (
                        <div className="border-l-2 border-accent bg-accent/5 px-4 py-3 flex flex-col gap-1">
                          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-foreground">
                            {deckResult.kind === "audit"
                              ? "Audit-deck"
                              : "QBR-deck"}{" "}
                            klaar — {deckResult.period}
                          </p>
                          <p className="text-sm text-muted-foreground font-['Inter']">
                            De deck is opgebouwd met de live cijfers. Open ze in
                            het demo-deck en exporteer naar PPTX/PDF.
                          </p>
                          <a
                            href={deckResult.previewPath}
                            target="_blank"
                            rel="noreferrer"
                            data-testid="link-open-generated-deck"
                            className="self-start mt-1 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-accent underline underline-offset-4 hover:opacity-80"
                          >
                            Deck openen →
                          </a>
                        </div>
                      )}
                    </>
                  )}
    </>
  );
}
