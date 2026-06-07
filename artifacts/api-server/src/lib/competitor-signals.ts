import type { CompetitorAdvertiserResult } from "./serpapi";

/**
 * Competitor signals — pure, read-only diagnostics derived only from the
 * Ads Transparency data we already pulled (ad counts, formats, run dates). No
 * new API call, no invented numbers: every signal is grounded in real fields,
 * so it is safe to surface directly to the agents as observations.
 *
 * The goal is to turn a raw list of competitor creatives into a few sharp,
 * Dutch, market-context observations ("concurrent X lanceerde net 6 nieuwe
 * video-advertenties") that make the team's recommendations more strategic.
 */

export type CompetitorSignalSeverity = "high" | "warning" | "info";

export interface CompetitorSignal {
  severity: CompetitorSignalSeverity;
  /** Stable machine code (handy for tests / future filtering). */
  code: string;
  /** Dutch, human-readable observation for the agent + reviewer. */
  message: string;
}

export interface CompetitorSignalThresholds {
  /** An ad first seen within this many days counts as "newly launched". */
  recentLaunchDays: number;
  /** This many recent launches from one competitor is an active-push warning. */
  burstThreshold: number;
  /** An ad running longer than this is a proven, long-lived creative. */
  longRunnerDays: number;
  /** Cap how many per-competitor signals of one kind we emit (avoid floods). */
  maxPerKind: number;
}

export const DEFAULT_COMPETITOR_THRESHOLDS: CompetitorSignalThresholds = {
  recentLaunchDays: 14,
  burstThreshold: 3,
  longRunnerDays: 90,
  maxPerKind: 5,
};

function daysAgo(date: Date, now: number): number {
  return Math.floor((now - date.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Derive read-only diagnostic signals from competitor Ads Transparency results.
 * Ordered by severity (high first). Pure and deterministic apart from `now`,
 * which is injectable for tests.
 */
export function computeCompetitorSignals(
  results: CompetitorAdvertiserResult[],
  thresholds: Partial<CompetitorSignalThresholds> = {},
  now: number = Date.now(),
): CompetitorSignal[] {
  const t = { ...DEFAULT_COMPETITOR_THRESHOLDS, ...thresholds };
  const high: CompetitorSignal[] = [];
  const warnings: CompetitorSignal[] = [];
  const infos: CompetitorSignal[] = [];

  for (const r of results) {
    const name = r.advertiser || r.target;

    if (r.ads.length === 0) {
      infos.push({
        severity: "info",
        code: "competitor-no-ads",
        message: `${name} heeft geen actieve advertenties in het Transparency Center.`,
      });
      continue;
    }

    // Active-push: a burst of newly launched creatives signals a campaign ramp.
    const recent = r.ads.filter(
      (a) => a.firstShown && daysAgo(a.firstShown, now) <= t.recentLaunchDays,
    );
    if (recent.length >= t.burstThreshold) {
      warnings.push({
        severity: "warning",
        code: "competitor-recent-burst",
        message:
          `${name} lanceerde ${recent.length} nieuwe advertenties in de afgelopen ` +
          `${t.recentLaunchDays} dagen — een teken van een actieve campagne-push.`,
      });
    }

    // Format concentration: where is the competitor putting its weight?
    const formatCounts = new Map<string, number>();
    for (const a of r.ads) {
      formatCounts.set(a.format, (formatCounts.get(a.format) ?? 0) + 1);
    }
    const [topFormat, topCount] = [...formatCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0];
    if (topCount / r.ads.length >= 0.6 && r.ads.length >= 3) {
      infos.push({
        severity: "info",
        code: "competitor-format-focus",
        message:
          `${name} zet sterk in op ${topFormat}-advertenties ` +
          `(${topCount} van ${r.ads.length}).`,
      });
    }

    // Long-runner: a creative running for months is a proven winner worth studying.
    const longest = r.ads.reduce((acc, a) =>
      a.totalDaysShown > acc.totalDaysShown ? a : acc,
    );
    if (longest.totalDaysShown >= t.longRunnerDays) {
      infos.push({
        severity: "info",
        code: "competitor-long-runner",
        message:
          `${name} draait al ${longest.totalDaysShown} dagen dezelfde ` +
          `${longest.format}-advertentie — een bewezen, langlopende creative.`,
      });
    }
  }

  const cap = (arr: CompetitorSignal[]) => arr.slice(0, t.maxPerKind * 4);
  return [...cap(high), ...cap(warnings), ...cap(infos)];
}

/** Render signals as a compact Dutch markdown block, or "" if none. */
export function renderCompetitorSignals(signals: CompetitorSignal[]): string {
  if (signals.length === 0) return "";
  const icon: Record<CompetitorSignalSeverity, string> = {
    high: "[!]",
    warning: "[~]",
    info: "[i]",
  };
  return signals.map((s) => `${icon[s.severity]} ${s.message}`).join("\n");
}
