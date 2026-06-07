/**
 * Places signals — pure, read-only diagnostics derived only from the Places
 * data we already pulled (rating, review count, business status). No new API
 * call, no invented numbers: every signal is grounded in real fields, so it is
 * safe to surface directly to the agents as observations.
 *
 * The goal is to turn raw place listings into a few sharp, Dutch observations
 * that put the client's local reputation in competitive context ("concurrent X
 * heeft 4,8 sterren over 320 reviews — duidelijk sterker dan de klant").
 */

export type PlaceSignalSeverity = "high" | "warning" | "info";

export interface PlaceSignal {
  severity: PlaceSignalSeverity;
  /** Stable machine code (handy for tests / future filtering). */
  code: string;
  /** Dutch, human-readable observation for the agent + reviewer. */
  message: string;
}

/** One normalized place listing (client or competitor). */
export interface PlaceRecord {
  /** The raw query the caller asked for. */
  query: string;
  /** "client" or "competitor" — drives how signals are framed. */
  role: "client" | "competitor";
  /** Resolved display name, or "" if nothing was found. */
  name: string;
  /** Whether a listing was found at all. */
  found: boolean;
  /** Average star rating (0 when unknown). */
  rating: number;
  /** Number of user reviews (0 when unknown). */
  reviewCount: number;
  /** Primary category as reported by Places (e.g. "car_repair"), or "". */
  primaryType: string;
  formattedAddress: string;
  /** "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | "". */
  businessStatus: string;
}

export interface PlaceSignalThresholds {
  /** Below this rating the client's listing is flagged as a reputation risk. */
  lowRatingThreshold: number;
  /** Fewer reviews than this is flagged as thin social proof. */
  lowReviewThreshold: number;
  /** A competitor leading the client by this many reviews is notable. */
  reviewLeadFactor: number;
}

export const DEFAULT_PLACE_THRESHOLDS: PlaceSignalThresholds = {
  lowRatingThreshold: 4.0,
  lowReviewThreshold: 20,
  reviewLeadFactor: 2,
};

/**
 * Derive read-only diagnostic signals from client + competitor place listings.
 * Ordered by severity (high first). Pure and deterministic.
 */
export function computePlaceSignals(
  records: PlaceRecord[],
  thresholds: Partial<PlaceSignalThresholds> = {},
): PlaceSignal[] {
  const t = { ...DEFAULT_PLACE_THRESHOLDS, ...thresholds };
  const high: PlaceSignal[] = [];
  const warnings: PlaceSignal[] = [];
  const infos: PlaceSignal[] = [];

  const client = records.find((r) => r.role === "client" && r.found);
  const competitors = records.filter((r) => r.role === "competitor" && r.found);

  if (client) {
    if (client.businessStatus && client.businessStatus !== "OPERATIONAL") {
      high.push({
        severity: "high",
        code: "places-client-not-operational",
        message:
          `De Google-listing van ${client.name} staat niet als operationeel ` +
          `(${client.businessStatus}). Dit moet dringend nagekeken worden.`,
      });
    }
    if (client.rating > 0 && client.rating < t.lowRatingThreshold) {
      warnings.push({
        severity: "warning",
        code: "places-client-low-rating",
        message:
          `${client.name} heeft een Google-rating van ${client.rating.toFixed(1)} ` +
          `(${client.reviewCount} reviews) — onder de drempel van ${t.lowRatingThreshold.toFixed(1)}.`,
      });
    }
    if (client.reviewCount > 0 && client.reviewCount < t.lowReviewThreshold) {
      warnings.push({
        severity: "warning",
        code: "places-client-few-reviews",
        message:
          `${client.name} heeft slechts ${client.reviewCount} Google-reviews — ` +
          `weinig sociale bewijskracht. Een review-campagne kan helpen.`,
      });
    }

    // Competitor reputation lead.
    for (const c of competitors) {
      if (
        c.reviewCount >= client.reviewCount * t.reviewLeadFactor &&
        c.reviewCount > 0
      ) {
        infos.push({
          severity: "info",
          code: "places-competitor-review-lead",
          message:
            `Concurrent ${c.name} heeft ${c.reviewCount} reviews ` +
            `(rating ${c.rating.toFixed(1)}) tegenover ${client.reviewCount} bij ${client.name} — ` +
            `een sterke voorsprong in lokale zichtbaarheid.`,
        });
      }
    }
  }

  return [...high, ...warnings, ...infos];
}

/** Render signals as a compact Dutch markdown block, or "" if none. */
export function renderPlaceSignals(signals: PlaceSignal[]): string {
  if (signals.length === 0) return "";
  const icon: Record<PlaceSignalSeverity, string> = {
    high: "[!]",
    warning: "[~]",
    info: "[i]",
  };
  return signals.map((s) => `${icon[s.severity]} ${s.message}`).join("\n");
}
