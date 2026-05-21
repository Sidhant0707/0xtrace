// lib/cost.ts
// Cost formatting utilities for the dashboard.
// Duplicated from packages/sdk/src/utils/cost.ts intentionally —
// the app and the SDK are separate compilation units.

export function formatCostUsd(usd: number): string {
  if (usd === 0)    return "$0.00";
  if (usd < 0.0001) return `$${usd.toFixed(8).replace(/0+$/, "")}`;
  if (usd < 0.01)   return `$${usd.toFixed(6).replace(/0+$/, "")}`;
  return `$${usd.toFixed(4)}`;
}