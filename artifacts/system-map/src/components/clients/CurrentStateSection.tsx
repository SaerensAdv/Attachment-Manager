import { Textarea } from "@/components/ui/textarea";
import {
  FIELDS,
  STATE_FIELDS,
  INPUT_CLASS,
  MAX_STATE_FIELD_LEN,
} from "@/lib/clients-form";
import type { ClientEditorApi } from "@/hooks/useClientEditor";

/** Section II — vrije notities over de huidige stand. */
export default function CurrentStateSection({
  editor,
}: {
  editor: ClientEditorApi;
}) {
  const { form, setField } = editor;
  return (
    <>
                  {/* Section II — current state */}
                  <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
                    <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
                      II. Huidige stand
                    </h3>
                    <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                      Voedt de audits
                    </span>
                  </div>

                  <p className="font-['Inter'] text-sm text-muted-foreground -mt-4">
                    Korte vrije notities over de echte stand van zaken voor deze
                    cliënt. Google Ads- en Search Console-cijfers hoef je hier niet
                    meer te plakken — die worden nu live opgehaald (zie de
                    live-integraties hieronder).
                  </p>

                  <div className="grid grid-cols-1 gap-6">
                    {STATE_FIELDS.map((f, i) => (
                      <div key={f.key} className="flex flex-col gap-2">
                        <div className="flex items-baseline gap-3 border-b border-foreground/20 pb-1">
                          <span className="font-['Space_Mono'] text-xs text-muted-foreground">
                            {String(FIELDS.length + 2 + i).padStart(2, "0")}
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
                        <Textarea
                          value={form[f.key]}
                          onChange={(e) => setField(f.key, e.target.value)}
                          placeholder={f.placeholder}
                          rows={6}
                          maxLength={MAX_STATE_FIELD_LEN}
                          data-testid={`input-client-${f.key}`}
                          className={`${INPUT_CLASS} resize-y font-['Space_Mono'] text-xs`}
                        />
                        <span
                          className={`font-['Space_Mono'] text-[9px] tracking-wider self-end ${
                            form[f.key].length > MAX_STATE_FIELD_LEN * 0.9
                              ? "text-destructive"
                              : "text-muted-foreground/50"
                          }`}
                        >
                          {form[f.key].length.toLocaleString("nl-BE")} /{" "}
                          {MAX_STATE_FIELD_LEN.toLocaleString("nl-BE")}
                        </span>
                      </div>
                    ))}
                  </div>
    </>
  );
}
