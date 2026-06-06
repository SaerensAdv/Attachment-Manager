// Rough cost estimation for the LLM usage behind every run.
//
// These are *estimates* for an at-a-glance cost indication on the dashboard, not
// billing-accurate figures. They are based on Anthropic's public list price for
// Claude Sonnet 4.x (the model every agent runs on, see generate-engine.ts),
// converted to euro at an approximate, easily-editable FX rate. Adjust the three
// constants below if the model, pricing, or exchange rate changes.

/** Anthropic list price, USD per 1M input tokens (Claude Sonnet 4.x). */
const USD_PER_M_INPUT = 3;
/** Anthropic list price, USD per 1M output tokens (Claude Sonnet 4.x). */
const USD_PER_M_OUTPUT = 15;
/** Approximate USD -> EUR conversion. Editable; not a live rate. */
const EUR_PER_USD = 0.92;

/**
 * Estimated cost in euro for a given input/output token usage. Returns a plain
 * number (euros, fractional); rounding/formatting is the caller's concern.
 */
export function estimateCostEur(
  inputTokens: number,
  outputTokens: number,
): number {
  const usd =
    (inputTokens / 1_000_000) * USD_PER_M_INPUT +
    (outputTokens / 1_000_000) * USD_PER_M_OUTPUT;
  return usd * EUR_PER_USD;
}
