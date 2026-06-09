import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetClients,
  useClientCrawlUpload,
  getGetClientsQueryKey,
  getGetClientsCoverageQueryKey,
  getGetDocGraphQueryKey,
} from "@workspace/api-client-react";
import {
  Upload,
  FileSpreadsheet,
  Download,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Plus,
  X,
} from "lucide-react";
import Reveal from "@/components/Reveal";

type RowStatus = "idle" | "uploading" | "done" | "error";

interface UploadRow {
  uid: string;
  file: File;
  clientId: string;
  status: RowStatus;
  message?: string;
}

/** Screaming Frog "Internal: All" columns we actually read, for the template. */
const TEMPLATE_HEADERS = [
  "Address",
  "Status Code",
  "Content Type",
  "Indexability",
  "Indexability Status",
  "Title 1",
  "Meta Description 1",
  "H1-1",
  "Response Time",
  "Size (bytes)",
  "Redirect URL",
];

const TEMPLATE_ROWS = [
  [
    "https://www.voorbeeld.be/",
    "200",
    "text/html; charset=UTF-8",
    "Indexable",
    "",
    "Voorbeeld titel",
    "Een korte meta description van de homepage.",
    "Voorbeeld H1",
    "0.42",
    "84210",
    "",
  ],
  [
    "https://www.voorbeeld.be/oude-pagina",
    "301",
    "text/html; charset=UTF-8",
    "Non-Indexable",
    "Redirected",
    "",
    "",
    "",
    "0.18",
    "0",
    "https://www.voorbeeld.be/nieuwe-pagina",
  ],
];

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function buildTemplateCsv(): string {
  const lines = [TEMPLATE_HEADERS, ...TEMPLATE_ROWS].map((r) =>
    r.map(csvCell).join(","),
  );
  return lines.join("\r\n");
}

let uidCounter = 0;
const nextUid = (): string => `row-${Date.now()}-${(uidCounter += 1)}`;

function errorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const data = (err as { data?: { error?: unknown } }).data;
    if (data && typeof data.error === "string") return data.error;
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  return "Upload mislukt.";
}

export default function CrawlUpload() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetClients();
  const upload = useClientCrawlUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clients = useMemo(
    () =>
      [...(data?.clients ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, "nl"),
      ),
    [data],
  );

  const today = new Date().toISOString().slice(0, 10);
  const [crawledAt, setCrawledAt] = useState(today);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [busy, setBusy] = useState(false);

  const addFiles = (files: FileList | null): void => {
    if (!files || files.length === 0) return;
    const added: UploadRow[] = Array.from(files).map((file) => ({
      uid: nextUid(),
      file,
      clientId: "",
      status: "idle",
    }));
    setRows((prev) => [...prev, ...added]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const setRowClient = (uid: string, clientId: string): void => {
    setRows((prev) =>
      prev.map((r) =>
        r.uid === uid ? { ...r, clientId, status: "idle", message: undefined } : r,
      ),
    );
  };

  const removeRow = (uid: string): void => {
    setRows((prev) => prev.filter((r) => r.uid !== uid));
  };

  const clearDone = (): void => {
    setRows((prev) => prev.filter((r) => r.status !== "done"));
  };

  const downloadTemplate = (): void => {
    const blob = new Blob([buildTemplateCsv()], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "screaming-frog-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Soft warning when two files target the same client (the later overwrites).
  const duplicateClientIds = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of rows) {
      if (r.clientId) seen.set(r.clientId, (seen.get(r.clientId) ?? 0) + 1);
    }
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id));
  }, [rows]);

  const pending = rows.filter((r) => r.status === "idle" || r.status === "error");
  const canUpload =
    !busy && pending.length > 0 && pending.every((r) => r.clientId);

  const uploadAll = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    const crawledAtIso = crawledAt
      ? new Date(`${crawledAt}T12:00:00`).toISOString()
      : undefined;

    try {
      for (const row of rows) {
        if (row.status === "done") continue;
        if (!row.clientId) {
          setRows((prev) =>
            prev.map((r) =>
              r.uid === row.uid
                ? { ...r, status: "error", message: "Kies eerst een klant." }
                : r,
            ),
          );
          continue;
        }
        setRows((prev) =>
          prev.map((r) =>
            r.uid === row.uid
              ? { ...r, status: "uploading", message: undefined }
              : r,
          ),
        );
        try {
          const csv = await row.file.text();
          await upload.mutateAsync({
            id: Number(row.clientId),
            data: { csv, crawledAt: crawledAtIso },
          });
          setRows((prev) =>
            prev.map((r) =>
              r.uid === row.uid
                ? { ...r, status: "done", message: "Opgeslagen." }
                : r,
            ),
          );
        } catch (err) {
          setRows((prev) =>
            prev.map((r) =>
              r.uid === row.uid
                ? { ...r, status: "error", message: errorMessage(err) }
                : r,
            ),
          );
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetClientsQueryKey() }),
        queryClient.invalidateQueries({
          queryKey: getGetClientsCoverageQueryKey(),
        }),
        queryClient.invalidateQueries({ queryKey: getGetDocGraphQueryKey() }),
      ]);
    } finally {
      setBusy(false);
    }
  };

  const doneCount = rows.filter((r) => r.status === "done").length;

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground font-['Inter']">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-20 pb-16">
        {/* Masthead */}
        <Reveal>
          <header className="border-b-2 border-foreground pb-5 mb-10">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  Saerens Advertising — Technische SEO
                </p>
                <h1 className="font-['Playfair_Display'] font-black text-3xl sm:text-4xl md:text-5xl uppercase tracking-tight leading-none">
                  Crawl uploaden
                </h1>
              </div>
              <div className="text-right hidden sm:block shrink-0">
                <div className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                  Bestanden
                </div>
                <div className="font-['Playfair_Display'] text-2xl italic leading-none mt-1">
                  No. {String(rows.length).padStart(3, "0")}
                </div>
              </div>
            </div>
            <p className="font-['Inter'] text-sm text-muted-foreground mt-5 max-w-2xl">
              Upload één of meerdere Screaming Frog-exports tegelijk. Wijs elk
              bestand toe aan een klant; de laatste crawl wordt op de
              klantfiche bewaard en meegelezen door de SEO-specialist.
            </p>
          </header>
        </Reveal>

        {/* Instructions */}
        <Reveal>
          <section className="mb-10 border border-foreground/20 bg-card">
            <div className="flex items-center justify-between gap-4 border-b border-foreground/15 px-5 py-3">
              <h2 className="font-['Space_Mono'] text-[11px] uppercase tracking-widest">
                Zo maak je de export
              </h2>
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex items-center gap-2 border border-foreground bg-background px-3 py-1.5 font-['Space_Mono'] text-[10px] uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"
                data-testid="button-download-template"
              >
                <Download className="w-3.5 h-3.5" />
                Voorbeeld-CSV
              </button>
            </div>
            <ol className="px-5 py-4 space-y-2 text-sm text-muted-foreground list-decimal list-inside marker:text-foreground/40 marker:font-['Space_Mono']">
              <li>
                Crawl de site in Screaming Frog SEO Spider (desktop, jouw
                licentie).
              </li>
              <li>
                Ga naar het tabblad <span className="text-foreground">Internal</span> en
                zet het filter op{" "}
                <span className="text-foreground">All</span> (of gebruik{" "}
                <span className="text-foreground">Bulk Export → Internal → All</span>).
              </li>
              <li>
                Exporteer als <span className="text-foreground">CSV</span>. Eén
                CSV-bestand per website.
              </li>
              <li>
                Voeg de bestanden hieronder toe, kies per bestand de klant en
                klik op uploaden.
              </li>
            </ol>
            <p className="px-5 pb-4 text-xs text-muted-foreground/80">
              De voorbeeld-CSV toont welke kolommen worden gelezen (Address,
              Status Code, Indexability, Title 1, Meta Description 1, H1-1,
              Response Time, Size, Redirect URL). Kleine versieverschillen in
              Screaming Frog zijn geen probleem.
            </p>
          </section>
        </Reveal>

        {/* Controls */}
        <Reveal>
          <section className="mb-6 flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                Crawldatum
              </label>
              <input
                type="date"
                value={crawledAt}
                max={today}
                onChange={(e) => setCrawledAt(e.target.value)}
                className="border border-foreground bg-card px-3 py-2 font-['Space_Mono'] text-xs"
                data-testid="input-crawled-at"
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
              data-testid="input-files"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 border border-foreground bg-background px-4 py-2.5 font-['Space_Mono'] text-[10px] uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors"
              data-testid="button-add-files"
            >
              <Plus className="w-3.5 h-3.5" />
              Bestanden toevoegen
            </button>

            <div className="ml-auto flex items-center gap-3">
              {doneCount > 0 && (
                <button
                  type="button"
                  onClick={clearDone}
                  className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                  data-testid="button-clear-done"
                >
                  Voltooide wissen
                </button>
              )}
              <button
                type="button"
                onClick={uploadAll}
                disabled={!canUpload}
                className="inline-flex items-center gap-2 border border-foreground bg-foreground px-5 py-2.5 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-background shadow-[3px_3px_0px_hsl(var(--foreground))] enabled:hover:translate-x-0.5 enabled:hover:translate-y-0.5 enabled:hover:shadow-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="button-upload-all"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                {busy
                  ? "Bezig..."
                  : `Upload ${pending.length || ""}`.trim()}
              </button>
            </div>
          </section>
        </Reveal>

        {/* File rows */}
        <Reveal>
          {rows.length === 0 ? (
            <div className="border border-dashed border-foreground/30 bg-card/50 px-6 py-16 text-center">
              <FileSpreadsheet className="mx-auto mb-4 h-8 w-8 text-foreground/30" />
              <p className="font-['Space_Mono'] text-[11px] uppercase tracking-widest text-muted-foreground">
                Nog geen bestanden toegevoegd
              </p>
              <p className="mt-2 text-sm text-muted-foreground/80">
                Voeg één of meerdere Screaming Frog CSV-exports toe om te
                beginnen.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => (
                <li
                  key={row.uid}
                  className="flex flex-col gap-3 border border-foreground/20 bg-card px-4 py-3 sm:flex-row sm:items-center"
                  data-testid={`row-${row.uid}`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <FileSpreadsheet className="h-4 w-4 shrink-0 text-foreground/50" />
                    <div className="min-w-0">
                      <div className="truncate font-['Space_Mono'] text-xs">
                        {row.file.name}
                      </div>
                      <div className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                        {(row.file.size / 1024).toFixed(0)} KB
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <select
                      value={row.clientId}
                      onChange={(e) => setRowClient(row.uid, e.target.value)}
                      disabled={isLoading || row.status === "uploading"}
                      className="border border-foreground bg-background px-3 py-2 font-['Space_Mono'] text-xs disabled:opacity-50"
                      data-testid={`select-client-${row.uid}`}
                    >
                      <option value="">Kies klant…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.name}
                        </option>
                      ))}
                    </select>

                    <div className="w-44 shrink-0">
                      <StatusBadge row={row} />
                    </div>

                    <button
                      type="button"
                      onClick={() => removeRow(row.uid)}
                      disabled={row.status === "uploading"}
                      aria-label="Verwijderen"
                      className="text-foreground/40 hover:text-destructive disabled:opacity-30"
                      data-testid={`button-remove-${row.uid}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {row.clientId && duplicateClientIds.has(row.clientId) && (
                    <p className="basis-full font-['Space_Mono'] text-[10px] uppercase tracking-widest text-[hsl(var(--cat-workflow))]">
                      <AlertTriangle className="mr-1 inline h-3 w-3" />
                      Meerdere bestanden voor deze klant — alleen de laatste
                      blijft bewaard.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Reveal>
      </div>
    </div>
  );
}

function StatusBadge({ row }: { row: UploadRow }) {
  if (row.status === "uploading") {
    return (
      <span className="inline-flex items-center gap-1.5 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Uploaden…
      </span>
    );
  }
  if (row.status === "done") {
    return (
      <span className="inline-flex items-center gap-1.5 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-[hsl(var(--accent))]">
        <CheckCircle2 className="h-3 w-3" />
        Opgeslagen
      </span>
    );
  }
  if (row.status === "error") {
    return (
      <span
        className="inline-flex items-start gap-1.5 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-destructive"
        title={row.message}
      >
        <X className="mt-px h-3 w-3 shrink-0" />
        <span className="line-clamp-2 normal-case tracking-normal">
          {row.message ?? "Mislukt"}
        </span>
      </span>
    );
  }
  return (
    <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground/60">
      Klaar om te uploaden
    </span>
  );
}
