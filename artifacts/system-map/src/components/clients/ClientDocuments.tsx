import { useState } from "react";
import { Link } from "wouter";
import {
  useGetGenerations,
  useGetGeneration,
  getGetGenerationsQueryKey,
  getGetGenerationQueryKey,
  type GenerationSummary,
} from "@workspace/api-client-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FileText,
  Loader2,
  Download,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ClientEditorApi } from "@/hooks/useClientEditor";

// The doc-graph path a DB client is mirrored under (see clients-store.ts on the
// server). The generations archive is filtered by this exact path.
const DB_CLIENT_PREFIX = "clients/db/";

const RUN_STATUS_LABEL: Record<string, string> = {
  completed: "Voltooid",
  partial: "Gedeeltelijk",
};

const TRIGGER_LABEL: Record<string, string> = {
  user: "Handmatig",
  auto: "Autonoom",
  scheduled: "Gepland",
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("nl-BE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * XV — per-client document history. A read-only gallery of every generation
 * (deliverable/report/analysis) produced for this dossier, filtered server-side
 * by the client's doc-graph path. Each item can be re-read and exported as
 * markdown; the full audit trail lives in the Archief. Real Google Drive
 * linking is deferred.
 */
export default function ClientDocuments({
  editor,
}: {
  editor: ClientEditorApi;
}) {
  const { editing } = editor;
  const clientPath =
    typeof editing === "number" ? `${DB_CLIENT_PREFIX}${editing}.md` : null;

  const { data, isLoading, error } = useGetGenerations(
    clientPath ? { clientPath } : undefined,
    {
      query: {
        enabled: clientPath !== null,
        queryKey: getGetGenerationsQueryKey(
          clientPath ? { clientPath } : undefined,
        ),
      },
    },
  );
  const generations: GenerationSummary[] = data?.generations ?? [];

  const [selected, setSelected] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const detail = useGetGeneration(selected ?? 0, {
    query: {
      enabled: selected !== null,
      queryKey: getGetGenerationQueryKey(selected ?? 0),
    },
  });
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
    const name = (detail.data?.clientName ?? "document")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    a.download = `${name || "document"}-${selected}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex items-baseline justify-between border-b-2 border-foreground pb-1">
        <h3 className="font-['Playfair_Display'] font-bold text-lg uppercase tracking-wider">
          XV. Documenten
        </h3>
        <span className="font-['Space_Mono'] text-xs text-muted-foreground">
          Generatie-archief
        </span>
      </div>

      <p className="font-['Inter'] text-sm text-muted-foreground -mt-4">
        Alle eindproducten, rapporten en analyses die het team voor deze cliënt
        aanmaakte, komen hier automatisch samen. Lees ze terug of exporteer ze
        als markdown. Het volledige verloop (stappen, tokens, beoordeling) staat
        in het Archief.
      </p>

      {editing === "new" ? (
        <div className="border border-dashed border-foreground/30 bg-background px-4 py-10 text-center">
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
            Nog geen dossier bewaard
          </p>
          <p className="text-sm text-muted-foreground mt-2 font-['Inter']">
            Bewaar eerst het dossier — daarna verschijnen hier automatisch alle
            documenten die voor deze cliënt gegenereerd worden.
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-3 py-10">
          <Loader2 className="w-4 h-4 animate-spin text-accent" />
          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
            Documenten laden...
          </span>
        </div>
      ) : error ? (
        <div className="border-l-2 border-destructive bg-destructive/5 px-4 py-3">
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-destructive mb-1">
            Fout
          </p>
          <p className="text-sm text-foreground font-['Inter']">
            Kon de documenten niet laden. Probeer het later opnieuw.
          </p>
        </div>
      ) : generations.length === 0 ? (
        <div className="border border-dashed border-foreground/30 bg-background px-4 py-10 text-center">
          <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
            Nog geen documenten
          </p>
          <p className="text-sm text-muted-foreground mt-2 font-['Inter']">
            Zodra het team iets voor deze cliënt genereert (via de opdrachtbalk
            op de Kaart), verschijnt het hier.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {generations.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setSelected(g.id);
                setCopied(false);
              }}
              data-testid={`client-document-${g.id}`}
              className="group flex flex-col gap-2 text-left border border-foreground/25 bg-background p-4 hover:border-foreground hover:shadow-[3px_3px_0px_hsl(var(--foreground))] transition-all"
            >
              <div className="flex items-start gap-3">
                <FileText className="w-4 h-4 shrink-0 mt-0.5 text-accent" />
                <span className="flex-1 min-w-0">
                  <span className="block font-['Playfair_Display'] font-bold text-base leading-tight truncate">
                    {g.workflowTitle}
                  </span>
                  <span className="block font-['Space_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground mt-1 truncate">
                    {g.leadAgentTitle}
                    {g.teamTitles.length > 1
                      ? ` +${g.teamTitles.length - 1}`
                      : ""}
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="font-['Space_Mono'] text-[9px] uppercase tracking-widest text-muted-foreground">
                  {formatDate(g.createdAt)}
                </span>
                <span
                  className={`font-['Space_Mono'] text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${
                    g.status === "partial"
                      ? "border-amber-700 text-amber-700"
                      : "border-foreground/40 text-muted-foreground"
                  }`}
                >
                  {RUN_STATUS_LABEL[g.status] ?? g.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Reader — read back a single document + export it as markdown. */}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] max-h-[85vh] overflow-hidden flex flex-col rounded-none border-foreground bg-card p-0 gap-0">
          <div className="border-b-2 border-foreground px-6 py-5">
            <DialogTitle asChild>
              <h2 className="font-['Playfair_Display'] font-black text-xl uppercase tracking-tight leading-none pr-8">
                {detail.data?.workflowTitle ?? "Document"}
              </h2>
            </DialogTitle>
            <DialogDescription asChild>
              <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
                {detail.data
                  ? `${formatDate(detail.data.createdAt)} · ${
                      TRIGGER_LABEL[detail.data.triggerSource] ??
                      detail.data.triggerSource
                    }`
                  : "Laden..."}
              </p>
            </DialogDescription>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button
                type="button"
                onClick={handleCopy}
                disabled={!markdown}
                data-testid="button-copy-client-document"
                className="py-1.5 px-3 border border-foreground text-foreground font-['Space_Mono'] text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-green-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? "Gekopieerd" : "Kopiëren"}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={!markdown}
                data-testid="button-download-client-document"
                className="py-1.5 px-3 border border-foreground text-foreground font-['Space_Mono'] text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-foreground hover:text-background transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <Download className="w-3.5 h-3.5" />
                Downloaden
              </button>
              {selected !== null && (
                <Link
                  href={`/history?id=${selected}`}
                  data-testid="link-open-in-archive"
                  className="py-1.5 px-3 border border-foreground/40 text-muted-foreground font-['Space_Mono'] text-[10px] uppercase tracking-widest flex items-center gap-2 hover:border-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  In Archief
                </Link>
              )}
            </div>
          </div>

          <div className="overflow-y-auto px-6 py-5">
            {detail.isLoading ? (
              <div className="flex items-center justify-center gap-3 py-10">
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
                <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                  Document laden...
                </span>
              </div>
            ) : markdown ? (
              <div className="prose prose-sm prose-neutral max-w-none font-['Inter'] prose-headings:font-['Playfair_Display'] prose-headings:uppercase prose-headings:tracking-tight">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {markdown}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground font-['Inter'] py-10 text-center">
                Dit document heeft geen tekstinhoud (bv. enkel een verzonden
                e-mail of PDF). Bekijk het volledige verloop in het Archief.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
