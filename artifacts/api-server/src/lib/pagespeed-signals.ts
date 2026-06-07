/**
 * PageSpeed signals — pure, read-only diagnostics derived only from the
 * Lighthouse data we already pulled (performance score + Core Web Vitals). No
 * new API call, no invented numbers: every signal is grounded in real audit
 * fields, so it is safe to surface directly to the agents as observations.
 *
 * The goal is to turn raw Lighthouse output into a few sharp, Dutch observations
 * about a client's landing-page speed, which directly affects Google Ads Quality
 * Score and conversion ("LCP van 5,2s op mobiel — te traag, schaadt kwaliteit").
 */

export type PageSpeedSignalSeverity = "high" | "warning" | "info";

export interface PageSpeedSignal {
  severity: PageSpeedSignalSeverity;
  /** Stable machine code (handy for tests / future filtering). */
  code: string;
  /** Dutch, human-readable observation for the agent + reviewer. */
  message: string;
}

/** One normalized Lighthouse result for a single URL + strategy. */
export interface PageSpeedRecord {
  /** The URL that was measured. */
  url: string;
  /** "mobile" or "desktop" — Lighthouse strategy. */
  strategy: "mobile" | "desktop";
  /** Whether Lighthouse produced a result at all. */
  found: boolean;
  /** Performance category score, 0-100 (0 when unknown). */
  performanceScore: number;
  /** Largest Contentful Paint, lab value in milliseconds (0 when unknown). */
  lcpMs: number;
  /** Cumulative Layout Shift, unitless (0 when unknown). */
  cls: number;
  /** Interaction to Next Paint / Total Blocking Time, ms (0 when unknown). */
  inpMs: number;
}

export interface PageSpeedSignalThresholds {
  /** Below this performance score the page is a hard problem. */
  scoreHighThreshold: number;
  /** Below this performance score the page is flagged as a warning. */
  scoreWarnThreshold: number;
  /** LCP above this (ms) is a hard problem. */
  lcpHighThreshold: number;
  /** LCP above this (ms) is a warning. */
  lcpWarnThreshold: number;
  /** CLS above this is a hard problem. */
  clsHighThreshold: number;
  /** CLS above this is a warning. */
  clsWarnThreshold: number;
  /** INP/TBT above this (ms) is a hard problem. */
  inpHighThreshold: number;
  /** INP/TBT above this (ms) is a warning. */
  inpWarnThreshold: number;
}

export const DEFAULT_PAGESPEED_THRESHOLDS: PageSpeedSignalThresholds = {
  scoreHighThreshold: 50,
  scoreWarnThreshold: 90,
  lcpHighThreshold: 4000,
  lcpWarnThreshold: 2500,
  clsHighThreshold: 0.25,
  clsWarnThreshold: 0.1,
  inpHighThreshold: 500,
  inpWarnThreshold: 200,
};

/**
 * Derive read-only diagnostic signals from one or more PageSpeed records.
 * Ordered by severity (high first). Pure and deterministic.
 */
export function computePageSpeedSignals(
  records: PageSpeedRecord[],
  thresholds: Partial<PageSpeedSignalThresholds> = {},
): PageSpeedSignal[] {
  const t = { ...DEFAULT_PAGESPEED_THRESHOLDS, ...thresholds };
  const high: PageSpeedSignal[] = [];
  const warnings: PageSpeedSignal[] = [];
  const infos: PageSpeedSignal[] = [];

  for (const r of records) {
    if (!r.found) continue;
    const where = `${r.url} (${r.strategy === "mobile" ? "mobiel" : "desktop"})`;

    // Performance score.
    if (r.performanceScore > 0 && r.performanceScore < t.scoreHighThreshold) {
      high.push({
        severity: "high",
        code: "pagespeed-score-critical",
        message:
          `${where} heeft een PageSpeed-score van ${r.performanceScore}/100 — ` +
          `kritiek traag. Dit drukt de Quality Score en de conversie.`,
      });
    } else if (
      r.performanceScore > 0 &&
      r.performanceScore < t.scoreWarnThreshold
    ) {
      warnings.push({
        severity: "warning",
        code: "pagespeed-score-low",
        message:
          `${where} heeft een PageSpeed-score van ${r.performanceScore}/100 — ` +
          `onder de streefwaarde van ${t.scoreWarnThreshold}.`,
      });
    }

    // Largest Contentful Paint.
    if (r.lcpMs >= t.lcpHighThreshold) {
      high.push({
        severity: "high",
        code: "pagespeed-lcp-critical",
        message:
          `${where} laadt traag: LCP ${(r.lcpMs / 1000).toFixed(1)}s ` +
          `(slecht boven ${(t.lcpHighThreshold / 1000).toFixed(1)}s).`,
      });
    } else if (r.lcpMs >= t.lcpWarnThreshold) {
      warnings.push({
        severity: "warning",
        code: "pagespeed-lcp-slow",
        message:
          `${where}: LCP ${(r.lcpMs / 1000).toFixed(1)}s — boven de ideale ` +
          `${(t.lcpWarnThreshold / 1000).toFixed(1)}s.`,
      });
    }

    // Cumulative Layout Shift.
    if (r.cls >= t.clsHighThreshold) {
      high.push({
        severity: "high",
        code: "pagespeed-cls-critical",
        message:
          `${where} verschuift sterk tijdens het laden (CLS ${r.cls.toFixed(2)}, ` +
          `slecht boven ${t.clsHighThreshold.toFixed(2)}).`,
      });
    } else if (r.cls >= t.clsWarnThreshold) {
      warnings.push({
        severity: "warning",
        code: "pagespeed-cls-elevated",
        message:
          `${where}: CLS ${r.cls.toFixed(2)} — boven de ideale ` +
          `${t.clsWarnThreshold.toFixed(2)}.`,
      });
    }

    // Interaction to Next Paint (lab proxy: TBT-derived).
    if (r.inpMs >= t.inpHighThreshold) {
      high.push({
        severity: "high",
        code: "pagespeed-inp-critical",
        message:
          `${where} reageert traag op interactie (${Math.round(r.inpMs)}ms, ` +
          `slecht boven ${t.inpHighThreshold}ms).`,
      });
    } else if (r.inpMs >= t.inpWarnThreshold) {
      warnings.push({
        severity: "warning",
        code: "pagespeed-inp-elevated",
        message:
          `${where}: interactietijd ${Math.round(r.inpMs)}ms — boven de ideale ` +
          `${t.inpWarnThreshold}ms.`,
      });
    }

    // A clean page is worth saying once.
    if (
      r.performanceScore >= t.scoreWarnThreshold &&
      r.lcpMs > 0 &&
      r.lcpMs < t.lcpWarnThreshold &&
      r.cls < t.clsWarnThreshold
    ) {
      infos.push({
        severity: "info",
        code: "pagespeed-healthy",
        message:
          `${where} scoort gezond (${r.performanceScore}/100, LCP ` +
          `${(r.lcpMs / 1000).toFixed(1)}s) — geen snelheidsprobleem.`,
      });
    }
  }

  return [...high, ...warnings, ...infos];
}

/** Render signals as a compact Dutch markdown block, or "" if none. */
export function renderPageSpeedSignals(signals: PageSpeedSignal[]): string {
  if (signals.length === 0) return "";
  const icon: Record<PageSpeedSignalSeverity, string> = {
    high: "[!]",
    warning: "[~]",
    info: "[i]",
  };
  return signals.map((s) => `${icon[s.severity]} ${s.message}`).join("\n");
}
