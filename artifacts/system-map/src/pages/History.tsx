import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetGenerations,
  useGetGeneration,
  useDeleteGeneration,
  getGetGenerationsQueryKey,
  getGetGenerationQueryKey,
  type GenerationSummary,
} from "@workspace/api-client-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Trash2, X, Copy, Check, Download } from "lucide-react";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("nl-BE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function snippet(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() + "…" : clean;
}

export default function History() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useGetGenerations();
  const generations: GenerationSummary[] = data?.generations ?? [];

  const [selected, setSelected] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const detail = useGetGeneration(selected ?? 0, {
    query: {
      enabled: selected !== null,
      queryKey: getGetGenerationQueryKey(selected ?? 0),
    },
  });
  const deleteMut = useDeleteGeneration();

  const open = (id: number) => {
    setSelected(id);
    setConfirmDelete(false);
    setCopied(false);
  };

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetGenerationsQueryKey() });

  const handleDelete = () => {
    if (selected === null) return;
    deleteMut.mutate(
      { id: selected },
      {
        onSuccess: () => {
          invalidate();
          setSelected(null);
          setConfirmDelete(false);
        },
      },
    );
  };

  const markdown = detail.data?.finalMarkdown ?? "";

  const handleCopy = async () => {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const name = (detail.data?.clientName ?? "generatie")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    a.download = `${name || "generatie"}-${selected}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground font-['Inter']">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
            Archief laden...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground font-['Inter'] px-6">
        <div className="max-w-md w-full border border-foreground bg-card p-8 text-center shadow-[4px_4px_0px_hsl(var(--foreground))]">
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-destructive mb-3">
            Storing
          </p>
          <h1 className="font-['Playfair_Display'] font-black text-2xl uppercase tracking-tight mb-2">
            Archief onbereikbaar
          </h1>
          <p className="text-sm text-muted-foreground">
            Kon het archief niet laden. Controleer je verbinding of de
            API-status.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground font-['Inter']">
      <div className="mx-auto max-w-7xl px-6 pt-20 pb-16">
        {/* Masthead */}
        <header className="border-b-2 border-foreground pb-5 mb-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                Saerens Advertising — Redactie
              </p>
              <h1 className="font-['Playfair_Display'] font-black text-4xl md:text-5xl uppercase tracking-tight leading-none">
                Archief
              </h1>
            </div>
            <div className="text-right hidden sm:block shrink-0">
              <div className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                Edities
              </div>
              <div className="font-['Playfair_Display'] text-2xl italic leading-none mt-1">
                No. {String(generations.length).padStart(3, "0")}
              </div>
            </div>
          </div>
          <p className="font-['Inter'] text-sm text-muted-foreground mt-5 max-w-2xl">
            Elke generatie wordt hier automatisch bewaard. Lees ze terug,
            hergebruik ze of exporteer ze — niets gaat meer verloren bij een
            verversing.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[26rem_1fr] gap-10">
          {/* Index */}
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-foreground/20 pb-2">
              <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                Index
              </span>
              <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                {generations.length}{" "}
                {generations.length === 1 ? "editie" : "edities"}
              </span>
            </div>

            <div className="flex flex-col border-t border-foreground/20">
              {generations.length === 0 && (
                <div className="px-4 py-12 text-center border-b border-foreground/20">
                  <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                    Nog geen generaties bewaard
                  </p>
                  <p className="text-sm text-muted-foreground mt-2 font-['Inter']">
                    Maak iets aan via Genereren — het verschijnt hier
                    automatisch.
                  </p>
                </div>
              )}
              {generations.map((g, i) => {
                const active = selected === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => open(g.id)}
                    data-testid={`generation-row-${g.id}`}
                    className={`group flex items-start gap-4 text-left px-4 py-4 border-b border-foreground/20 transition-colors ${
                      active
                        ? "bg-foreground text-background"
                        : "hover:bg-foreground hover:text-background"
                    }`}
                  >
                    <span
                      className={`font-['Space_Mono'] text-xs pt-1.5 shrink-0 ${
                        active
                          ? "text-background/60"
                          : "text-muted-foreground group-hover:text-background/60"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="block font-['Playfair_Display'] font-bold text-lg leading-tight truncate">
                          {g.clientName}
                        </span>
                        <span
                          className={`font-['Space_Mono'] text-[9px] uppercase tracking-widest shrink-0 pt-1 ${
                            active
                              ? "text-background/60"
                              : "text-muted-foreground group-hover:text-background/60"
                          }`}
                        >
                          {formatDate(g.createdAt)}
                        </span>
                      </span>
                      <span
                        className={`block text-xs mt-1 truncate font-['Space_Mono'] uppercase tracking-wider ${
                          active
                            ? "text-background/70"
                            : "text-accent group-hover:text-background/70"
                        }`}
                      >
                        {g.leadAgentTitle}
                        {g.teamTitles.length > 1
                          ? ` +${g.teamTitles.length - 1}`
                          : ""}{" "}
                        · {g.workflowTitle}
                      </span>
                      <span
                        className={`block text-xs mt-1.5 font-['Inter'] line-clamp-2 ${
                          active
                            ? "text-background/70"
                            : "text-muted-foreground group-hover:text-background/70"
                        }`}
                      >
                        {snippet(g.requestText)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detail */}
          <div>
            {selected === null ? (
              <div className="flex flex-col items-center justify-center gap-4 text-center border border-dashed border-foreground/30 bg-card py-24 px-6">
                <span className="font-['Playfair_Display'] font-black text-6xl text-foreground/10 leading-none">
                  SA
                </span>
                <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                  Geen editie geopend
                </p>
                <p className="text-sm text-muted-foreground max-w-sm font-['Inter']">
                  Kies een editie uit het archief om ze terug te lezen.
                </p>
              </div>
            ) : (
              <div className="border border-foreground bg-card shadow-[4px_4px_0px_hsl(var(--foreground))]">
                {/* Detail header */}
                <div className="flex items-start justify-between gap-2 border-b-2 border-foreground px-6 py-5">
                  <div className="min-w-0">
                    <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                      Editie
                    </p>
                    <h2 className="font-['Playfair_Display'] font-black text-2xl uppercase tracking-tight leading-none mt-2 truncate">
                      {detail.data?.clientName ?? "Laden..."}
                    </h2>
                    {detail.data && (
                      <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
                        {formatDate(detail.data.createdAt)} ·{" "}
                        {detail.data.teamTitles.join(" → ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopy}
                      title="Kopiëren"
                      aria-label="Kopiëren"
                      data-testid="button-copy-generation"
                      disabled={!markdown}
                      className="p-2 hover:bg-background transition-colors text-foreground group disabled:opacity-40"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4 group-hover:text-accent" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      title="Downloaden"
                      aria-label="Downloaden"
                      data-testid="button-download-generation"
                      disabled={!markdown}
                      className="p-2 hover:bg-background transition-colors text-foreground group disabled:opacity-40"
                    >
                      <Download className="w-4 h-4 group-hover:text-accent" />
                    </button>
                    <button
                      onClick={() => setSelected(null)}
                      className="p-2 border border-foreground hover:bg-foreground hover:text-background transition-colors"
                      data-testid="button-close-generation"
                      aria-label="Sluiten"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Brief */}
                {detail.data && (
                  <div className="border-b border-foreground/20 bg-background/50 px-6 py-4">
                    <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                      Opdracht
                    </p>
                    <p className="text-sm text-foreground font-['Inter'] whitespace-pre-wrap">
                      {detail.data.requestText}
                    </p>
                  </div>
                )}

                {/* Body */}
                <div className="px-6 lg:px-10 py-8">
                  {detail.isLoading ? (
                    <div className="h-40 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-accent" />
                    </div>
                  ) : detail.error ? (
                    <p className="text-sm text-destructive font-['Inter']">
                      Kon deze editie niet laden.
                    </p>
                  ) : (
                    <article className="prose prose-sm max-w-none font-['Inter'] prose-headings:font-['Playfair_Display'] prose-headings:font-bold prose-headings:tracking-tight prose-strong:text-foreground prose-a:text-accent">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {markdown}
                      </ReactMarkdown>
                    </article>
                  )}
                </div>

                {/* Footer / delete */}
                <div className="flex items-center justify-end gap-3 border-t border-foreground/20 px-6 py-4">
                  {confirmDelete ? (
                    <>
                      <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                        Definitief verwijderen?
                      </span>
                      <button
                        onClick={handleDelete}
                        disabled={deleteMut.isPending}
                        data-testid="button-confirm-delete-generation"
                        className="py-2.5 px-4 bg-destructive text-destructive-foreground border-2 border-destructive font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 shadow-[4px_4px_0px_hsl(var(--foreground))] active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {deleteMut.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                        Verwijderen
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"
                      >
                        Annuleren
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      data-testid="button-delete-generation"
                      className="py-2.5 px-4 border-2 border-foreground text-foreground font-['Space_Mono'] text-[11px] uppercase tracking-widest flex items-center gap-2 hover:bg-destructive hover:border-destructive hover:text-destructive-foreground transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Verwijderen
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
