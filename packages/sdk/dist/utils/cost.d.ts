export interface CalcCostParams {
    model: string;
    tokensIn: number;
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
export declare function calcCostUsd({ model, tokensIn, tokensOut }: CalcCostParams): number;
/**
 * Formats a USD cost as a human-readable string.
 * @example formatCost(0.0075) → "$0.0075"
 * @example formatCost(0.00000120) → "$0.0000012"
 */
export declare function formatCostUsd(usd: number): string;
