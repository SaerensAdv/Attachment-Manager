import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetClients,
  useCreateShoppingRun,
  useListShoppingRuns,
  useGetShoppingRun,
  useSaveShoppingDecisions,
  useGetShoppingSettings,
  useUpdateShoppingSettings,
  useApplyShoppingNegatives,
  getListShoppingRunsQueryKey,
  getGetShoppingRunQueryKey,
  getGetShoppingSettingsQueryKey,
  type ShoppingScore,
  type ShoppingDecision,
  type ShoppingRun,
  type ShoppingApplyResult,
  type ShoppingApplyOutcome,
} from "@workspace/api-client-react";
import {
  Loader2,
  Search,
  ShieldCheck,
  ShieldAlert,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Ban,
  Check,
  Play,
  Radio,
  Package,
} from "lucide-react";
import Reveal from "@/components/Reveal";

type MatchType = "EXACT" | "PHRASE" | "BROAD";
type Choice = "exclude" | "keep";

interface RowState {
  choice: Choice;
  matchType: MatchType;
}

const MATCH_TYPES: MatchType[] = ["EXACT", "PHRASE", "BROAD"];

// Mirrors MAX_NEGATIVE_OPS in the apply route: the endpoint hard-rejects more
// than this per call, so a run with many excludes is applied in sequential
// batches instead of hitting a dead-end.
const APPLY_BATCH_SIZE = 50;

const eur = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});
const nf = new Intl.NumberFormat("nl-BE");

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat("nl-BE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const data = (err as { data?: { error?: unknown; detail?: unknown } }).data;
    if (data && typeof data === "object") {
      const error = typeof data.error === "string" ? data.error.trim() : "";
      if (error) return error;
    }
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }
  return "Er ging iets mis. Probeer het opnieuw.";
}

const VERDICT_LABEL: Record<string, string> = {
  keep: "Behouden",
  review: "Nakijken",
  exclude: "Uitsluiten",
};

function verdictClass(verdict: string): string {
  if (verdict === "exclude") return "border-destructive text-destructive";
  if (verdict === "review") return "border-amber-700 text-amber-700";
  return "border-green-700 text-green-700";
}

const APPLY_STATUS_LABEL: Record<string, string> = {
  created: "Toegevoegd",
  duplicate: "Bestond al",
  failed: "Mislukt",
  skipped: "Overgeslagen",
};

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Zoektermen() {
  const queryClient = useQueryClient();
  const { data: clientData, isLoading: clientsLoading } = useGetClients();

  const clients = useMemo(
    () =>
      [...(clientData?.clients ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name, "nl"),
      ),
    [clientData],
  );

  const [clientId, setClientId] = useState<number | null>(null);
  const [runId, setRunId] = useState<number | null>(null);
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [applyResult, setApplyResult] = useState<ShoppingApplyResult | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [confirmWrite, setConfirmWrite] = useState(false);

  const clientEnabled = clientId !== null;
  const runEnabled = runId !== null;

  const runsQuery = useListShoppingRuns(clientId ?? 0, {
    query: {
      enabled: clientEnabled,
      queryKey: getListShoppingRunsQueryKey(clientId ?? 0),
    },
  });
  const runs: ShoppingRun[] = runsQuery.data?.runs ?? [];

  const runQuery = useGetShoppingRun(runId ?? 0, {
    query: {
      enabled: runEnabled,
      queryKey: getGetShoppingRunQueryKey(runId ?? 0),
    },
  });
  const run = runQuery.data?.run ?? null;
  const scores: ShoppingScore[] = useMemo(
    () => runQuery.data?.scores ?? [],
    [runQuery.data],
  );
  const savedDecisions: ShoppingDecision[] = useMemo(
    () => runQuery.data?.decisions ?? [],
    [runQuery.data],
  );

  const settingsQuery = useGetShoppingSettings(clientId ?? 0, {
    query: {
      enabled: clientEnabled,
      queryKey: getGetShoppingSettingsQueryKey(clientId ?? 0),
    },
  });
  const writeEnabled = settingsQuery.data?.writeEnabled ?? false;

  const createMut = useCreateShoppingRun();
  const saveMut = useSaveShoppingDecisions();
  const settingsMut = useUpdateShoppingSettings();
  const applyMut = useApplyShoppingNegatives();

  // Seed the editable rows from the loaded run: a saved decision wins, otherwise
  // the score's own verdict pre-selects exclude vs keep so the operator starts
  // from the tool's best guess.
  useEffect(() => {
    if (!runQuery.data) return;
    const savedByScore = new Map<number, ShoppingDecision>();
    for (const d of savedDecisions) savedByScore.set(d.scoreId, d);
    const next: Record<number, RowState> = {};
    for (const s of scores) {
      const saved = savedByScore.get(s.id);
      if (saved) {
        next[s.id] = {
          choice: saved.decision === "keep" ? "keep" : "exclude",
          matchType: saved.matchType,
        };
      } else {
        next[s.id] = {
          choice: s.verdict === "exclude" ? "exclude" : "keep",
          matchType: s.suggestedMatchType,
        };
      }
    }
    setRows(next);
    setApplyResult(null);
    setActionError(null);
    setConfirmWrite(false);
  }, [runQuery.data, scores, savedDecisions]);

  const appliedByScore = useMemo(() => {
    const m = new Map<number, ShoppingDecision>();
    for (const d of savedDecisions) {
      if (d.status === "applied") m.set(d.scoreId, d);
    }
    return m;
  }, [savedDecisions]);

  const selectClient = (value: string) => {
    const id = Number(value);
    setClientId(Number.isFinite(id) && id > 0 ? id : null);
    setRunId(null);
    setRows({});
    setApplyResult(null);
    setActionError(null);
    setSavedNote(null);
  };

  const handleAnalyse = () => {
    if (clientId === null) return;
    setActionError(null);
    setSavedNote(null);
    createMut.mutate(
      { id: clientId },
      {
        onSuccess: (data) => {
          setRunId(data.run.id);
          queryClient.invalidateQueries({
            queryKey: getListShoppingRunsQueryKey(clientId),
          });
        },
        onError: (err) => setActionError(errorMessage(err)),
      },
    );
  };

  const setChoice = (scoreId: number, choice: Choice) =>
    setRows((prev) => ({
      ...prev,
      [scoreId]: { ...prev[scoreId], choice },
    }));

  const setMatchType = (scoreId: number, matchType: MatchType) =>
    setRows((prev) => ({
      ...prev,
      [scoreId]: { ...prev[scoreId], matchType },
    }));

  const handleSave = () => {
    if (runId === null) return;
    setActionError(null);
    setSavedNote(null);
    const decisions = scores.map((s) => ({
      scoreId: s.id,
      decision: rows[s.id]?.choice ?? "keep",
      matchType: rows[s.id]?.matchType ?? s.suggestedMatchType,
    }));
    saveMut.mutate(
      { runId, data: { decisions } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetShoppingRunQueryKey(runId),
          });
          setSavedNote("Beslissingen bewaard.");
        },
        onError: (err) => setActionError(errorMessage(err)),
      },
    );
  };

  // Which saved-decision ids are excludes that have not yet been applied — the
  // apply endpoint works off persisted decisions, so we always save first.
  const pendingExcludeIds = useMemo(
    () =>
      savedDecisions
        .filter((d) => d.decision === "exclude" && d.status !== "applied")
        .map((d) => d.id),
    [savedDecisions],
  );

  const runApply = async (validateOnly: boolean) => {
    if (clientId === null || pendingExcludeIds.length === 0) return;
    setActionError(null);
    setApplyResult(null);

    // Chunk to the endpoint's per-call cap so a run with many excludes is not a
    // dead-end: apply sequentially and merge the outcomes into one panel.
    const batches: number[][] = [];
    for (let i = 0; i < pendingExcludeIds.length; i += APPLY_BATCH_SIZE) {
      batches.push(pendingExcludeIds.slice(i, i + APPLY_BATCH_SIZE));
    }

    const merged: ShoppingApplyOutcome[] = [];
    let batchError: string | null = null;
    try {
      for (const batch of batches) {
        const data = await applyMut.mutateAsync({
          id: clientId,
          data: { decisionIds: batch, validateOnly },
        });
        merged.push(...data.results);
        // A real-write batch that reports an error is batch-fatal (auth/quota/
        // network): stop before the next batch hits the same wall.
        if (data.error) {
          batchError = data.error;
          break;
        }
      }
    } catch (err) {
      // A 502 carries a ShoppingApplyResult body with per-op detail.
      const data = (err as { data?: unknown }).data as
        | ShoppingApplyResult
        | undefined;
      if (data && Array.isArray(data.results)) merged.push(...data.results);
      batchError = errorMessage(err);
    }

    setApplyResult({ validateOnly, results: merged, error: batchError });
    if (batchError) setActionError(batchError);
    if (!validateOnly) {
      queryClient.invalidateQueries({
        queryKey: getGetShoppingRunQueryKey(runId ?? 0),
      });
      setConfirmWrite(false);
    }
  };

  const toggleWrite = () => {
    if (clientId === null) return;
    const next = !writeEnabled;
    settingsMut.mutate(
      { id: clientId, data: { writeEnabled: next } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetShoppingSettingsQueryKey(clientId),
          });
          if (!next) setConfirmWrite(false);
        },
        onError: (err) => setActionError(errorMessage(err)),
      },
    );
  };

  const handleExportCsv = () => {
    if (!run || scores.length === 0) return;
    const header = [
      "Advertentiegroep",
      "Campagne",
      "Zoekterm",
      "Oordeel",
      "Score",
      "Beslissing",
      "Matchtype",
      "Reeds uitgesloten",
      "Producten",
      "Kosten",
      "Klikken",
      "Conversies",
      "Advies",
      "Reden",
    ];
    const lines = scores.map((s) => {
      const r = rows[s.id];
      return [
        s.adGroupName,
        s.campaignName,
        s.term,
        VERDICT_LABEL[s.verdict] ?? s.verdict,
        s.score,
        r ? (r.choice === "exclude" ? "Uitsluiten" : "Behouden") : "",
        r?.matchType ?? s.suggestedMatchType,
        s.alreadyExcluded ? "ja" : "nee",
        s.matchedProducts.join(" | "),
        s.cost.toFixed(2),
        s.clicks,
        s.conversions,
        s.advice,
        s.reason,
      ]
        .map(csvEscape)
        .join(",");
    });
    const csv = [header.map(csvEscape).join(","), ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const name = (run ? clients.find((c) => c.id === run.clientId)?.name : "")
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    a.href = url;
    a.download = `zoektermen-${name || "analyse"}-${run.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const excludeCount = useMemo(
    () => Object.values(rows).filter((r) => r.choice === "exclude").length,
    [rows],
  );

  // Group scores per ad group for a scannable, product-anchored layout.
  const groups = useMemo(() => {
    const byGroup = new Map<
      string,
      { name: string; campaign: string; items: ShoppingScore[] }
    >();
    for (const s of scores) {
      const g = byGroup.get(s.adGroupId);
      if (g) g.items.push(s);
      else
        byGroup.set(s.adGroupId, {
          name: s.adGroupName,
          campaign: s.campaignName,
          items: [s],
        });
    }
    return [...byGroup.entries()].map(([adGroupId, g]) => ({
      adGroupId,
      ...g,
    }));
  }, [scores]);

  const productsByGroup = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const g of run?.adGroups ?? []) {
      m.set(
        g.adGroupId,
        g.products.map((p) => p.title).filter(Boolean),
      );
    }
    return m;
  }, [run]);

  const busy =
    createMut.isPending ||
    saveMut.isPending ||
    applyMut.isPending ||
    settingsMut.isPending;

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground font-['Inter']">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-20 pb-16">
        {/* Masthead */}
        <Reveal>
          <header className="border-b-2 border-foreground pb-5 mb-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
                  Saerens Advertising — Shopping
                </p>
                <h1 className="font-['Playfair_Display'] font-black text-3xl sm:text-4xl md:text-5xl uppercase tracking-tight leading-none">
                  Zoektermen
                </h1>
              </div>
            </div>
            <p className="font-['Inter'] text-sm text-muted-foreground mt-5 max-w-2xl">
              Analyseer per Shopping-advertentiegroep welke zoektermen niet bij
              de producten passen en sluit ze uit. Standaard draait alles als
              proefcontrole — er wordt niets naar Google Ads geschreven tenzij je
              dat per klant expliciet aanzet.
            </p>
          </header>
        </Reveal>

        {/* Control bar */}
        <div className="border border-foreground bg-card p-4 sm:p-5 mb-8 shadow-[4px_4px_0px_hsl(var(--foreground))]">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1 min-w-0">
              <label
                htmlFor="client"
                className="block font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-2"
              >
                Klant
              </label>
              <select
                id="client"
                data-testid="select-client"
                value={clientId ?? ""}
                onChange={(e) => selectClient(e.target.value)}
                disabled={clientsLoading}
                className="w-full border border-foreground bg-background px-3 py-2.5 font-['Inter'] text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">
                  {clientsLoading ? "Klanten laden..." : "Kies een klant"}
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleAnalyse}
              disabled={clientId === null || createMut.isPending}
              data-testid="button-analyse"
              className="inline-flex items-center justify-center gap-2 border border-foreground bg-foreground text-background px-5 py-2.5 font-['Space_Mono'] text-[11px] uppercase tracking-widest hover:bg-accent hover:border-accent transition-colors disabled:opacity-40"
            >
              {createMut.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Analyseer zoektermen
            </button>
          </div>

          {createMut.isPending && (
            <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mt-3">
              Live Shopping-data ophalen en scoren — dit kan even duren...
            </p>
          )}

          {/* Past runs */}
          {clientEnabled && runs.length > 0 && (
            <div className="mt-4 pt-4 border-t border-foreground/20">
              <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Eerdere analyses
              </p>
              <div className="flex flex-wrap gap-2">
                {runs.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRunId(r.id)}
                    data-testid={`run-chip-${r.id}`}
                    className={`font-['Space_Mono'] text-[10px] uppercase tracking-widest px-2.5 py-1 border transition-colors ${
                      runId === r.id
                        ? "bg-foreground text-background border-foreground"
                        : "border-foreground/40 text-muted-foreground hover:border-foreground hover:text-foreground"
                    }`}
                  >
                    {formatDate(r.createdAt)} · {r.termCount} termen
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {actionError && (
          <div
            data-testid="action-error"
            className="flex items-start gap-3 border border-destructive bg-destructive/5 px-4 py-3 mb-6"
          >
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{actionError}</p>
          </div>
        )}

        {/* Empty state */}
        {runId === null && !createMut.isPending && (
          <div className="flex flex-col items-center justify-center gap-4 text-center border border-dashed border-foreground/30 bg-card py-24 px-6">
            <Search className="w-8 h-8 text-foreground/20" />
            <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
              Nog geen analyse geopend
            </p>
            <p className="text-sm text-muted-foreground max-w-sm font-['Inter']">
              Kies een klant en start een analyse, of open een eerdere analyse
              hierboven.
            </p>
          </div>
        )}

        {/* Run detail */}
        {runId !== null && runQuery.isLoading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
          </div>
        )}

        {run && !runQuery.isLoading && (
          <div className="flex flex-col gap-6">
            {/* Summary + write switch */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
              <div className="border border-foreground bg-card p-5">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div>
                    <div className="font-['Playfair_Display'] font-black text-2xl leading-none">
                      {nf.format(run.termCount)}
                    </div>
                    <div className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                      Zoektermen
                    </div>
                  </div>
                  <div>
                    <div className="font-['Playfair_Display'] font-black text-2xl leading-none">
                      {nf.format(run.adGroupCount)}
                    </div>
                    <div className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                      Advertentiegroepen
                    </div>
                  </div>
                  <div>
                    <div className="font-['Playfair_Display'] font-black text-2xl leading-none text-destructive">
                      {nf.format(excludeCount)}
                    </div>
                    <div className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                      Aangevinkt om uit te sluiten
                    </div>
                  </div>
                  <div className="ml-auto font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                    {formatDate(run.createdAt)}
                  </div>
                </div>
                {run.warnings.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-foreground/20 flex flex-col gap-1">
                    {run.warnings.map((w, i) => (
                      <p
                        key={i}
                        className="flex items-start gap-2 text-xs text-amber-700"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        {w}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Per-client live-write switch */}
              <div
                className={`border p-5 flex flex-col justify-between gap-3 min-w-[16rem] ${
                  writeEnabled
                    ? "border-destructive bg-destructive/5"
                    : "border-foreground bg-card"
                }`}
              >
                <div className="flex items-start gap-2">
                  {writeEnabled ? (
                    <ShieldAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-green-700 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest">
                      Live schrijven
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {writeEnabled
                        ? "Aan — uitsluitingen kunnen echt naar Google Ads."
                        : "Uit — enkel proefcontrole mogelijk."}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleWrite}
                  disabled={settingsMut.isPending}
                  data-testid="toggle-write"
                  className={`inline-flex items-center justify-center gap-2 border px-3 py-2 font-['Space_Mono'] text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40 ${
                    writeEnabled
                      ? "border-foreground text-foreground hover:bg-foreground hover:text-background"
                      : "border-destructive text-destructive hover:bg-destructive hover:text-white"
                  }`}
                >
                  {settingsMut.isPending && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  {writeEnabled ? "Zet uit" : "Zet aan"}
                </button>
              </div>
            </div>

            {/* Action bar */}
            <div className="flex flex-wrap items-center gap-3 border-y border-foreground/20 py-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saveMut.isPending || scores.length === 0}
                data-testid="button-save"
                className="inline-flex items-center gap-2 border border-foreground bg-foreground text-background px-4 py-2 font-['Space_Mono'] text-[10px] uppercase tracking-widest hover:bg-accent hover:border-accent transition-colors disabled:opacity-40"
              >
                {saveMut.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                Bewaar beslissingen
              </button>

              <button
                type="button"
                onClick={() => runApply(true)}
                disabled={applyMut.isPending || pendingExcludeIds.length === 0}
                data-testid="button-dryrun"
                title={
                  pendingExcludeIds.length === 0
                    ? "Bewaar eerst uitsluitingen om te controleren."
                    : undefined
                }
                className="inline-flex items-center gap-2 border border-foreground px-4 py-2 font-['Space_Mono'] text-[10px] uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors disabled:opacity-40"
              >
                {applyMut.isPending && applyResult === null ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
                Proefcontrole ({pendingExcludeIds.length})
              </button>

              {!confirmWrite ? (
                <button
                  type="button"
                  onClick={() => setConfirmWrite(true)}
                  disabled={
                    !writeEnabled ||
                    applyMut.isPending ||
                    pendingExcludeIds.length === 0
                  }
                  data-testid="button-apply"
                  title={
                    !writeEnabled
                      ? "Zet 'Live schrijven' aan om toe te passen."
                      : undefined
                  }
                  className="inline-flex items-center gap-2 border border-destructive text-destructive px-4 py-2 font-['Space_Mono'] text-[10px] uppercase tracking-widest hover:bg-destructive hover:text-white transition-colors disabled:opacity-40"
                >
                  <Radio className="w-3.5 h-3.5" />
                  Toepassen op Google Ads
                </button>
              ) : (
                <div className="inline-flex items-center gap-2 border border-destructive bg-destructive/5 pl-3 pr-1 py-1">
                  <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-destructive">
                    Zeker? {pendingExcludeIds.length} live uitsluiten
                  </span>
                  <button
                    type="button"
                    onClick={() => runApply(false)}
                    disabled={applyMut.isPending}
                    data-testid="button-apply-confirm"
                    className="inline-flex items-center gap-1 border border-destructive bg-destructive text-white px-3 py-1.5 font-['Space_Mono'] text-[10px] uppercase tracking-widest disabled:opacity-40"
                  >
                    {applyMut.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    Ja, schrijf
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmWrite(false)}
                    className="px-2 py-1.5 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
                  >
                    Annuleer
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleExportCsv}
                disabled={scores.length === 0}
                data-testid="button-export"
                className="inline-flex items-center gap-2 border border-foreground/40 text-muted-foreground px-4 py-2 font-['Space_Mono'] text-[10px] uppercase tracking-widest hover:border-foreground hover:text-foreground transition-colors disabled:opacity-40 ml-auto"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
            </div>

            {savedNote && (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4" />
                {savedNote}
              </div>
            )}

            {/* Apply outcome */}
            {applyResult && (
              <ApplyResultPanel result={applyResult} />
            )}

            {/* Scored terms grouped by ad group */}
            {scores.length === 0 ? (
              <div className="border border-dashed border-foreground/30 bg-card py-16 text-center">
                <p className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                  Geen zoektermen gevonden in deze analyse
                </p>
                <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                  Dit account heeft mogelijk geen Shopping-campagnes met
                  zoektermdata in de laatste 30 dagen.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {groups.map((g) => {
                  const products = productsByGroup.get(g.adGroupId) ?? [];
                  return (
                    <div key={g.adGroupId}>
                      <div className="border-b-2 border-foreground pb-2 mb-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <h3 className="font-['Playfair_Display'] font-bold text-lg leading-tight truncate">
                            {g.name}
                          </h3>
                          <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">
                            {g.campaign}
                          </span>
                        </div>
                        {products.length > 0 && (
                          <p className="flex items-start gap-2 text-xs text-muted-foreground mt-1.5">
                            <Package className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span className="line-clamp-2">
                              {products.slice(0, 8).join(" · ")}
                              {products.length > 8
                                ? ` +${products.length - 8}`
                                : ""}
                            </span>
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col divide-y divide-foreground/10 border border-foreground/20">
                        {g.items.map((s) => {
                          const rowState = rows[s.id];
                          const applied = appliedByScore.get(s.id);
                          return (
                            <div
                              key={s.id}
                              data-testid={`term-row-${s.id}`}
                              className="flex flex-col md:flex-row md:items-center gap-3 px-3 py-3"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-['Inter'] font-medium text-sm break-words">
                                    {s.term}
                                  </span>
                                  <span
                                    className={`font-['Space_Mono'] text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${verdictClass(
                                      s.verdict,
                                    )}`}
                                  >
                                    {VERDICT_LABEL[s.verdict] ?? s.verdict} ·{" "}
                                    {s.score}
                                  </span>
                                  {s.alreadyExcluded && (
                                    <span className="font-['Space_Mono'] text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-foreground/40 text-muted-foreground">
                                      Reeds uitgesloten
                                    </span>
                                  )}
                                  {applied && (
                                    <span className="inline-flex items-center gap-1 font-['Space_Mono'] text-[9px] uppercase tracking-widest px-1.5 py-0.5 border border-green-700 text-green-700">
                                      <CheckCircle2 className="w-3 h-3" />
                                      Toegepast
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {s.advice || s.reason}
                                </p>
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
                                  <span>{eur.format(s.cost)}</span>
                                  <span>{nf.format(s.clicks)} klikken</span>
                                  <span>
                                    {nf.format(s.conversions)} conv.
                                  </span>
                                  {s.matchedProducts.length > 0 && (
                                    <span className="normal-case tracking-normal">
                                      ↔ {s.matchedProducts.slice(0, 3).join(", ")}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Decision controls */}
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="inline-flex border border-foreground">
                                  <button
                                    type="button"
                                    onClick={() => setChoice(s.id, "keep")}
                                    disabled={!!applied}
                                    data-testid={`keep-${s.id}`}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 font-['Space_Mono'] text-[10px] uppercase tracking-widest transition-colors disabled:opacity-40 ${
                                      rowState?.choice === "keep"
                                        ? "bg-green-700 text-white"
                                        : "text-foreground hover:bg-foreground/5"
                                    }`}
                                  >
                                    <Check className="w-3 h-3" />
                                    Behoud
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setChoice(s.id, "exclude")}
                                    disabled={!!applied}
                                    data-testid={`exclude-${s.id}`}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 font-['Space_Mono'] text-[10px] uppercase tracking-widest border-l border-foreground transition-colors disabled:opacity-40 ${
                                      rowState?.choice === "exclude"
                                        ? "bg-destructive text-white"
                                        : "text-foreground hover:bg-foreground/5"
                                    }`}
                                  >
                                    <Ban className="w-3 h-3" />
                                    Sluit uit
                                  </button>
                                </div>
                                <select
                                  value={
                                    rowState?.matchType ?? s.suggestedMatchType
                                  }
                                  onChange={(e) =>
                                    setMatchType(
                                      s.id,
                                      e.target.value as MatchType,
                                    )
                                  }
                                  disabled={
                                    rowState?.choice !== "exclude" || !!applied
                                  }
                                  data-testid={`matchtype-${s.id}`}
                                  className="border border-foreground bg-background px-2 py-1.5 font-['Space_Mono'] text-[10px] uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-40"
                                >
                                  {MATCH_TYPES.map((m) => (
                                    <option key={m} value={m}>
                                      {m}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ApplyResultPanel({ result }: { result: ShoppingApplyResult }) {
  const created = result.results.filter((r) => r.status === "created").length;
  const duplicate = result.results.filter(
    (r) => r.status === "duplicate",
  ).length;
  const failed = result.results.filter((r) => r.status === "failed").length;
  const skipped = result.results.filter((r) => r.status === "skipped").length;

  return (
    <div
      data-testid="apply-result"
      className={`border p-4 ${
        result.validateOnly
          ? "border-foreground bg-card"
          : failed > 0
            ? "border-destructive bg-destructive/5"
            : "border-green-700 bg-green-700/5"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        {result.validateOnly ? (
          <ShieldCheck className="w-4 h-4" />
        ) : failed > 0 ? (
          <XCircle className="w-4 h-4 text-destructive" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-green-700" />
        )}
        <p className="font-['Space_Mono'] text-[11px] uppercase tracking-widest">
          {result.validateOnly
            ? "Proefcontrole — niets geschreven"
            : "Toegepast op Google Ads"}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
        <span className="text-green-700">
          {created} {result.validateOnly ? "geldig" : "toegevoegd"}
        </span>
        {duplicate > 0 && <span>{duplicate} bestond al</span>}
        {skipped > 0 && <span>{skipped} overgeslagen</span>}
        {failed > 0 && (
          <span className="text-destructive">{failed} mislukt</span>
        )}
      </div>
      <div className="flex flex-col gap-1 max-h-64 overflow-auto">
        {result.results.map((r: ShoppingApplyOutcome) => (
          <div
            key={r.decisionId}
            className="flex items-center gap-2 text-xs py-0.5"
          >
            <span
              className={`font-['Space_Mono'] text-[9px] uppercase tracking-widest px-1.5 py-0.5 border shrink-0 ${
                r.status === "failed"
                  ? "border-destructive text-destructive"
                  : r.status === "created"
                    ? "border-green-700 text-green-700"
                    : "border-foreground/40 text-muted-foreground"
              }`}
            >
              {APPLY_STATUS_LABEL[r.status] ?? r.status}
            </span>
            <span className="font-medium truncate">{r.term}</span>
            {r.error && (
              <span className="text-destructive truncate">— {r.error}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
