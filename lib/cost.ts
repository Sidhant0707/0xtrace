// lib/cost.ts
//
// Cost utilities for the Next.js app.
// Intentionally separate from packages/sdk/src/utils/cost.ts —
// the app and the SDK are different compilation units with different
// module format requirements. Keep both files in sync manually.

// ── Types ─────────────────────────────────────────────────────────────────────

interface ModelPrice {
  /** USD per 1M input tokens */
  inputPer1M:  number;
  /** USD per 1M output tokens */
  outputPer1M: number;
}

export interface CalcCostParams {
  model:     string;
  tokensIn:  number;
  tokensOut: number;
}

// ── Pricing table ─────────────────────────────────────────────────────────────

const MODEL_PRICES: Record<string, ModelPrice> = {
  // OpenAI
  "gpt-4o":        { inputPer1M:  2.50, outputPer1M: 10.00 },
  "gpt-4o-mini":   { inputPer1M:  0.15, outputPer1M:  0.60 },
  "gpt-4-turbo":   { inputPer1M: 10.00, outputPer1M: 30.00 },
  "gpt-4":         { inputPer1M: 30.00, outputPer1M: 60.00 },
  "gpt-3.5-turbo": { inputPer1M:  0.50, outputPer1M:  1.50 },
  "o1":            { inputPer1M: 15.00, outputPer1M: 60.00 },
  "o1-mini":       { inputPer1M:  3.00, outputPer1M: 12.00 },
  "o3-mini":       { inputPer1M:  1.10, outputPer1M:  4.40 },
  // Anthropic
  "claude-opus-4":       { inputPer1M: 15.00, outputPer1M: 75.00 },
  "claude-sonnet-4":     { inputPer1M:  3.00, outputPer1M: 15.00 },
  "claude-haiku-4":      { inputPer1M:  0.80, outputPer1M:  4.00 },
  "claude-3-5-sonnet":   { inputPer1M:  3.00, outputPer1M: 15.00 },
  "claude-3-5-haiku":    { inputPer1M:  0.80, outputPer1M:  4.00 },
  "claude-3-opus":       { inputPer1M: 15.00, outputPer1M: 75.00 },
  // Google
  "gemini-1.5-pro":      { inputPer1M:  3.50, outputPer1M: 10.50 },
  "gemini-1.5-flash":    { inputPer1M:  0.35, outputPer1M:  1.05 },
  "gemini-2.0-flash":    { inputPer1M:  0.10, outputPer1M:  0.40 },
  // Groq (paid tier)
  "llama-3.3-70b-versatile": { inputPer1M: 0.59, outputPer1M: 0.79 },
  "llama-3.1-8b-instant":    { inputPer1M: 0.05, outputPer1M: 0.08 },
  "mixtral-8x7b-32768":      { inputPer1M: 0.24, outputPer1M: 0.24 },
};

const UNKNOWN_PRICE: ModelPrice = { inputPer1M: 0, outputPer1M: 0 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolvePrice(model: string): ModelPrice {
  const normalised = model.toLowerCase().trim();
  if (normalised in MODEL_PRICES) return MODEL_PRICES[normalised];
  for (const key of Object.keys(MODEL_PRICES)) {
    if (normalised.startsWith(key)) return MODEL_PRICES[key];
  }
  return UNKNOWN_PRICE;
}

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * Returns estimated USD cost for a single LLM call.
 * Returns 0 for unrecognised models — never throws.
 * This is what drain-queue/route.ts imports to recalculate cost server-side.
 */
export function calcCostUsd({ model, tokensIn, tokensOut }: CalcCostParams): number {
  const price      = resolvePrice(model);
  const inputCost  = (tokensIn  / 1_000_000) * price.inputPer1M;
  const outputCost = (tokensOut / 1_000_000) * price.outputPer1M;
  return Math.round((inputCost + outputCost) * 1e8) / 1e8;
}

/**
 * Formats a USD cost for display in the dashboard.
 * Used by MetricCard, SessionsTable, and diff viewer metadata panel.
 */
export function formatCostUsd(usd: number): string {
  if (usd === 0)     return "$0.00";
  if (usd < 0.0001)  return `$${usd.toFixed(8).replace(/0+$/, "")}`;
  if (usd < 0.01)    return `$${usd.toFixed(6).replace(/0+$/, "")}`;
  return `$${usd.toFixed(4)}`;
}