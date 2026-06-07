/**
 * GA4 signals — pure, read-only diagnostics derived only from the rows we
 * already pulled from the Analytics Data API (sessions, conversions,
 * engagement). No new API call, no invented numbers: every signal is grounded
 * in real fields, so it is safe to surface directly to the agents.
 *
 * The goal is to turn a raw GA4 report into a few sharp, Dutch, actionable
 * observations ("kanaal X levert veel sessies maar 0 conversies") that make the
 * team's ads/CRO recommendations sharper.
 */

export interface Ga4ChannelRow {
  channel: string;
  sessions: number;
  conversions: number;
  engagementRate: number; // fraction 0..1
}

export interface Ga4LandingPageRow {
  page: string;
  sessions: number;
  conversions: number;
}

export interface Ga4Totals {
  sessions: number;
  totalUsers: number;
  screenPageViews: number;
  conversions: number;
  engagementRate: number; // fraction 0..1
}

export interface Ga4SignalsInput {
  totals: Ga4Totals;
  channels: Ga4ChannelRow[];
  landingPages: Ga4LandingPageRow[];
}

export type Ga4SignalSeverity = "high" | "warning" | "info";

export interface Ga4Signal {
  severity: Ga4SignalSeverity;
  code: string;
  message: string;
}

export interface Ga4SignalThresholds {
  /** A channel with at least this many sessions but no conversions is flagged. */
  zeroConvMinSessions: number;
  /** Overall engagement rate under this is a "low engagement" warning. */
  lowEngagementRate: number;
  /** Cap how many signals of one kind we emit. */
  maxPerKind: number;
}

export const DEFAULT_GA4_THRESHOLDS: Ga4SignalThresholds = {
  zeroConvMinSessions: 100,
  lowEngagementRate: 0.4,
  maxPerKind: 5,
};

/**
 * Derive read-only diagnostic signals from a GA4 report. Ordered by severity
 * (high first). Pure and deterministic.
 */
export function computeGa4Signals(
  input: Ga4SignalsInput,
  thresholds: Partial<Ga4SignalThresholds> = {},
): Ga4Signal[] {
  const t = { ...DEFAULT_GA4_THRESHOLDS, ...thresholds };
  const high: Ga4Signal[] = [];
  const warnings: Ga4Signal[] = [];
  const infos: Ga4Signal[] = [];

  // Channels with real traffic but zero conversions → wasted attention/spend.
  const zeroConv = input.channels
    .filter(
      (c) => c.sessions >= t.zeroConvMinSessions && c.conversions === 0,
    )
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, t.maxPerKind);
  for (const c of zeroConv) {
    warnings.push({
      severity: "warning",
      code: "ga4-zero-conversion-channel",
      message:
        `Kanaal "${c.channel}" levert ${c.sessions} sessies maar 0 conversies — ` +
        `landingspagina of targeting nakijken.`,
    });
  }

  // Overall low engagement → traffic quality or landing-page relevance problem.
  if (
    input.totals.sessions > 0 &&
    input.totals.engagementRate < t.lowEngagementRate
  ) {
    warnings.push({
      severity: "warning",
      code: "ga4-low-engagement",
      message:
        `Lage betrokkenheid: gemiddelde engagement rate is ` +
        `${(input.totals.engagementRate * 100).toFixed(1)}% over alle sessies.`,
    });
  }

  // Biggest session driver, for context.
  const topChannel = [...input.channels].sort(
    (a, b) => b.sessions - a.sessions,
  )[0];
  if (topChannel && topChannel.sessions > 0) {
    infos.push({
      severity: "info",
      code: "ga4-top-channel",
      message:
        `Grootste verkeersbron: "${topChannel.channel}" ` +
        `(${topChannel.sessions} sessies, ${topChannel.conversions} conversies).`,
    });
  }

  // Top landing page by sessions, for context.
  const topLanding = [...input.landingPages].sort(
    (a, b) => b.sessions - a.sessions,
  )[0];
  if (topLanding && topLanding.sessions > 0) {
    infos.push({
      severity: "info",
      code: "ga4-top-landing-page",
      message:
        `Belangrijkste landingspagina: "${topLanding.page}" ` +
        `(${topLanding.sessions} sessies, ${topLanding.conversions} conversies).`,
    });
  }

  const cap = (arr: Ga4Signal[]) => arr.slice(0, t.maxPerKind * 2);
  return [...cap(high), ...cap(warnings), ...cap(infos)];
}

/** Render signals as a compact Dutch block, or "" if none. */
export function renderGa4Signals(signals: Ga4Signal[]): string {
  if (signals.length === 0) return "";
  const icon: Record<Ga4SignalSeverity, string> = {
    high: "[!]",
    warning: "[~]",
    info: "[i]",
  };
  return signals.map((s) => `${icon[s.severity]} ${s.message}`).join("\n");
}
