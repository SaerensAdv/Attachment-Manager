/**
 * Shared money helpers for the revenue/fee features. Client fiches and
 * klantgroepen (kapstok) both carry an optional monthly fee, so they validate it
 * identically through this single helper.
 */

/** The agency's monthly gross-revenue target (whole euros) the dashboard tracks
 * progress towards. Single source of truth — change here to move the goal. */
export const MONTHLY_REVENUE_GOAL_EUR = 10_000;

/** Upper sanity bound for a single monthly fee (whole euros). */
export const MAX_MONTHLY_FEE_EUR = 1_000_000;

/**
 * Parse the optional monthly fee (whole euros) from a request body. Returns the
 * amount, `null` when absent / cleared, or an error string when malformed.
 * A blank (or whitespace-only) string means "nog niet ingevuld" → null, not 0.
 */
export function parseMonthlyFee(
  raw: unknown,
): number | null | { error: string } {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const n = typeof raw === "string" ? Number(raw.trim()) : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return {
      error: "Maandelijkse fee moet een geheel bedrag in euro zijn (0 of meer).",
    };
  }
  if (n > MAX_MONTHLY_FEE_EUR) {
    return { error: "Maandelijkse fee is onrealistisch hoog." };
  }
  return n;
}
