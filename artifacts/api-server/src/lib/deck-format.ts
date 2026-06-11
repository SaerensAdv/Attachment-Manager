/**
 * Shared nl-BE formatting + delta/status helpers for the Saerens deck-data
 * generators (audit, QBR, and any further decks). Centralised so every deck
 * renders money, deltas and statuses identically.
 *
 * Currency is rendered as `€1.234,56` (euro prefix, nl-BE digits, no space) to
 * match the existing LIVE client decks — deliberately NOT Intl currency
 * formatting, whose euro placement/spacing differs per runtime. Treat this
 * module as frozen behaviour: changing a formatter changes every deck.
 */
import { dec } from "./pdf/format";

/** Typographic minus (U+2212), matching the live decks' negative deltas. */
export const MINUS = "\u2212";

export const NL_MONTH_LONG = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

export const NL_MONTH_SHORT = [
  "jan",
  "feb",
  "mrt",
  "apr",
  "mei",
  "jun",
  "jul",
  "aug",
  "sep",
  "okt",
  "nov",
  "dec",
];

/** The 8 account-level KPIs every Saerens deck reports, in display order. */
export const KPI_KEYS = [
  "kosten",
  "vertoningen",
  "klikken",
  "ctr",
  "gemCpc",
  "conversies",
  "conversiewaarde",
  "kostPerConversie",
] as const;

export type KpiKey = (typeof KPI_KEYS)[number];

/** Minimum conversions in BOTH compared periods for a cost-per-conversion delta
 * to mean anything; below this the metric swings wildly on a single conversion. */
export const CPA_USABLE_MIN = 5;

/** Conversion-delta bands (in %) that drive the deterministic status verdict. */
export const STATUS_BAND_PCT = 5;

export type DeckStatus = "Verbeterend" | "Stabiel" | "Verslechterend";

export const money = (n: number, d = 2): string => `€${dec(n, d)}`;
export const pct = (fraction: number, d = 2): string => `${dec(fraction * 100, d)}%`;

export function dayUTC(d: Date): number {
  return d.getUTCDate();
}

export function longDate(d: Date): string {
  return `${dayUTC(d)} ${NL_MONTH_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function longRange(s: Date, e: Date): string {
  return `${dayUTC(s)} ${NL_MONTH_LONG[s.getUTCMonth()]} – ${dayUTC(e)} ${NL_MONTH_LONG[e.getUTCMonth()]}`;
}

export function shortRange(s: Date, e: Date): string {
  return `${dayUTC(s)} ${NL_MONTH_SHORT[s.getUTCMonth()]} – ${dayUTC(e)} ${NL_MONTH_SHORT[e.getUTCMonth()]}`;
}

/** Google customer ids are 10 digits; render them grouped 3-3-4 (e.g. 541-666-6067). */
export function formatAccountId(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d || raw;
}

/** Relative %-change a→b with a signed, rounded display. */
export function relDelta(
  a: number,
  b: number,
): { deltaPct: number | null; display: string } {
  if (!Number.isFinite(a) || a === 0) return { deltaPct: null, display: "n.v.t." };
  const raw = ((b - a) / a) * 100;
  const rounded = Math.round(raw);
  const sign = rounded < 0 ? MINUS : "+";
  return { deltaPct: raw, display: `${sign}${Math.abs(rounded)}%` };
}

/** Percentage-point change for rate metrics (CTR), kept as fractions. */
export function ppDelta(
  aFraction: number,
  bFraction: number,
): { deltaPct: number | null; display: string } {
  const diffPp = (bFraction - aFraction) * 100;
  const sign = diffPp < 0 ? MINUS : "+";
  return { deltaPct: diffPp, display: `${sign}${dec(Math.abs(diffPp), 2)} pp` };
}

export function statusFromConversies(deltaPct: number | null): DeckStatus {
  if (deltaPct == null) return "Stabiel";
  if (deltaPct >= STATUS_BAND_PCT) return "Verbeterend";
  if (deltaPct <= -STATUS_BAND_PCT) return "Verslechterend";
  return "Stabiel";
}
