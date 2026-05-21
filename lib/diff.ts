// lib/diff.ts
import type { ChatMessage } from "../packages/sdk/src/core/types";

export interface MessageDiff {
  added: ChatMessage[];
  removed: ChatMessage[];
  tokenDelta: number;
}

function estimateTokens(messages: readonly ChatMessage[]): number {
  return Math.ceil(JSON.stringify(messages).length / 4);
}

/**
 * Computes the diff between two message arrays.
 * Uses role+content identity — no positional comparison.
 * The frontend replays these diffs forward from step 1 to reconstruct
 * the full context window at any step.
 */
export function computeMessageDiff(
  prev: ChatMessage[],
  curr: readonly ChatMessage[]
): MessageDiff {
  const added = curr.filter(
    (m) => !prev.some((p) => p.role === m.role && p.content === m.content)
  );
  const removed = prev.filter(
    (m) => !curr.some((c) => c.role === m.role && c.content === m.content)
  );
  const tokenDelta = estimateTokens(curr) - estimateTokens(prev);

  return { added, removed, tokenDelta };
}

/**
 * Reconstructs the full message array at step N by replaying diffs
 * forward from the base snapshot (step 1).
 * Used by the frontend to render the full context at any point.
 */
export function replayDiffs(
  baseSnapshot: ChatMessage[],
  diffs: MessageDiff[]
): ChatMessage[] {
  let current = [...baseSnapshot];

  for (const diff of diffs) {
    // Remove messages that were removed in this step
    current = current.filter(
      (m) => !diff.removed.some((r) => r.role === m.role && r.content === m.content)
    );
    // Add messages that were added in this step
    current = [...current, ...diff.added];
  }

  return current;
}