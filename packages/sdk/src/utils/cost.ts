// ─────────────────────────────────────────────────────────────────────────────
// packages/sdk/src/utils/cost.ts
//
// Calculates estimated USD cost for a single LLM call.
// Prices are per 1 million tokens (as published by each provider).
// Update MODEL_PRICES when providers change pricing.
// ─────────────────────────────────────────────────────────────────────────────

interface ModelPrice {
  /** USD per 1M input tokens  */
  inputPer1M:  number;
  /** USD per 1M output tokens */
  outputPer1M: number;
}

/**
 * Pricing table keyed by model string.
 * Keys are matched with startsWith() so "gpt-4o-mini-2024-07-18" resolves
 * to the "gpt-4o-mini" entry automatically.
 */
const MODEL_PRICES: Record<string, ModelPrice> = {
  // ── OpenAI ──────────────────────────────────────────────────────────────
  "gpt-4o":                   { inputPer1M:  2.50, outputPer1M: 10.00 },
  "gpt-4o-mini":              { inputPer1M:  0.15, outputPer1M:  0.60 },
  "gpt-4-turbo":              { inputPer1M: 10.00, outputPer1M: 30.00 },
  "gpt-4":                    { inputPer1M: 30.00, outputPer1M: 60.00 },
  "gpt-3.5-turbo":            { inputPer1M:  0.50, outputPer1M:  1.50 },
  "o1":                       { inputPer1M: 15.00, outputPer1M: 60.00 },
  "o1-mini":                  { inputPer1M:  3.00, outputPer1M: 12.00 },
  "o3-mini":                  { inputPer1M:  1.10, outputPer1M:  4.40 },

  // ── Anthropic ───────────────────────────────────────────────────────────
  "claude-opus-4":            { inputPer1M: 15.00, outputPer1M: 75.00 },
  "claude-sonnet-4":          { inputPer1M:  3.00, outputPer1M: 15.00 },
  "claude-haiku-4":           { inputPer1M:  0.80, outputPer1M:  4.00 },
  "claude-3-5-sonnet":        { inputPer1M:  3.00, outputPer1M: 15.00 },
  "claude-3-5-haiku":         { inputPer1M:  0.80, outputPer1M:  4.00 },
  "claude-3-opus":            { inputPer1M: 15.00, outputPer1M: 75.00 },

  // ── Google ──────────────────────────────────────────────────────────────
  "gemini-1.5-pro":           { inputPer1M:  3.50, outputPer1M: 10.50 },
  "gemini-1.5-flash":         { inputPer1M:  0.35, outputPer1M:  1.05 },
  "gemini-2.0-flash":         { inputPer1M:  0.10, outputPer1M:  0.40 },
};

/** Fallback when the model string is unrecognised. */
const UNKNOWN_PRICE: ModelPrice = { inputPer1M: 0, outputPer1M: 0 };

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolves a model string to its price entry.
 * Tries exact match first, then prefix match (handles dated model variants).
 */
function resolvePrice(model: string): ModelPrice {
  const normalised = model.toLowerCase().trim();

  // 1. Exact match
  if (normalised in MODEL_PRICES) return MODEL_PRICES[normalised];

  // 2. Prefix match — e.g. "gpt-4o-2024-11-20" → "gpt-4o"
  for (const key of Object.keys(MODEL_PRICES)) {
    if (normalised.startsWith(key)) return MODEL_PRICES[key];
  }

  return UNKNOWN_PRICE;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface CalcCostParams {
  model:     string;
  tokensIn:  number;
  tokensOut: number;
}

/**
 * Returns the estimated USD cost for a single LLM call.
 * Returns 0 for unrecognised models rather than throwing, so the SDK
 * never crashes user code due to a missing pricing entry.
 *
 * @example
 * calcCostUsd({ model: "gpt-4o", tokensIn: 1000, tokensOut: 500 })
 * // → 0.00750
 */
export function calcCostUsd({ model, tokensIn, tokensOut }: CalcCostParams): number {
  const price = resolvePrice(model);
  const inputCost  = (tokensIn  / 1_000_000) * price.inputPer1M;
  const outputCost = (tokensOut / 1_000_000) * price.outputPer1M;
  // Round to 8 decimal places to avoid floating-point noise in the DB.
  return Math.round((inputCost + outputCost) * 1e8) / 1e8;
}

/**
 * Formats a USD cost as a human-readable string.
 * @example formatCost(0.0075) → "$0.0075"
 * @example formatCost(0.00000120) → "$0.0000012"
 */
export function formatCostUsd(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.0001) return `$${usd.toFixed(8).replace(/0+$/, "")}`;
  if (usd < 0.01)   return `$${usd.toFixed(6).replace(/0+$/, "")}`;
  return `$${usd.toFixed(4)}`;
}