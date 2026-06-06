import type { GoogleAdsMetrics } from "./google-ads";

/**
 * Account signals — pure, read-only diagnostics computed from the live Google
 * Ads metrics we already pull. No new API call, no invented targets: every
 * signal is derived only from real cost/conversion numbers in the report, so it
 * is safe to surface directly to the agents as grounded observations.
 *
 * Two families:
 * - Conversion-tracking health — spend with zero conversions is the classic
 *   "optimizing on blind data" trap. Flagged loudly because it usually means
 *   broken or missing conversion tracking, not genuinely poor performance.
 * - Waste signals — campaigns whose CPA is far worse than the account average,
 *   i.e. where money is leaking relative to the rest of the account.
 *
 * Everything below a spend floor stays silent: a few euros of noise is not worth
 * an alert and would only distract the human reviewer.
 */

export type SignalSeverity = "high" | "warning" | "info";

export interface AccountSignal {
  severity: SignalSeverity;
  /** Stable machine code (handy for tests / future filtering). */
  code: string;
  /** Dutch, human-readable observation for the agent + reviewer. */
  message: string;
}

export interface SignalThresholds {
  /** Below this account spend, emit nothing (too little data to be meaningful). */
  minAccountSpend: number;
  /** Below this campaign spend, a campaign is ignored for per-campaign signals. */
  minCampaignSpend: number;
  /** A campaign CPA worse than this multiple of the account CPA is an outlier. */
  cpaOutlierFactor: number;
  /** Cap on how many per-campaign signals of one kind we emit (avoid floods). */
  maxPerKind: number;
}

export const DEFAULT_THRESHOLDS: SignalThresholds = {
  minAccountSpend: 50,
  minCampaignSpend: 25,
  cpaOutlierFactor: 2,
  maxPerKind: 5,
};

function money(value: number, currency: string): string {
  return `${value.toFixed(2)} ${currency}`.trim();
}

/**
 * Derive read-only diagnostic signals from a Google Ads report's metrics.
 * Ordered by severity (high first). Pure and deterministic.
 */
export function computeAccountSignals(
  metrics: GoogleAdsMetrics,
  thresholds: Partial<SignalThresholds> = {},
): AccountSignal[] {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const currency = metrics.currency || "";
  const { totals, campaigns } = metrics;

  const high: AccountSignal[] = [];
  const warnings: AccountSignal[] = [];

  // Too little spend to say anything trustworthy.
  if (totals.cost < t.minAccountSpend) return [];

  // 1. Conversion-tracking health — account level.
  if (totals.conversions === 0) {
    high.push({
      severity: "high",
      code: "tracking-account-zero-conv",
      message:
        `Het account gaf ${money(totals.cost, currency)} uit zonder \u00e9\u00e9n geregistreerde conversie. ` +
        "Dit wijst meestal op ontbrekende of kapotte conversietracking, niet op slechte prestaties. " +
        "Controleer de conversietracking vooraleer je op deze data optimaliseert.",
    });
  }

  // 2. Per-campaign spend without conversions (only meaningful if the account
  //    DOES register conversions somewhere — otherwise the account-level signal
  //    above already covers it).
  const campaignsWithSpend = campaigns.filter(
    (c) => c.cost >= t.minCampaignSpend,
  );
  if (totals.conversions > 0) {
    const zeroConv = campaignsWithSpend
      .filter((c) => c.conversions === 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, t.maxPerKind);
    for (const c of zeroConv) {
      warnings.push({
        severity: "warning",
        code: "campaign-zero-conv",
        message:
          `Campagne "${c.name}" gaf ${money(c.cost, currency)} uit zonder conversies, ` +
          "terwijl de rest van het account wel converteert. Onderzoek targeting, zoekwoorden of landingspagina.",
      });
    }
  }

  // 3. CPA outliers — campaigns far above the account-average cost per conversion.
  if (totals.cpa !== null && totals.cpa > 0) {
    const accountCpa = totals.cpa;
    const outliers = campaignsWithSpend
      .filter(
        (c) =>
          c.conversions > 0 &&
          c.cpa !== null &&
          c.cpa > accountCpa * t.cpaOutlierFactor,
      )
      .sort((a, b) => (b.cpa ?? 0) - (a.cpa ?? 0))
      .slice(0, t.maxPerKind);
    for (const c of outliers) {
      warnings.push({
        severity: "warning",
        code: "campaign-cpa-outlier",
        message:
          `Campagne "${c.name}" heeft een CPA van ${money(c.cpa!, currency)}, ` +
          `meer dan ${t.cpaOutlierFactor}x het accountgemiddelde van ${money(accountCpa, currency)}. ` +
          "Deze campagne is relatief duur; overweeg biedingen, zoekwoorden of uitsluitingen bij te sturen.",
      });
    }
  }

  return [...high, ...warnings];
}

/**
 * Render signals as report lines (a "== Signalen ==" section). Returns an empty
 * array when there is nothing to report, so the caller can skip the heading.
 */
export function renderAccountSignals(signals: AccountSignal[]): string[] {
  if (signals.length === 0) return [];
  const label: Record<SignalSeverity, string> = {
    high: "BELANGRIJK",
    warning: "Let op",
    info: "Info",
  };
  const lines = ["== Signalen (automatisch berekend, read-only) =="];
  for (const s of signals) lines.push(`- [${label[s.severity]}] ${s.message}`);
  return lines;
}
