import type { BingRow } from "./bing-webmaster";

/**
 * Bing Webmaster signals — pure, read-only diagnostics derived only from the
 * query rows we already pulled (clicks, impressions, derived CTR, average
 * position). No new API call, no invented numbers: every signal is grounded in
 * real fields, so it is safe to surface directly to the agents as observations.
 *
 * Same idea as the Search Console signals, but kept self-contained so Bing data
 * stays clearly labelled (`bing-*` codes) and can drift independently if Bing's
 * quirks ever demand different thresholds.
 */

export type BingSignalSeverity = "high" | "warning" | "info";

export interface BingSignal {
  severity: BingSignalSeverity;
  code: string;
  message: string;
}

export interface BingSignalThresholds {
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

export const DEFAULT_BING_THRESHOLDS: BingSignalThresholds = {
  strikingMinPos: 8,
  strikingMaxPos: 20,
  minImpressions: 50,
  highPos: 5,
  lowCtr: 0.02,
  maxPerKind: 5,
};

/**
 * Derive read-only diagnostic signals from the top-query rows. Ordered by
 * severity (high first). Pure and deterministic apart from `now` (unused today
 * but kept for signature symmetry with the other signal modules).
 */
export function computeBingSignals(
  queries: BingRow[],
  thresholds: Partial<BingSignalThresholds> = {},
  _now: number = Date.now(),
): BingSignal[] {
  const t = { ...DEFAULT_BING_THRESHOLDS, ...thresholds };
  const high: BingSignal[] = [];
  const warnings: BingSignal[] = [];
  const infos: BingSignal[] = [];

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
      code: "bing-striking-distance",
      message:
        `"${q.key}" staat op Bing gemiddeld op positie ${q.position.toFixed(1)} met ` +
        `${q.impressions} vertoningen — kans om naar pagina 1 te duwen.`,
    });
  }

  // High rank but low CTR: the page ranks but the title/snippet under-sells it.
  const lowCtr = queries
    .filter(
      (q) =>
        q.impressions >= t.minImpressions &&
        q.position > 0 &&
        q.position <= t.highPos &&
        q.ctr < t.lowCtr,
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, t.maxPerKind);
  for (const q of lowCtr) {
    warnings.push({
      severity: "warning",
      code: "bing-low-ctr",
      message:
        `"${q.key}" staat op Bing hoog (positie ${q.position.toFixed(1)}) maar de CTR is ` +
        `slechts ${(q.ctr * 100).toFixed(1)}% — titel/meta-omschrijving verbeteren.`,
    });
  }

  // Top performer: the single biggest Bing organic traffic driver, for context.
  const top = [...queries].sort((a, b) => b.clicks - a.clicks)[0];
  if (top && top.clicks > 0) {
    const posPart =
      top.position > 0 ? `, positie ${top.position.toFixed(1)}` : "";
    infos.push({
      severity: "info",
      code: "bing-top-query",
      message:
        `Grootste organische verkeersbron op Bing: "${top.key}" ` +
        `(${top.clicks} klikken${posPart}).`,
    });
  }

  const cap = (arr: BingSignal[]) => arr.slice(0, t.maxPerKind * 2);
  return [...cap(high), ...cap(warnings), ...cap(infos)];
}

/** Render signals as a compact Dutch markdown block, or "" if none. */
export function renderBingSignals(signals: BingSignal[]): string {
  if (signals.length === 0) return "";
  const icon: Record<BingSignalSeverity, string> = {
    high: "[!]",
    warning: "[~]",
    info: "[i]",
  };
  return signals.map((s) => `${icon[s.severity]} ${s.message}`).join("\n");
}
