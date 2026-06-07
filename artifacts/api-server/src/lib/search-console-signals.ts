import type { SearchConsoleRow } from "./search-console";

/**
 * Search Console signals — pure, read-only diagnostics derived only from the
 * query rows we already pulled (clicks, impressions, CTR, average position). No
 * new API call, no invented numbers: every signal is grounded in real fields,
 * so it is safe to surface directly to the agents as observations.
 *
 * The goal is to turn a raw query table into a few sharp, Dutch, actionable
 * observations ("term X staat op positie 12 met 800 vertoningen — kans om naar
 * pagina 1 te duwen") that make the team's SEO/ads recommendations sharper.
 */

export type SearchConsoleSignalSeverity = "high" | "warning" | "info";

export interface SearchConsoleSignal {
  severity: SearchConsoleSignalSeverity;
  code: string;
  message: string;
}

export interface SearchConsoleSignalThresholds {
  /** "Striking distance": avg position between these bounds = page-2 opportunity. */
  strikingMinPos: number;
  strikingMaxPos: number;
  /** Only flag a query with at least this many impressions (avoid noise). */
  minImpressions: number;
  /** A query ranking at/under this position is considered "high". */
  highPos: number;
  /** A high-ranking query under this CTR is an under-performing title/snippet. */
  lowCtr: number;
  /** Cap how many signals of one kind we emit. */
  maxPerKind: number;
}

export const DEFAULT_SC_THRESHOLDS: SearchConsoleSignalThresholds = {
  strikingMinPos: 8,
  strikingMaxPos: 20,
  minImpressions: 100,
  highPos: 5,
  lowCtr: 0.02,
  maxPerKind: 5,
};

/**
 * Derive read-only diagnostic signals from the top-query rows. Ordered by
 * severity (high first). Pure and deterministic apart from `now` (unused today
 * but kept for signature symmetry with the other signal modules).
 */
export function computeSearchConsoleSignals(
  queries: SearchConsoleRow[],
  thresholds: Partial<SearchConsoleSignalThresholds> = {},
  _now: number = Date.now(),
): SearchConsoleSignal[] {
  const t = { ...DEFAULT_SC_THRESHOLDS, ...thresholds };
  const high: SearchConsoleSignal[] = [];
  const warnings: SearchConsoleSignal[] = [];
  const infos: SearchConsoleSignal[] = [];

  // Striking distance: solid impressions but stuck on page 2 → quick SEO win.
  const striking = queries
    .filter(
      (q) =>
        q.impressions >= t.minImpressions &&
        q.position >= t.strikingMinPos &&
        q.position <= t.strikingMaxPos,
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, t.maxPerKind);
  for (const q of striking) {
    warnings.push({
      severity: "warning",
      code: "sc-striking-distance",
      message:
        `"${q.key}" staat gemiddeld op positie ${q.position.toFixed(1)} met ` +
        `${q.impressions} vertoningen — kans om naar pagina 1 te duwen.`,
    });
  }

  // High rank but low CTR: the page ranks but the title/snippet under-sells it.
  const lowCtr = queries
    .filter(
      (q) =>
        q.impressions >= t.minImpressions &&
        q.position <= t.highPos &&
        q.ctr < t.lowCtr,
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, t.maxPerKind);
  for (const q of lowCtr) {
    warnings.push({
      severity: "warning",
      code: "sc-low-ctr",
      message:
        `"${q.key}" staat hoog (positie ${q.position.toFixed(1)}) maar de CTR is ` +
        `slechts ${(q.ctr * 100).toFixed(1)}% — titel/meta-omschrijving verbeteren.`,
    });
  }

  // Top performer: the single biggest organic traffic driver, for context.
  const top = [...queries].sort((a, b) => b.clicks - a.clicks)[0];
  if (top && top.clicks > 0) {
    infos.push({
      severity: "info",
      code: "sc-top-query",
      message:
        `Grootste organische verkeersbron: "${top.key}" ` +
        `(${top.clicks} klikken, positie ${top.position.toFixed(1)}).`,
    });
  }

  const cap = (arr: SearchConsoleSignal[]) => arr.slice(0, t.maxPerKind * 2);
  return [...cap(high), ...cap(warnings), ...cap(infos)];
}

/** Render signals as a compact Dutch markdown block, or "" if none. */
export function renderSearchConsoleSignals(
  signals: SearchConsoleSignal[],
): string {
  if (signals.length === 0) return "";
  const icon: Record<SearchConsoleSignalSeverity, string> = {
    high: "[!]",
    warning: "[~]",
    info: "[i]",
  };
  return signals.map((s) => `${icon[s.severity]} ${s.message}`).join("\n");
}
