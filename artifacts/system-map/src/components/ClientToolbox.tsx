import { useEffect, useMemo, useState } from "react";
import {
  useGetClientsCoverage,
  getGetClientsCoverageQueryKey,
  useGetClientsDiscovery,
  getGetClientsDiscoveryQueryKey,
  useApplyClientsDiscovery,
  useClientRefreshAll,
  type Client,
  type DiscoveryEnrichment,
  type DiscoveryNewClient,
  type RefreshOutcome,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  RefreshCw,
  LayoutGrid,
  Check,
  AlertTriangle,
} from "lucide-react";

/** Human, Dutch label per integration key (matches the coverage payload). */
const INTEGRATION_LABELS: Record<string, string> = {
  googleAds: "Google Ads",
  competitorAds: "Concurrent-ads",
  searchConsole: "Search Console",
  bing: "Bing Webmaster",
  ga4: "GA4",
  places: "Maps / Places",
  pagespeed: "PageSpeed",
  businessProfile: "Bedrijfsprofiel",
  websiteIntake: "Website-intake",
};
const INTEGRATION_ORDER = Object.keys(INTEGRATION_LABELS);

const FIELD_LABELS: Record<string, string> = {
  googleAdsCustomerId: "Google Ads ID",
  searchConsoleSiteUrl: "Search Console-property",
};

type Tab = "coverage" | "refresh" | "discovery" | null;

type RefreshRow = {
  id: number;
  name: string;
  outcomes?: RefreshOutcome[];
  error?: string;
};

/** Editable copy of a new-client candidate plus whether it's ticked. */
type NewClientDraft = {
  key: string;
  selected: boolean;
  name: string;
  googleAdsCustomerId: string;
  searchConsoleSiteUrl: string;
  website: string;
  source: DiscoveryNewClient["source"];
  reason: string;
};

const monoLabel =
  "font-['Space_Mono'] text-[10px] uppercase tracking-widest";

function TabButton({
  active,
  onClick,
  icon,
  children,
  testid,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  testid: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`flex items-center gap-2 px-4 py-2.5 border-2 border-foreground ${monoLabel} transition-all ${
        active
          ? "bg-foreground text-background"
          : "bg-card hover:bg-foreground hover:text-background"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

export default function ClientToolbox({
  clients,
  onChanged,
}: {
  clients: Client[];
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>(null);

  // ---- Coverage -------------------------------------------------------------
  const coverageQuery = useGetClientsCoverage({
    query: {
      enabled: tab === "coverage",
      queryKey: getGetClientsCoverageQueryKey(),
    },
  });

  // ---- Bulk refresh ---------------------------------------------------------
  const refreshMut = useClientRefreshAll();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDone, setRefreshDone] = useState(0);
  const [refreshRows, setRefreshRows] = useState<RefreshRow[]>([]);

  const runRefreshAll = async () => {
    setRefreshing(true);
    setRefreshDone(0);
    setRefreshRows([]);
    // Sequential on purpose: keeps each request short and respects the
    // upstream Google API rate limits instead of firing them all at once.
    for (const c of clients) {
      try {
        const res = await refreshMut.mutateAsync({ id: c.id });
        setRefreshRows((r) => [
          ...r,
          { id: c.id, name: c.name, outcomes: res.outcomes },
        ]);
      } catch (err) {
        setRefreshRows((r) => [
          ...r,
          {
            id: c.id,
            name: c.name,
            error: err instanceof Error ? err.message : String(err),
          },
        ]);
      }
      setRefreshDone((d) => d + 1);
    }
    setRefreshing(false);
    onChanged();
  };

  // ---- Discovery ------------------------------------------------------------
  const discoveryQuery = useGetClientsDiscovery({
    query: {
      enabled: tab === "discovery",
      queryKey: getGetClientsDiscoveryQueryKey(),
    },
  });
  const applyMut = useApplyClientsDiscovery();

  const [enrichSel, setEnrichSel] = useState<Record<number, boolean>>({});
  const [drafts, setDrafts] = useState<NewClientDraft[]>([]);
  const [applyResult, setApplyResult] = useState<{
    enriched: number;
    created: number;
    errors: string[];
  } | null>(null);

  // Seed selections from a fresh discovery payload. Enrichments are pre-checked
  // (confident domain match); Ads candidates pre-checked, SC-only ones not
  // (noisier — the agency owns many verified domains itself).
  const discoveryData = discoveryQuery.data;
  useEffect(() => {
    if (!discoveryData) return;
    const e: Record<number, boolean> = {};
    discoveryData.enrichments.forEach((_, i) => (e[i] = true));
    setEnrichSel(e);
    setDrafts(
      discoveryData.newClients.map((n) => ({
        key: n.key,
        selected: n.source === "google-ads",
        name: n.suggestedName,
        googleAdsCustomerId: n.googleAdsCustomerId ?? "",
        searchConsoleSiteUrl: n.searchConsoleSiteUrl ?? "",
        website: n.website ?? "",
        source: n.source,
        reason: n.reason,
      })),
    );
    setApplyResult(null);
  }, [discoveryData]);

  const selectedCount = useMemo(() => {
    const enr = Object.values(enrichSel).filter(Boolean).length;
    const nw = drafts.filter((d) => d.selected).length;
    return enr + nw;
  }, [enrichSel, drafts]);

  const updateDraft = (key: string, patch: Partial<NewClientDraft>) =>
    setDrafts((ds) =>
      ds.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    );

  const applyDiscovery = async () => {
    if (!discoveryData) return;
    const enrichments = discoveryData.enrichments
      .map((e, i) => ({ e, i }))
      .filter(({ i }) => enrichSel[i])
      .map(({ e }) => ({
        clientId: e.clientId,
        field: e.field,
        value: e.value,
      }));
    const newClients = drafts
      .filter((d) => d.selected && d.name.trim())
      .map((d) => ({
        name: d.name.trim(),
        googleAdsCustomerId: d.googleAdsCustomerId.trim() || null,
        searchConsoleSiteUrl: d.searchConsoleSiteUrl.trim() || null,
        website: d.website.trim() || null,
      }));
    try {
      const res = await applyMut.mutateAsync({
        data: { enrichments, newClients },
      });
      setApplyResult({
        enriched: res.enriched.length,
        created: res.created.length,
        errors: res.errors,
      });
      onChanged();
      discoveryQuery.refetch();
    } catch (err) {
      setApplyResult({
        enriched: 0,
        created: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  };

  return (
    <div className="border-2 border-foreground bg-card mb-10">
      <div className="flex flex-wrap items-center gap-3 p-4 border-b-2 border-foreground/15">
        <span className={`${monoLabel} text-muted-foreground mr-1`}>
          Atelier
        </span>
        <TabButton
          active={tab === "coverage"}
          onClick={() => setTab(tab === "coverage" ? null : "coverage")}
          icon={<LayoutGrid className="w-3.5 h-3.5" />}
          testid="tab-coverage"
        >
          Dekking
        </TabButton>
        <TabButton
          active={tab === "refresh"}
          onClick={() => setTab(tab === "refresh" ? null : "refresh")}
          icon={<RefreshCw className="w-3.5 h-3.5" />}
          testid="tab-refresh"
        >
          Alles verversen
        </TabButton>
        {/*
          "Klanten ontdekken" (client discovery) is hidden for now — the
          endpoints and panel logic stay wired so it can be re-enabled in a
          later phase without rework. See the Prune & Connect plan.
        */}
      </div>

      {tab === "coverage" && (
        <div className="p-4 overflow-x-auto" data-testid="panel-coverage">
          {coverageQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-6">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className={monoLabel}>Dekking laden…</span>
            </div>
          ) : coverageQuery.error ? (
            <p className="text-sm text-destructive">
              Kon de dekking niet laden.
            </p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${monoLabel} text-left py-2 pr-4`}>Cliënt</th>
                  {INTEGRATION_ORDER.map((k) => (
                    <th
                      key={k}
                      className={`${monoLabel} text-center px-2 py-2 whitespace-nowrap`}
                    >
                      {INTEGRATION_LABELS[k]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(coverageQuery.data?.clients ?? []).map((c) => (
                  <tr
                    key={c.id}
                    className="border-t border-foreground/15"
                    data-testid={`coverage-row-${c.id}`}
                  >
                    <td className="py-2 pr-4 font-['Playfair_Display'] font-bold whitespace-nowrap">
                      {c.name}
                    </td>
                    {INTEGRATION_ORDER.map((k) => {
                      const cov = (
                        c.integrations as Record<
                          string,
                          { configured: boolean; liveAt?: string | null }
                        >
                      )[k];
                      const configured = cov?.configured;
                      const live = cov?.liveAt;
                      return (
                        <td key={k} className="text-center px-2 py-2">
                          {configured ? (
                            <span
                              title={
                                live
                                  ? `Laatst ververst ${new Date(live).toLocaleString("nl-BE")}`
                                  : "Ingesteld, nog niet ververst"
                              }
                              className={`inline-block w-2.5 h-2.5 rounded-full ${
                                live ? "bg-accent" : "bg-foreground/30"
                              }`}
                            />
                          ) : (
                            <span className="inline-block text-foreground/20">
                              –
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-muted-foreground mt-4 font-['Inter']">
            <span className="inline-block w-2 h-2 rounded-full bg-accent mr-1 align-middle" />
            ververst · <span className="inline-block w-2 h-2 rounded-full bg-foreground/30 mx-1 align-middle" />
            ingesteld, nog niet ververst · – niet ingesteld
          </p>
        </div>
      )}

      {tab === "refresh" && (
        <div className="p-4" data-testid="panel-refresh">
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={runRefreshAll}
              disabled={refreshing || clients.length === 0}
              data-testid="button-run-refresh-all"
              className={`flex items-center gap-2 px-5 py-3 bg-foreground text-background border-2 border-foreground ${monoLabel} shadow-[4px_4px_0px_hsl(var(--accent))] hover:bg-accent hover:border-accent active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:pointer-events-none`}
            >
              {refreshing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {refreshing
                ? `Bezig… ${refreshDone}/${clients.length}`
                : "Ververs alle cliënten"}
            </button>
            <p className="text-xs text-muted-foreground font-['Inter'] max-w-md">
              Vernieuwt elke ingestelde koppeling per cliënt, één voor één.
              Mislukte koppelingen blokkeren de rest niet.
            </p>
          </div>

          {refreshRows.length > 0 && (
            <div className="mt-5 flex flex-col gap-3">
              {refreshRows.map((row) => (
                <div
                  key={row.id}
                  className="border border-foreground/15 p-3"
                  data-testid={`refresh-result-${row.id}`}
                >
                  <div className="font-['Playfair_Display'] font-bold mb-1.5">
                    {row.name}
                  </div>
                  {row.error ? (
                    <p className="text-xs text-destructive">{row.error}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {row.outcomes
                        ?.filter((o) => o.status !== "skipped")
                        .map((o) => (
                          <span
                            key={o.integration}
                            title={o.detail ?? ""}
                            className={`${monoLabel} px-2 py-1 border ${
                              o.status === "refreshed"
                                ? "border-accent text-accent"
                                : "border-destructive text-destructive"
                            }`}
                          >
                            {INTEGRATION_LABELS[o.integration] ?? o.integration}
                            {o.status === "error" ? " ✕" : ""}
                          </span>
                        ))}
                      {row.outcomes?.every((o) => o.status === "skipped") && (
                        <span className={`${monoLabel} text-muted-foreground`}>
                          Geen koppelingen ingesteld
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "discovery" && (
        <div className="p-4" data-testid="panel-discovery">
          {discoveryQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-6">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className={monoLabel}>Accounts ontdekken…</span>
            </div>
          ) : discoveryQuery.error ? (
            <p className="text-sm text-destructive">
              Kon de ontdekking niet uitvoeren. Controleer de Google-koppelingen.
            </p>
          ) : discoveryData ? (
            <div className="flex flex-col gap-6">
              <p className="text-xs text-muted-foreground font-['Inter']">
                {discoveryData.adsAccountCount} Google Ads-accounts ·{" "}
                {discoveryData.scSiteCount} geverifieerde domeinen. Niets wordt
                aangemaakt tot je bevestigt.
              </p>

              {discoveryData.warnings.length > 0 && (
                <div className="border border-destructive/40 bg-destructive/5 p-3 flex flex-col gap-1">
                  {discoveryData.warnings.map((w, i) => (
                    <p
                      key={i}
                      className="text-xs text-destructive flex items-start gap-1.5"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {w}
                    </p>
                  ))}
                </div>
              )}

              {/* Enrichments */}
              <section>
                <h3 className={`${monoLabel} mb-3 border-b border-foreground/20 pb-2`}>
                  Ontbrekende koppelingen ({discoveryData.enrichments.length})
                </h3>
                {discoveryData.enrichments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Alle bestaande cliënten zijn volledig gekoppeld.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {discoveryData.enrichments.map((e, i) => (
                      <EnrichmentRow
                        key={`${e.clientId}-${e.field}`}
                        enrichment={e}
                        checked={!!enrichSel[i]}
                        onToggle={() =>
                          setEnrichSel((s) => ({ ...s, [i]: !s[i] }))
                        }
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* New clients */}
              <section>
                <h3 className={`${monoLabel} mb-3 border-b border-foreground/20 pb-2`}>
                  Nieuwe cliënten ({drafts.length})
                </h3>
                {drafts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Geen nieuwe accounts gevonden.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {drafts.map((d) => (
                      <NewClientRow
                        key={d.key}
                        draft={d}
                        onChange={(patch) => updateDraft(d.key, patch)}
                      />
                    ))}
                  </div>
                )}
              </section>

              {applyResult && (
                <div
                  className="border border-foreground/30 bg-background p-3"
                  data-testid="discovery-apply-result"
                >
                  <p className="text-sm">
                    {applyResult.created} cliënt(en) aangemaakt,{" "}
                    {applyResult.enriched} koppeling(en) aangevuld.
                  </p>
                  {applyResult.errors.length > 0 && (
                    <ul className="mt-2 list-disc pl-5">
                      {applyResult.errors.map((er, i) => (
                        <li key={i} className="text-xs text-destructive">
                          {er}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex items-center gap-4 border-t border-foreground/15 pt-4">
                <button
                  onClick={applyDiscovery}
                  disabled={applyMut.isPending || selectedCount === 0}
                  data-testid="button-apply-discovery"
                  className={`flex items-center gap-2 px-5 py-3 bg-foreground text-background border-2 border-foreground ${monoLabel} shadow-[4px_4px_0px_hsl(var(--accent))] hover:bg-accent hover:border-accent active:translate-x-1 active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:pointer-events-none`}
                >
                  {applyMut.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Bevestig selectie ({selectedCount})
                </button>
                <button
                  onClick={() => discoveryQuery.refetch()}
                  disabled={discoveryQuery.isFetching}
                  className={`${monoLabel} text-muted-foreground hover:text-foreground underline underline-offset-4`}
                >
                  Opnieuw scannen
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function EnrichmentRow({
  enrichment,
  checked,
  onToggle,
}: {
  enrichment: DiscoveryEnrichment;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className="flex items-start gap-3 border border-foreground/15 p-3 cursor-pointer hover:bg-background"
      data-testid={`enrichment-${enrichment.clientId}-${enrichment.field}`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 w-4 h-4 accent-[hsl(var(--accent))]"
      />
      <span className="flex-1 min-w-0">
        <span className="font-['Playfair_Display'] font-bold">
          {enrichment.clientName}
        </span>
        <span className="ml-2 font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground">
          {FIELD_LABELS[enrichment.field] ?? enrichment.field}
        </span>
        <span className="block text-sm mt-1 break-all">{enrichment.value}</span>
        <span className="block text-xs text-muted-foreground mt-0.5 font-['Inter']">
          {enrichment.reason}
        </span>
      </span>
    </label>
  );
}

function NewClientRow({
  draft,
  onChange,
}: {
  draft: NewClientDraft;
  onChange: (patch: Partial<NewClientDraft>) => void;
}) {
  return (
    <div
      className={`border p-3 transition-colors ${
        draft.selected ? "border-foreground" : "border-foreground/15"
      }`}
      data-testid={`new-client-${draft.key}`}
    >
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.selected}
          onChange={(e) => onChange({ selected: e.target.checked })}
          className="w-4 h-4 accent-[hsl(var(--accent))]"
        />
        <Input
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Naam"
          className="flex-1 font-['Playfair_Display'] font-bold"
        />
        <span className="font-['Space_Mono'] text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">
          {draft.source === "google-ads" ? "Ads" : "Search Console"}
        </span>
      </label>
      <p className="text-xs text-muted-foreground mt-1.5 ml-7 font-['Inter']">
        {draft.reason}
      </p>
      {draft.selected && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 ml-7">
          <Input
            value={draft.googleAdsCustomerId}
            onChange={(e) => onChange({ googleAdsCustomerId: e.target.value })}
            placeholder="Google Ads ID"
          />
          <Input
            value={draft.searchConsoleSiteUrl}
            onChange={(e) =>
              onChange({ searchConsoleSiteUrl: e.target.value })
            }
            placeholder="sc-domain:…"
          />
          <Input
            value={draft.website}
            onChange={(e) => onChange({ website: e.target.value })}
            placeholder="Website"
          />
        </div>
      )}
    </div>
  );
}
