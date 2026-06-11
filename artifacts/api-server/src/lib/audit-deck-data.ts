/**
 * Typed contract for the Google Ads audit deck (T7 data-injection pattern).
 *
 * The audit deck is a STATIC slide artifact: it never fetches at runtime. Instead
 * a generator clones the template and substitutes `[[token]]` markers with the
 * literal strings produced here, so the rendered JSX stays fully static (visual
 * editing + PPTX/PDF export keep working). This module is the single source of
 * truth for those values:
 *   - `buildAuditData()` turns two periods of live `GoogleAdsMetrics` (older "A"
 *     vs newer "B") into a typed, nl-BE-formatted `AuditData`.
 *   - `toTokenMap()` flattens that into the exact 36-key `[[token]] -> string`
 *     map the template expects (see src/pages/slides/* in the deck template).
 *
 * Scope is QUANTITATIVE only — Cover, Samenvatting KPI cards, Oordeel hero +
 * status, KpiTabel rows and the footers. Narrative prose stays as bracketed
 * `[...]` placeholders for the agent/human to fill.
 *
 * Shared nl-BE formatting + delta/status helpers live in ./deck-format so the
 * audit, QBR and any further decks render identically.
 */
import type { GoogleAdsMetrics } from "./google-ads";
import {
  CPA_USABLE_MIN,
  type DeckStatus,
  formatAccountId,
  KPI_KEYS,
  type KpiKey,
  longDate,
  longRange,
  money,
  pct,
  ppDelta,
  relDelta,
  shortRange,
  statusFromConversies,
} from "./deck-format";
import { int } from "./pdf/format";

export { KPI_KEYS };
export type { KpiKey };

/** Backwards-compatible alias for the shared deck status verdict. */
export type AuditStatus = DeckStatus;

export interface AuditKpi {
  /** Raw period-A value, or null when not available. */
  a: number | null;
  /** Raw period-B value, or null when not available. */
  b: number | null;
  /** Raw relative change (%) A→B, or null when not meaningful. */
  deltaPct: number | null;
  displayA: string;
  displayB: string;
  displayDelta: string;
}

export interface AuditData {
  client: { naam: string; accountId: string; accountName: string };
  period: {
    aYear: string;
    bYear: string;
    vergelijking: string;
    rangeLong: string;
    rangeShort: string;
    fetchedAt: string;
  };
  kpis: Record<KpiKey, AuditKpi>;
  oordeel: { kernmetriekLabel: string; status: AuditStatus };
}

export interface BuildAuditDataInput {
  client: { naam: string; accountId?: string };
  /** Older comparison period (e.g. prior year). */
  periodA: { start: Date; end: Date };
  /** Newer current period being audited. */
  periodB: { start: Date; end: Date };
  /** When the data was pulled (renders in Cover + footers). */
  fetchedAt: Date;
  metricsA: GoogleAdsMetrics;
  metricsB: GoogleAdsMetrics;
}

// --- builder --------------------------------------------------------------

function numKpi(a: number, b: number, fmt: (n: number) => string): AuditKpi {
  const { deltaPct, display } = relDelta(a, b);
  return { a, b, deltaPct, displayA: fmt(a), displayB: fmt(b), displayDelta: display };
}

function ctrKpi(a: number, b: number): AuditKpi {
  const { deltaPct, display } = ppDelta(a, b);
  return {
    a,
    b,
    deltaPct,
    displayA: pct(a),
    displayB: pct(b),
    displayDelta: display,
  };
}

function cpaKpi(metricsA: GoogleAdsMetrics, metricsB: GoogleAdsMetrics): AuditKpi {
  const cpaA = metricsA.totals.cpa;
  const cpaB = metricsB.totals.cpa;
  const convA = metricsA.totals.conversions;
  const convB = metricsB.totals.conversions;
  const displayA = cpaA == null ? "—" : money(cpaA);
  const displayB = cpaB == null ? "—" : money(cpaB);
  const usable =
    cpaA != null && cpaB != null && convA >= CPA_USABLE_MIN && convB >= CPA_USABLE_MIN;
  if (!usable) {
    return { a: cpaA, b: cpaB, deltaPct: null, displayA, displayB, displayDelta: "niet bruikbaar" };
  }
  const { deltaPct, display } = relDelta(cpaA, cpaB);
  return { a: cpaA, b: cpaB, deltaPct, displayA, displayB, displayDelta: display };
}

export function buildAuditData(input: BuildAuditDataInput): AuditData {
  const { client, periodA, periodB, fetchedAt, metricsA, metricsB } = input;
  const tA = metricsA.totals;
  const tB = metricsB.totals;

  const kpis: Record<KpiKey, AuditKpi> = {
    kosten: numKpi(tA.cost, tB.cost, (n) => money(n)),
    vertoningen: numKpi(tA.impressions, tB.impressions, int),
    klikken: numKpi(tA.clicks, tB.clicks, int),
    ctr: ctrKpi(tA.ctr, tB.ctr),
    gemCpc: numKpi(tA.avgCpc, tB.avgCpc, (n) => money(n)),
    conversies: numKpi(tA.conversions, tB.conversions, int),
    conversiewaarde: numKpi(tA.conversionsValue, tB.conversionsValue, (n) => money(n)),
    kostPerConversie: cpaKpi(metricsA, metricsB),
  };

  const aYear = String(periodA.start.getUTCFullYear());
  const bYear = String(periodB.start.getUTCFullYear());

  return {
    client: {
      naam: client.naam,
      accountId: formatAccountId(client.accountId ?? metricsB.customerId),
      accountName: metricsB.accountName,
    },
    period: {
      aYear,
      bYear,
      vergelijking: `${bYear} vs ${aYear}`,
      rangeLong: longRange(periodB.start, periodB.end),
      rangeShort: shortRange(periodB.start, periodB.end),
      fetchedAt: longDate(fetchedAt),
    },
    kpis,
    oordeel: {
      kernmetriekLabel: "Conversies",
      status: statusFromConversies(kpis.conversies.deltaPct),
    },
  };
}

// --- token map ------------------------------------------------------------

/**
 * Flatten `AuditData` into the exact `[[token]] -> literal` map the deck
 * template expects. The generator verifies that every key here is consumed and
 * that no `[[` markers remain, so this set must stay in lockstep with the
 * template's tokens.
 */
export function toTokenMap(data: AuditData): Record<string, string> {
  const map: Record<string, string> = {
    "meta.klantnaam": data.client.naam,
    "meta.accountId": data.client.accountId,
    "meta.opgehaald": data.period.fetchedAt,
    "period.rangeLong": data.period.rangeLong,
    "period.rangeShort": data.period.rangeShort,
    "period.vergelijking": data.period.vergelijking,
    "period.aYear": data.period.aYear,
    "period.bYear": data.period.bYear,
    "oordeel.kernmetriekLabel": data.oordeel.kernmetriekLabel,
    "oordeel.a": data.kpis.conversies.displayA,
    "oordeel.b": data.kpis.conversies.displayB,
    "oordeel.status": data.oordeel.status,
  };
  for (const k of KPI_KEYS) {
    map[`kpi.${k}.a`] = data.kpis[k].displayA;
    map[`kpi.${k}.b`] = data.kpis[k].displayB;
    map[`kpi.${k}.delta`] = data.kpis[k].displayDelta;
  }
  return map;
}
