/**
 * Typed contract for the Google Ads QBR (kwartaalrapportage) deck.
 *
 * Like the audit deck this is a STATIC slide artifact: it never fetches at
 * runtime. A generator clones the QBR template and substitutes `[[token]]`
 * markers with the literal strings produced here. This module is the single
 * source of truth for those values:
 *   - quarter helpers (`lastFullQuarter` + neighbours) turn "today" into the
 *     three calendar quarters a QBR compares: the last FULL quarter (Q), the
 *     quarter before it (QoQ baseline) and the same quarter a year earlier (YoY
 *     baseline).
 *   - `buildQbrData()` turns three periods of live `GoogleAdsMetrics` into a
 *     typed, nl-BE-formatted `QbrData`.
 *   - `toTokenMap()` flattens that into the exact `[[token]] -> string` map the
 *     template expects (see src/pages/slides/* in deck-templates/saerens-qbr).
 *
 * Scope is QUANTITATIVE only — current values plus QoQ and YoY deltas. Narrative
 * prose and, crucially, any *targets/doelstellingen* stay as bracketed `[...]`
 * placeholders: targets are agreed with the client, never machine-filled.
 */
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
  statusFromConversies,
} from "./deck-format";
import type { GoogleAdsMetrics } from "./google-ads";
import { int } from "./pdf/format";

// --- quarter helpers ------------------------------------------------------

export interface QuarterRange {
  year: number;
  /** 1..4 */
  quarter: number;
  /** UTC midnight on the first day of the quarter. */
  start: Date;
  /** UTC midnight on the last day of the quarter. */
  end: Date;
  /** Display label, e.g. "Q1 2026". */
  label: string;
}

function quarterRange(year: number, quarter: number): QuarterRange {
  const startMonth0 = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth0, 1));
  // Day 0 of the month after the quarter = the quarter's last day.
  const end = new Date(Date.UTC(year, startMonth0 + 3, 0));
  return { year, quarter, start, end, label: `Q${quarter} ${year}` };
}

/**
 * The most recent quarter that has fully ended relative to `ref`. E.g. a `ref`
 * anywhere in Q2 2026 yields Q1 2026; a `ref` in Q1 yields Q4 of the prior year.
 */
export function lastFullQuarter(ref: Date): QuarterRange {
  const year = ref.getUTCFullYear();
  const month1 = ref.getUTCMonth() + 1;
  const currentQuarter = Math.ceil(month1 / 3);
  if (currentQuarter === 1) return quarterRange(year - 1, 4);
  return quarterRange(year, currentQuarter - 1);
}

/** The quarter immediately before `q` (QoQ baseline). */
export function previousQuarter(q: QuarterRange): QuarterRange {
  if (q.quarter === 1) return quarterRange(q.year - 1, 4);
  return quarterRange(q.year, q.quarter - 1);
}

/** The same quarter one year earlier (YoY baseline). */
export function sameQuarterLastYear(q: QuarterRange): QuarterRange {
  return quarterRange(q.year - 1, q.quarter);
}

// --- typed data -----------------------------------------------------------

export interface QbrKpi {
  /** Raw current-quarter value, or null when not available. */
  q: number | null;
  /** Raw previous-quarter value, or null when not available. */
  prevQ: number | null;
  /** Raw year-ago-quarter value, or null when not available. */
  yoyQ: number | null;
  /** Raw QoQ relative change (%), or null when not meaningful. */
  qoqPct: number | null;
  /** Raw YoY relative change (%), or null when not meaningful. */
  yoyPct: number | null;
  displayQ: string;
  displayPrevQ: string;
  displayYoyQ: string;
  displayQoq: string;
  displayYoy: string;
}

export interface QbrData {
  client: { naam: string; accountId: string; accountName: string };
  period: {
    /** Current quarter label, e.g. "Q1 2026". */
    kwartaal: string;
    /** Long current-quarter range, e.g. "1 januari – 31 maart 2026". */
    rangeLong: string;
    /** Previous-quarter label (QoQ), e.g. "Q4 2025". */
    qoqLabel: string;
    /** Year-ago-quarter label (YoY), e.g. "Q1 2025". */
    yoyLabel: string;
    fetchedAt: string;
  };
  kpis: Record<KpiKey, QbrKpi>;
  oordeel: {
    kernmetriekLabel: string;
    qoqStatus: DeckStatus;
    yoyStatus: DeckStatus;
  };
}

export interface BuildQbrDataInput {
  client: { naam: string; accountId?: string };
  quarter: QuarterRange;
  prevQuarter: QuarterRange;
  yoyQuarter: QuarterRange;
  /** When the data was pulled (renders in Cover + footers). */
  fetchedAt: Date;
  metricsQ: GoogleAdsMetrics;
  metricsPrevQ: GoogleAdsMetrics;
  metricsYoyQ: GoogleAdsMetrics;
}

// --- builder --------------------------------------------------------------

function numKpi3(
  q: number,
  prevQ: number,
  yoyQ: number,
  fmt: (n: number) => string,
): QbrKpi {
  const qoq = relDelta(prevQ, q);
  const yoy = relDelta(yoyQ, q);
  return {
    q,
    prevQ,
    yoyQ,
    qoqPct: qoq.deltaPct,
    yoyPct: yoy.deltaPct,
    displayQ: fmt(q),
    displayPrevQ: fmt(prevQ),
    displayYoyQ: fmt(yoyQ),
    displayQoq: qoq.display,
    displayYoy: yoy.display,
  };
}

function ctrKpi3(q: number, prevQ: number, yoyQ: number): QbrKpi {
  const qoq = ppDelta(prevQ, q);
  const yoy = ppDelta(yoyQ, q);
  return {
    q,
    prevQ,
    yoyQ,
    qoqPct: qoq.deltaPct,
    yoyPct: yoy.deltaPct,
    displayQ: pct(q),
    displayPrevQ: pct(prevQ),
    displayYoyQ: pct(yoyQ),
    displayQoq: qoq.display,
    displayYoy: yoy.display,
  };
}

/** Cost-per-conversion delta is only meaningful with enough conversions in both
 * compared periods, so each pairing (QoQ, YoY) is gated independently. */
function cpaDelta(
  cpaFrom: number | null,
  cpaTo: number | null,
  convFrom: number,
  convTo: number,
): string {
  const usable =
    cpaFrom != null &&
    cpaTo != null &&
    convFrom >= CPA_USABLE_MIN &&
    convTo >= CPA_USABLE_MIN;
  if (!usable) return "niet bruikbaar";
  return relDelta(cpaFrom, cpaTo).display;
}

function cpaKpi3(
  metricsQ: GoogleAdsMetrics,
  metricsPrevQ: GoogleAdsMetrics,
  metricsYoyQ: GoogleAdsMetrics,
): QbrKpi {
  const cpaQ = metricsQ.totals.cpa;
  const cpaPrev = metricsPrevQ.totals.cpa;
  const cpaYoy = metricsYoyQ.totals.cpa;
  const convQ = metricsQ.totals.conversions;
  const convPrev = metricsPrevQ.totals.conversions;
  const convYoy = metricsYoyQ.totals.conversions;
  return {
    q: cpaQ,
    prevQ: cpaPrev,
    yoyQ: cpaYoy,
    qoqPct: null,
    yoyPct: null,
    displayQ: cpaQ == null ? "—" : money(cpaQ),
    displayPrevQ: cpaPrev == null ? "—" : money(cpaPrev),
    displayYoyQ: cpaYoy == null ? "—" : money(cpaYoy),
    displayQoq: cpaDelta(cpaPrev, cpaQ, convPrev, convQ),
    displayYoy: cpaDelta(cpaYoy, cpaQ, convYoy, convQ),
  };
}

export function buildQbrData(input: BuildQbrDataInput): QbrData {
  const {
    client,
    quarter,
    prevQuarter,
    yoyQuarter,
    fetchedAt,
    metricsQ,
    metricsPrevQ,
    metricsYoyQ,
  } = input;
  const tQ = metricsQ.totals;
  const tP = metricsPrevQ.totals;
  const tY = metricsYoyQ.totals;

  const kpis: Record<KpiKey, QbrKpi> = {
    kosten: numKpi3(tQ.cost, tP.cost, tY.cost, (n) => money(n)),
    vertoningen: numKpi3(tQ.impressions, tP.impressions, tY.impressions, int),
    klikken: numKpi3(tQ.clicks, tP.clicks, tY.clicks, int),
    ctr: ctrKpi3(tQ.ctr, tP.ctr, tY.ctr),
    gemCpc: numKpi3(tQ.avgCpc, tP.avgCpc, tY.avgCpc, (n) => money(n)),
    conversies: numKpi3(tQ.conversions, tP.conversions, tY.conversions, int),
    conversiewaarde: numKpi3(
      tQ.conversionsValue,
      tP.conversionsValue,
      tY.conversionsValue,
      (n) => money(n),
    ),
    kostPerConversie: cpaKpi3(metricsQ, metricsPrevQ, metricsYoyQ),
  };

  return {
    client: {
      naam: client.naam,
      accountId: formatAccountId(client.accountId ?? metricsQ.customerId),
      accountName: metricsQ.accountName,
    },
    period: {
      kwartaal: quarter.label,
      rangeLong: `${longRange(quarter.start, quarter.end)} ${quarter.year}`,
      qoqLabel: prevQuarter.label,
      yoyLabel: yoyQuarter.label,
      fetchedAt: longDate(fetchedAt),
    },
    kpis,
    oordeel: {
      kernmetriekLabel: "Conversies",
      qoqStatus: statusFromConversies(kpis.conversies.qoqPct),
      yoyStatus: statusFromConversies(kpis.conversies.yoyPct),
    },
  };
}

// --- token map ------------------------------------------------------------

/**
 * Flatten `QbrData` into the exact `[[token]] -> literal` map the QBR template
 * expects. The generator verifies that every key here is consumed and that no
 * `[[` markers remain, so this set must stay in lockstep with the template's
 * tokens (3 meta + 4 period + 6 oordeel + 8×5 kpi = 53 keys).
 */
export function toTokenMap(data: QbrData): Record<string, string> {
  const map: Record<string, string> = {
    "meta.klantnaam": data.client.naam,
    "meta.accountId": data.client.accountId,
    "meta.opgehaald": data.period.fetchedAt,
    "period.kwartaal": data.period.kwartaal,
    "period.rangeLong": data.period.rangeLong,
    "period.qoqLabel": data.period.qoqLabel,
    "period.yoyLabel": data.period.yoyLabel,
    "oordeel.kernmetriekLabel": data.oordeel.kernmetriekLabel,
    "oordeel.q": data.kpis.conversies.displayQ,
    "oordeel.qoq": data.kpis.conversies.displayQoq,
    "oordeel.yoy": data.kpis.conversies.displayYoy,
    "oordeel.qoqStatus": data.oordeel.qoqStatus,
    "oordeel.yoyStatus": data.oordeel.yoyStatus,
  };
  for (const k of KPI_KEYS) {
    map[`kpi.${k}.q`] = data.kpis[k].displayQ;
    map[`kpi.${k}.prevQ`] = data.kpis[k].displayPrevQ;
    map[`kpi.${k}.yoyQ`] = data.kpis[k].displayYoyQ;
    map[`kpi.${k}.qoq`] = data.kpis[k].displayQoq;
    map[`kpi.${k}.yoy`] = data.kpis[k].displayYoy;
  }
  return map;
}
