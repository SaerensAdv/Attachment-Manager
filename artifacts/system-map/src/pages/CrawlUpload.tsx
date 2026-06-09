import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetClients,
  useClientCrawlUpload,
  useGetClientCrawlSnapshots,
  getGetClientsQueryKey,
  getGetClientsCoverageQueryKey,
  getGetDocGraphQueryKey,
  getGetClientCrawlSnapshotsQueryKey,
  type CrawlSnapshot,
  type CrawlStats,
} from "@workspace/api-client-react";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Plus,
  X,
  History,
  ArrowDown,
  ArrowUp,
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

/**
 * The crawl metrics shown in the history comparison. `lowerIsBetter` drives the
 * delta colour: for issue counts a drop month-over-month is an improvement; for
 * volume metrics (URLs, redirects) the delta is informational, not good/bad.
 */
const METRICS: {
  key: keyof CrawlStats;
  label: string;
  lowerIsBetter: boolean | null;
}[] = [
  { key: "totalUrls", label: "URL's", lowerIsBetter: null },
  { key: "clientErrors", label: "4xx", lowerIsBetter: true },
  { key: "serverErrors", label: "5xx", lowerIsBetter: true },
  { key: "redirects", label: "3xx", lowerIsBetter: null },
  { key: "redirectChains", label: "Chains", lowerIsBetter: true },
  { key: "redirectLoops", label: "Loops", lowerIsBetter: true },
  { key: "missingTitles", label: "Titel ontbr.", lowerIsBetter: true },
  { key: "duplicateTitles", label: "Dubbele titel", lowerIsBetter: true },
  { key: "missingMetaDescriptions", label: "Meta ontbr.", lowerIsBetter: true },
  { key: "duplicateMetaDescriptions", label: "Dubbele meta", lowerIsBetter: true },
  { key: "missingH1", label: "H1 ontbr.", lowerIsBetter: true },
  { key: "nonIndexable", label: "Niet-index.", lowerIsBetter: true },
  { key: "slowPages", label: "Traag", lowerIsBetter: true },
  { key: "largePages", label: "Groot", lowerIsBetter: true },
];

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

const nf = new Intl.NumberFormat("nl-BE");

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("nl-BE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
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
  const [masterClientId, setMasterClientId] = useState("");
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [busy, setBusy] = useState(false);

  const addFiles = (files: FileList | null): void => {
    if (!files || files.length === 0) return;
    const added: UploadRow[] = Array.from(files).map((file) => ({
      uid: nextUid(),
      file,
      clientId: masterClientId,
      status: "idle",
    }));
    setRows((prev) => [...prev, ...added]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // The master selector assigns every not-yet-uploaded file in one go, so a
  // whole batch for one client doesn't need per-row clicks.
  const setMaster = (clientId: string): void => {
    setMasterClientId(clientId);
    setRows((prev) =>
      prev.map((r) =>
        r.status === "done"
          ? r
          : { ...r, clientId, status: "idle", message: undefined },
      ),
    );
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
    const touchedClientIds = new Set<string>();

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
          touchedClientIds.add(row.clientId);
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
        ...[...touchedClientIds].map((cid) =>
          queryClient.invalidateQueries({
            queryKey: getGetClientCrawlSnapshotsQueryKey(Number(cid)),
          }),
        ),
      ]);
    } finally {
      setBusy(false);
    }
  };

  const doneCount = rows.filter((r) => r.status === "done").length;
  const masterClientName = clients.find(
    (c) => String(c.id) === masterClientId,
  )?.name;

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
              Upload de maandelijkse Screaming Frog-export per klant. De laatste
              crawl wordt op de klantfiche bewaard en meegelezen door de
              SEO-specialist; elke crawl komt ook in de historiek zodat je maand
              na maand kan vergelijken.
            </p>
          </header>
        </Reveal>

        {/* Instructions */}
        <Reveal>
          <section className="mb-10 border border-foreground/20 bg-card">
            <div className="border-b border-foreground/15 px-5 py-3">
              <h2 className="font-['Space_Mono'] text-[11px] uppercase tracking-widest">
                Zo maak je de export — elke maand identiek
              </h2>
            </div>
            <ol className="px-5 py-4 space-y-2 text-sm text-muted-foreground list-decimal list-inside marker:text-foreground/40 marker:font-['Space_Mono']">
              <li>
                Open Screaming Frog SEO Spider (desktop, jouw licentie) en zet de
                modus op <span className="text-foreground">Mode → Spider</span>.
              </li>
              <li>
                Plak de volledige domeinnaam (bv.{" "}
                <span className="text-foreground">https://www.klant.be</span>) en
                laat de crawl <span className="text-foreground">volledig</span>{" "}
                aflopen (100%).
              </li>
              <li>
                Houd de <span className="text-foreground">configuratie constant</span>{" "}
                tussen maanden: dezelfde Configuration → Spider-instellingen,
                dezelfde JavaScript-rendering en respect voor robots.txt. Wijzig
                deze niet — anders is de vergelijking met vorige maanden niet
                eerlijk.
              </li>
              <li>
                Ga naar het tabblad <span className="text-foreground">Internal</span>{" "}
                en zet het filter op <span className="text-foreground">All</span>.
              </li>
              <li>
                Klik op <span className="text-foreground">Export</span> (boven de
                tabel) en bewaar als <span className="text-foreground">CSV</span>.
                Eén CSV-bestand per website.
              </li>
              <li>
                Kies hieronder de klant en de crawldatum, voeg het CSV-bestand
                toe en klik op uploaden.
              </li>
            </ol>
            <p className="px-5 pb-4 text-xs text-muted-foreground/80">
              De brain leest enkel deze{" "}
              <span className="text-foreground/80">Internal: All</span>-export.
              Kleine versieverschillen in Screaming Frog zijn geen probleem;
              dezelfde crawl-instellingen aanhouden wel — die maken de historiek
              vergelijkbaar.
            </p>
          </section>
        </Reveal>

        {/* Controls */}
        <Reveal>
          <section className="mb-6 flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                Klant (voor alle bestanden)
              </label>
              <select
                value={masterClientId}
                onChange={(e) => setMaster(e.target.value)}
                disabled={isLoading || busy}
                className="border border-foreground bg-card px-3 py-2 font-['Space_Mono'] text-xs disabled:opacity-50"
                data-testid="select-master-client"
              >
                <option value="">Kies klant…</option>
                {clients.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

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
                {busy ? "Bezig..." : `Upload ${pending.length || ""}`.trim()}
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
                Kies een klant, voeg de Screaming Frog CSV-export toe en upload.
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

        {/* History / comparison */}
        <Reveal>
          <CrawlHistory
            clientId={masterClientId}
            clientName={masterClientName}
          />
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

function CrawlHistory({
  clientId,
  clientName,
}: {
  clientId: string;
  clientName?: string;
}) {
  const enabled = clientId !== "";
  const { data, isLoading, isError } = useGetClientCrawlSnapshots(
    Number(clientId),
    {
      query: {
        enabled,
        queryKey: getGetClientCrawlSnapshotsQueryKey(Number(clientId)),
      },
    },
  );

  const snapshots: CrawlSnapshot[] = data?.snapshots ?? [];

  return (
    <section className="mt-12 border border-foreground/20 bg-card">
      <div className="flex items-center gap-2 border-b border-foreground/15 px-5 py-3">
        <History className="h-3.5 w-3.5 text-foreground/50" />
        <h2 className="font-['Space_Mono'] text-[11px] uppercase tracking-widest">
          Historiek {clientName ? `— ${clientName}` : ""}
        </h2>
      </div>

      {!enabled ? (
        <p className="px-5 py-6 text-sm text-muted-foreground/80">
          Kies hierboven een klant om de crawl-historiek en de vergelijking met
          vorige maanden te zien.
        </p>
      ) : isLoading ? (
        <p className="flex items-center gap-2 px-5 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Historiek laden…
        </p>
      ) : isError ? (
        <p className="px-5 py-6 text-sm text-destructive">
          Kon de historiek niet laden.
        </p>
      ) : snapshots.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground/80">
          Nog geen crawls bewaard voor deze klant. Upload de eerste export om de
          historiek op te bouwen.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-right">
            <thead>
              <tr className="border-b border-foreground/15">
                <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                  Crawl
                </th>
                {METRICS.map((m) => (
                  <th
                    key={m.key}
                    className="whitespace-nowrap px-3 py-2 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground"
                  >
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snap, i) => {
                const prev = snapshots[i + 1];
                return (
                  <tr
                    key={snap.id}
                    className="border-b border-foreground/10 last:border-0"
                    data-testid={`snapshot-${snap.id}`}
                  >
                    <td className="sticky left-0 z-10 bg-card px-4 py-2.5 text-left font-['Space_Mono'] text-xs">
                      {fmtDate(snap.crawledAt)}
                      {i === 0 && (
                        <span className="ml-2 font-['Space_Mono'] text-[9px] uppercase tracking-widest text-[hsl(var(--accent))]">
                          laatste
                        </span>
                      )}
                    </td>
                    {METRICS.map((m) => {
                      const value = snap.stats[m.key];
                      const delta = prev
                        ? value - prev.stats[m.key]
                        : null;
                      return (
                        <td
                          key={m.key}
                          className="whitespace-nowrap px-3 py-2.5 font-['Space_Mono'] text-xs tabular-nums"
                        >
                          <span>{nf.format(value)}</span>
                          <Delta delta={delta} lowerIsBetter={m.lowerIsBetter} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 py-3 text-[11px] text-muted-foreground/70">
            Het kleine getal toont de verandering t.o.v. de vorige crawl. Voor
            probleemtellers is een daling{" "}
            <span className="text-[hsl(var(--accent))]">groen</span> (beter) en
            een stijging <span className="text-destructive">rood</span>.
          </p>
        </div>
      )}
    </section>
  );
}

function Delta({
  delta,
  lowerIsBetter,
}: {
  delta: number | null;
  lowerIsBetter: boolean | null;
}) {
  if (delta === null || delta === 0) return null;
  const improved = lowerIsBetter === null ? null : delta < 0 === lowerIsBetter;
  const color =
    improved === null
      ? "text-muted-foreground/70"
      : improved
        ? "text-[hsl(var(--accent))]"
        : "text-destructive";
  const Arrow = delta < 0 ? ArrowDown : ArrowUp;
  return (
    <span
      className={`ml-1.5 inline-flex items-center gap-0.5 text-[10px] ${color}`}
    >
      <Arrow className="h-2.5 w-2.5" />
      {nf.format(Math.abs(delta))}
    </span>
  );
}
