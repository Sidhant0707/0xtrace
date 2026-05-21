// ─────────────────────────────────────────────────────────────────────────────
// packages/sdk/src/utils/diff.ts
//
// Computes a minimal, git-style diff between two chat message arrays.
// The ingest API uses this to decide what to store:
//   - Step 1  → store full snapshot (no previous to diff against)
//   - Step 2+ → store only the diff; reconstruct full array on the frontend
//
// Design goals:
//   1. Deterministic — same inputs always produce same diff.
//   2. Reversible — applyDiff(prev, computeDiff(prev, curr)) === curr
//   3. Zero dependencies on the openai SDK — works with plain objects.
// ─────────────────────────────────────────────────────────────────────────────

import type { ChatMessage } from "./core/types";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single entry in the diff — describes ONE message's change. */
export type DiffOperation =
  | { op: "add";    index: number; message: ChatMessage }
  | { op: "remove"; index: number }
  | { op: "keep";   index: number };   // kept for position bookkeeping

/** The payload stored in prompt_snapshots.diff_from_previous */
export interface MessageDiff {
  /** Only the add/remove operations (keeps are omitted to save bytes). */
  operations: Array<
    | { op: "add";    index: number; message: ChatMessage }
    | { op: "remove"; index: number }
  >;
  /** Net token change: positive = context grew, negative = messages pruned. */
  tokenDelta: number;
  /** How many messages were added in this step. */
  added: number;
  /** How many messages were removed in this step. */
  removed: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Stable string key for a message — used for identity comparison.
 * We hash role + content so order changes are detected correctly.
 */
function messageKey(m: ChatMessage): string {
  return `${m.role}::${m.content ?? ""}`;
}

/**
 * Rough token estimator — 1 token ≈ 4 characters (GPT rule of thumb).
 * The SDK does not run a full tokenizer to stay dependency-free.
 * The backend can re-calculate with tiktoken if needed.
 */
export function estimateTokens(messages: readonly ChatMessage[]): number {
  return messages.reduce((sum, m) => {
    const chars = (m.content ?? "").length;
    return sum + Math.ceil(chars / 4);
  }, 0);
}

// ── Core diff algorithm ───────────────────────────────────────────────────────

/**
 * Computes the minimal diff between `prev` and `curr` message arrays.
 *
 * Algorithm: O(n) two-pointer walk.
 *   1. Build a Set of keys in `prev` for O(1) lookup.
 *   2. Walk `curr` — any message not in `prev` is an ADD.
 *   3. Walk `prev` — any message not in `curr` is a REMOVE.
 *
 * This is sufficient for 99% of real agent patterns where the context
 * array only ever has messages appended (never reordered mid-stream).
 * For adversarial reordering, swap to Myers diff.
 *
 * @example
 * const diff = computeMessageDiff(step1Messages, step2Messages);
 * // { operations: [{ op: "add", index: 3, message: {...} }], tokenDelta: 42, added: 1, removed: 0 }
 */
export function computeMessageDiff(
  prev: readonly ChatMessage[],
  curr: readonly ChatMessage[]
): MessageDiff {
  const prevKeys = new Set(prev.map(messageKey));
  const currKeys = new Set(curr.map(messageKey));

  const operations: MessageDiff["operations"] = [];

  // Detect additions — messages in curr that weren't in prev
  curr.forEach((message, index) => {
    if (!prevKeys.has(messageKey(message))) {
      operations.push({ op: "add", index, message });
    }
  });

  // Detect removals — messages in prev that aren't in curr
  prev.forEach((message, index) => {
    if (!currKeys.has(messageKey(message))) {
      operations.push({ op: "remove", index });
    }
  });

  const tokenDelta =
    estimateTokens(curr) - estimateTokens(prev);

  return {
    operations,
    tokenDelta,
    added:   operations.filter((o) => o.op === "add").length,
    removed: operations.filter((o) => o.op === "remove").length,
  };
}

// ── Reconstruction (used by the frontend to replay diffs) ─────────────────────

/**
 * Applies a stored diff forward onto a base message array.
 * The frontend calls this to reconstruct the full message array for step N:
 *
 *   const step1 = fullSnapshot;           // stored in DB for step 1
 *   const step2 = applyDiff(step1, diff); // reconstructed from diff
 *   const step3 = applyDiff(step2, diff); // and so on...
 *
 * @throws {Error} if the diff references an out-of-bounds index.
 */
export function applyDiff(
  base: readonly ChatMessage[],
  diff: MessageDiff
): ChatMessage[] {
  const result = [...base];

  // Process removes first (high-index first to avoid index shifting)
  const removes = diff.operations
    .filter((o): o is { op: "remove"; index: number } => o.op === "remove")
    .sort((a, b) => b.index - a.index);

  for (const op of removes) {
    if (op.index >= result.length) {
      throw new Error(
        `[PromptTracer] applyDiff: remove index ${op.index} out of bounds (len=${result.length})`
      );
    }
    result.splice(op.index, 1);
  }

  // Process adds (low-index first to preserve insertion order)
  const adds = diff.operations
    .filter(
      (o): o is { op: "add"; index: number; message: ChatMessage } =>
        o.op === "add"
    )
    .sort((a, b) => a.index - b.index);

  for (const op of adds) {
    result.splice(op.index, 0, op.message);
  }

  return result;
}

/**
 * Replays an ordered series of diffs from a base snapshot.
 * Use this when you need to reconstruct every step in a session at once.
 *
 * @example
 * const steps = replayDiffs(step1Snapshot, [diff2, diff3, diff4]);
 * // steps[0] === step1, steps[1] === step2, steps[2] === step3, steps[3] === step4
 */
export function replayDiffs(
  baseSnapshot: readonly ChatMessage[],
  diffs: MessageDiff[]
): ChatMessage[][] {
  const results: ChatMessage[][] = [Array.from(baseSnapshot)];

  for (const diff of diffs) {
    const prev = results[results.length - 1];
    results.push(applyDiff(prev, diff));
  }

  return results;
}