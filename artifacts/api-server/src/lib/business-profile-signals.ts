/**
 * Google Business Profile (GMB) signals — pure, read-only diagnostics derived
 * only from the Performance metrics we already pulled (impressions, calls,
 * website clicks, direction requests, conversations). No new API call, no
 * invented numbers: every signal is grounded in real aggregated totals, so it is
 * safe to surface directly to the agents as observations.
 *
 * The goal is to turn raw performance totals into a few sharp, Dutch
 * observations about a client's local presence ("3.200 vertoningen maar 0
 * telefoonklikken — de call-to-action ontbreekt").
 */

export type GmbSignalSeverity = "high" | "warning" | "info";

export interface GmbSignal {
  severity: GmbSignalSeverity;
  /** Stable machine code (handy for tests / future filtering). */
  code: string;
  /** Dutch, human-readable observation for the agent + reviewer. */
  message: string;
}

/** Aggregated, read-only Business Profile performance over a window. */
export interface GmbReport {
  locationId: string;
  startDate: string;
  endDate: string;
  /** Raw per-metric totals (metric name → sum over the window). */
  metrics: Record<string, number>;
  /** Sum of the four impression metrics (maps + search, desktop + mobile). */
  impressions: number;
  calls: number;
  websiteClicks: number;
  directionRequests: number;
  conversations: number;
  /** calls + websiteClicks + directionRequests + conversations. */
  actions: number;
}

export interface GmbSignalThresholds {
  /** Below this many impressions over the window, visibility is flagged. */
  lowImpressionsThreshold: number;
  /** Below this action rate (actions / impressions), engagement is flagged. */
  lowActionRateThreshold: number;
}

export const DEFAULT_GMB_THRESHOLDS: GmbSignalThresholds = {
  lowImpressionsThreshold: 100,
  lowActionRateThreshold: 0.02,
};

/**
 * Derive read-only diagnostic signals from an aggregated GMB report.
 * Ordered by severity (high first). Pure and deterministic.
 */
export function computeGmbSignals(
  report: GmbReport,
  thresholds: Partial<GmbSignalThresholds> = {},
): GmbSignal[] {
  const t = { ...DEFAULT_GMB_THRESHOLDS, ...thresholds };
  const high: GmbSignal[] = [];
  const warnings: GmbSignal[] = [];
  const infos: GmbSignal[] = [];

  if (report.impressions === 0) {
    high.push({
      severity: "high",
      code: "gmb-no-visibility",
      message:
        "De Google Business-listing kreeg geen enkele vertoning in deze periode — " +
        "geen lokale zichtbaarheid. Controleer of de listing actief en geverifieerd is.",
    });
  } else if (report.impressions < t.lowImpressionsThreshold) {
    warnings.push({
      severity: "warning",
      code: "gmb-low-visibility",
      message:
        `De Google Business-listing kreeg slechts ${report.impressions} vertoningen ` +
        `in deze periode — lage lokale zichtbaarheid.`,
    });
  }

  if (report.impressions > 0) {
    const actionRate = report.actions / report.impressions;

    if (report.calls === 0 && report.impressions >= t.lowImpressionsThreshold) {
      warnings.push({
        severity: "warning",
        code: "gmb-no-calls",
        message:
          `${report.impressions} vertoningen maar 0 telefoonklikken — ` +
          `de listing zet zichtbaarheid niet om in telefonisch contact.`,
      });
    }

    if (actionRate < t.lowActionRateThreshold) {
      warnings.push({
        severity: "warning",
        code: "gmb-low-action-rate",
        message:
          `Lage actiegraad: ${report.actions} acties op ${report.impressions} ` +
          `vertoningen (${(actionRate * 100).toFixed(1)}%, onder ` +
          `${(t.lowActionRateThreshold * 100).toFixed(1)}%).`,
      });
    } else {
      infos.push({
        severity: "info",
        code: "gmb-healthy-engagement",
        message:
          `Gezonde lokale interactie: ${report.actions} acties (telefoon, website, ` +
          `routes, berichten) op ${report.impressions} vertoningen ` +
          `(${(actionRate * 100).toFixed(1)}%).`,
      });
    }
  }

  return [...high, ...warnings, ...infos];
}

/** Render signals as a compact Dutch markdown block, or "" if none. */
export function renderGmbSignals(signals: GmbSignal[]): string {
  if (signals.length === 0) return "";
  const icon: Record<GmbSignalSeverity, string> = {
    high: "[!]",
    warning: "[~]",
    info: "[i]",
  };
  return signals.map((s) => `${icon[s.severity]} ${s.message}`).join("\n");
}
