import { Loader2, Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FIELDS, STATE_FIELDS, INPUT_CLASS } from "@/lib/clients-form";
import type { BriefingSuggestions } from "@workspace/api-client-react";
import type { ClientEditorApi } from "@/hooks/useClientEditor";

/** Section I — briefing fields (name + FIELDS) plus the AI briefing-suggest panel. */
export default function BriefingSection({
  editor,
}: {
  editor: ClientEditorApi;
}) {
  const {
    editing,
    form,
    setField,
    handleBriefingSuggest,
    suggestingBriefing,
    briefingSuggestions,
    briefingNotes,
    applySuggestion,
    applyAllSuggestions,
    clearBriefingSuggestions,
  } = editor;
  return (
    <>
                  {/* Section heading */}
                  <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                    <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                      I. Briefing
                    </h3>
                    <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                      {FIELDS.length + STATE_FIELDS.length + 1} velden
                    </span>
                  </div>

                  {/* AI briefing-suggest — proposal only, existing clients */}
                  {typeof editing === "number" && (
                    <div className="-mt-4 flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleBriefingSuggest}
                          disabled={suggestingBriefing || !form.website.trim()}
                          data-testid="button-briefing-suggest"
                          className="py-2.5 px-4 border-2 border-accent text-accent font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-accent hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                        >
                          {suggestingBriefing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4" />
                          )}
                          {suggestingBriefing
                            ? "AI leest de website..."
                            : "Briefing automatisch voorstellen"}
                        </button>
                        {!form.website.trim() && (
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-wider text-muted-foreground/70">
                            Vul eerst het veld Website in (en bewaar)
                          </span>
                        )}
                      </div>

                      {briefingSuggestions &&
                        (() => {
                          const entries = (
                            Object.entries(briefingSuggestions) as [
                              keyof BriefingSuggestions,
                              string,
                            ][]
                          ).filter(([, v]) => typeof v === "string" && v.trim());
                          const labelOf = (k: string) =>
                            FIELDS.find((f) => f.key === k)?.label ?? k;
                          return (
                            <div className="border-2 border-accent bg-accent/5 p-4 flex flex-col gap-3">
                              <div className="flex items-baseline justify-between gap-3">
                                <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-accent">
                                  AI-voorstel · controleer & bevestig
                                </span>
                                <div className="flex items-center gap-2">
                                  {entries.length > 0 && (
                                    <button
                                      onClick={applyAllSuggestions}
                                      data-testid="button-apply-all-suggestions"
                                      className="py-1 px-2 border border-accent text-accent font-['Space_Mono'] text-[9px] uppercase tracking-widest hover:bg-accent hover:text-background transition-colors"
                                    >
                                      Alles overnemen
                                    </button>
                                  )}
                                  <button
                                    onClick={clearBriefingSuggestions}
                                    data-testid="button-dismiss-suggestions"
                                    className="p-1 border border-foreground/30 text-muted-foreground hover:bg-foreground hover:text-background transition-colors"
                                    aria-label="Voorstel sluiten"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              {briefingNotes.trim() && (
                                <p className="font-['Inter'] text-xs text-muted-foreground italic">
                                  {briefingNotes.trim()}
                                </p>
                              )}

                              {entries.length === 0 ? (
                                <p className="font-['Inter'] text-sm text-muted-foreground">
                                  Geen voorstellen — er was te weinig bruikbare
                                  info op de website.
                                </p>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  {entries.map(([key, value]) => (
                                    <div
                                      key={key}
                                      className="flex flex-col gap-1 border-b border-foreground/15 pb-2 last:border-b-0"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-foreground">
                                          {labelOf(key)}
                                        </span>
                                        <button
                                          onClick={() => applySuggestion(key)}
                                          data-testid={`button-apply-suggestion-${key}`}
                                          className="shrink-0 py-1 px-2 border border-foreground/40 text-foreground font-['Space_Mono'] text-[9px] uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"
                                        >
                                          Overnemen
                                        </button>
                                      </div>
                                      <p className="font-['Inter'] text-sm text-muted-foreground whitespace-pre-wrap">
                                        {value}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Name — 01 */}
                    <div className="md:col-span-2 flex flex-col gap-2">
                      <div className="flex items-baseline gap-3 border-b border-foreground/20 pb-1">
                        <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                          01
                        </span>
                        <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest flex-1">
                          Naam <span className="text-accent">*</span>
                        </label>
                      </div>
                      <Input
                        value={form.name}
                        onChange={(e) => setField("name", e.target.value)}
                        placeholder="Bedrijfsnaam van de cliënt"
                        data-testid="input-client-name"
                        className={INPUT_CLASS}
                      />
                    </div>

                    {FIELDS.map((f, i) => (
                      <div
                        key={f.key}
                        className={`flex flex-col gap-2 ${
                          f.kind === "textarea" || f.kind === "list"
                            ? "md:col-span-2"
                            : ""
                        }`}
                      >
                        <div className="flex items-baseline gap-3 border-b border-foreground/20 pb-1">
                          <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                            {String(i + 2).padStart(2, "0")}
                          </span>
                          <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest flex-1">
                            {f.label}
                          </label>
                          {f.help && (
                            <span className="font-['Space_Mono'] text-[9px] tracking-wider text-muted-foreground/60 italic">
                              {f.help}
                            </span>
                          )}
                        </div>
                        {f.kind === "input" ? (
                          <Input
                            value={form[f.key]}
                            onChange={(e) => setField(f.key, e.target.value)}
                            placeholder={f.placeholder}
                            data-testid={`input-client-${f.key}`}
                            className={INPUT_CLASS}
                          />
                        ) : (
                          <Textarea
                            value={form[f.key]}
                            onChange={(e) => setField(f.key, e.target.value)}
                            placeholder={f.placeholder}
                            rows={f.kind === "list" ? 3 : 4}
                            data-testid={`input-client-${f.key}`}
                            className={`${INPUT_CLASS} resize-none`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
    </>
  );
}
