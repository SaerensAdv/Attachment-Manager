import { FileDown, Receipt, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { INPUT_CLASS } from "@/lib/clients-form";
import type { ClientEditorApi } from "@/hooks/useClientEditor";

/** Section XII — facturatie (snapshot preview + factuur uitgeven). */
export default function BillingSection({
  editor,
}: {
  editor: ClientEditorApi;
}) {
  const {
    editing,
    form,
    setField,
    effectiveFee,
    monthlyFee,
    handleFactuurPreview,
    factuurPreviewing,
    confirmIssue,
    setConfirmIssue,
    handleIssueInvoice,
    issuingInvoice,
  } = editor;
  return (
    <>
                  {/* Section XII — facturatie (existing clients only) */}
                  {typeof editing === "number" && (
                    <>
                      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                        <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                          XII. Facturatie
                        </h3>
                        <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                          Deterministisch — geen AI
                        </span>
                      </div>

                      <p className="font-['Inter'] text-sm text-muted-foreground -mt-4">
                        Stelt een proforma of definitieve factuur op uit het
                        klantdossier en de maandelijkse fee. De proforma verbruikt
                        geen nummer; bij "Factuur uitgeven" wordt een sluitend
                        factuurnummer toegekend en bewaard.
                      </p>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5 sm:col-span-2">
                          <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                            Facturatienaam
                          </label>
                          <Input
                            value={form.billingName}
                            onChange={(e) =>
                              setField("billingName", e.target.value)
                            }
                            placeholder="Leeg = klantnaam wordt gebruikt"
                            data-testid="input-client-billingName"
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5 sm:col-span-2">
                          <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                            Facturatieadres
                          </label>
                          <Textarea
                            value={form.billingAddress}
                            onChange={(e) =>
                              setField("billingAddress", e.target.value)
                            }
                            placeholder={"Straat en nummer\nPostcode + gemeente"}
                            rows={3}
                            data-testid="input-client-billingAddress"
                            className={INPUT_CLASS}
                          />
                          <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                            Eén regel per adreslijn. Verplicht om te factureren.
                          </span>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                            Land
                          </label>
                          <Input
                            value={form.billingCountry}
                            onChange={(e) =>
                              setField("billingCountry", e.target.value)
                            }
                            placeholder="België"
                            data-testid="input-client-billingCountry"
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                            Btw-nummer
                          </label>
                          <Input
                            value={form.vatNumber}
                            onChange={(e) =>
                              setField("vatNumber", e.target.value)
                            }
                            placeholder="BE 0123.456.789"
                            data-testid="input-client-vatNumber"
                            className={INPUT_CLASS}
                          />
                        </div>
                        <div className="flex flex-col gap-1.5 sm:col-span-2">
                          <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                            Btw-modus
                          </label>
                          <select
                            value={form.btwMode}
                            onChange={(e) =>
                              setField("btwMode", e.target.value)
                            }
                            data-testid="select-client-btwMode"
                            className={`${INPUT_CLASS} w-full`}
                          >
                            <option value="">
                              Automatisch (afgeleid uit btw-nummer)
                            </option>
                            <option value="btw_21">Belgische btw — 21%</option>
                            <option value="verlegd">
                              Btw verlegd (intracommunautair B2B)
                            </option>
                          </select>
                          <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60">
                            "Verlegd" vereist het btw-nummer van de klant.
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 border border-foreground/30 bg-foreground/5 p-3">
                        <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                          Factureerbare fee
                        </span>
                        {effectiveFee != null ? (
                          <span className="font-['Playfair_Display'] font-black text-lg">
                            € {effectiveFee.toLocaleString("nl-BE")} / maand
                            <span className="font-['Space_Mono'] text-[10px] font-normal uppercase tracking-wider text-muted-foreground ml-2">
                              {monthlyFee != null ? "klant-fiche" : "groep"}
                            </span>
                          </span>
                        ) : (
                          <span className="font-['Inter'] text-sm text-muted-foreground">
                            Nog geen fee ingesteld op de fiche of de groep.
                          </span>
                        )}
                      </div>

                      <p className="font-['Space_Mono'] text-[9px] leading-relaxed tracking-wider text-muted-foreground/60">
                        Let op: sinds 1 januari 2026 geldt in België de
                        verplichting tot gestructureerde e-facturatie (Peppol) voor
                        B2B. Deze PDF is een leesbare kopie, geen vervanging van de
                        Peppol-e-factuur.
                      </p>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleFactuurPreview}
                          disabled={
                            factuurPreviewing ||
                            effectiveFee == null ||
                            !form.billingAddress.trim()
                          }
                          data-testid="button-factuur-preview"
                          className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {factuurPreviewing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <FileDown className="w-4 h-4" />
                          )}
                          Proforma (PDF)
                        </button>

                        {confirmIssue ? (
                          <>
                            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                              Definitief uitgeven?
                            </span>
                            <button
                              onClick={handleIssueInvoice}
                              disabled={issuingInvoice}
                              data-testid="button-confirm-issue-invoice"
                              className="py-2.5 px-4 bg-accent text-accent-foreground border-2 border-accent font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 shadow-[4px_4px_0px_hsl(var(--foreground))] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:pointer-events-none"
                            >
                              {issuingInvoice ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Receipt className="w-4 h-4" />
                              )}
                              Bevestig & download
                            </button>
                            <button
                              onClick={() => setConfirmIssue(false)}
                              disabled={issuingInvoice}
                              data-testid="button-cancel-issue-invoice"
                              className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                            >
                              Annuleren
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmIssue(true)}
                            disabled={
                              effectiveFee == null || !form.billingAddress.trim()
                            }
                            data-testid="button-issue-invoice"
                            className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                          >
                            <Receipt className="w-4 h-4" />
                            Factuur uitgeven
                          </button>
                        )}

                        {(effectiveFee == null ||
                          !form.billingAddress.trim()) && (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Vul fee + facturatieadres in en bewaar eerst
                          </span>
                        )}
                      </div>
                    </>
                  )}
    </>
  );
}
