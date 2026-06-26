import { Save, Loader2, Trash2 } from "lucide-react";
import type { ClientEditorApi } from "@/hooks/useClientEditor";

/** Form error banner + footer actions (opslaan / annuleren / verwijderen). */
export default function EditorActions({
  editor,
}: {
  editor: ClientEditorApi;
}) {
  const {
    formError,
    handleSave,
    saving,
    editing,
    closeEditor,
    confirmDelete,
    setConfirmDelete,
    handleDelete,
    deleting,
  } = editor;
  return (
    <>
                  {formError && (
                    <div
                      className="border-l-2 border-destructive bg-destructive/5 px-4 py-3"
                      data-testid="text-form-error"
                    >
                      <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-destructive mb-1">
                        Fout
                      </p>
                      <p className="text-sm text-foreground font-['Inter']">
                        {formError}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-foreground/20">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      data-testid="button-save-client"
                      className="py-3 px-5 bg-accent text-accent-foreground border-2 border-accent font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-[4px_4px_0px_hsl(var(--foreground))] hover:bg-accent/90 active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {editing === "new"
                        ? "Dossier aanmaken"
                        : "Wijzigingen opslaan"}
                    </button>

                    <button
                      onClick={closeEditor}
                      disabled={saving}
                      data-testid="button-cancel"
                      className="py-3 px-5 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                    >
                      Annuleren
                    </button>

                    {typeof editing === "number" && (
                      <div className="ml-auto flex items-center gap-3">
                        {confirmDelete ? (
                          <>
                            <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                              Definitief?
                            </span>
                            <button
                              onClick={handleDelete}
                              disabled={deleting}
                              data-testid="button-confirm-delete"
                              className="py-2.5 px-4 bg-destructive text-destructive-foreground border-2 border-destructive font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 shadow-[4px_4px_0px_hsl(var(--foreground))] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:pointer-events-none"
                            >
                              {deleting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                              Verwijderen
                            </button>
                            <button
                              onClick={() => setConfirmDelete(false)}
                              disabled={deleting}
                              className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:pointer-events-none"
                            >
                              Behouden
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(true)}
                            data-testid="button-delete-client"
                            className="py-2.5 px-4 border-2 border-destructive text-destructive font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-destructive hover:text-destructive-foreground transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            Verwijderen
                          </button>
                        )}
                      </div>
                    )}
                  </div>
    </>
  );
}
