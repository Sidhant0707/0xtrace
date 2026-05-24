// packages/sdk/src/diff.ts

import type { ChatMessage } from "./core/types";

export type DiffOperation =
  | { op: "add";    index: number; message: ChatMessage }
  | { op: "remove"; index: number };

export interface MessageDiff {
  operations: DiffOperation[];
  tokenDelta: number;
  added:      number;
  removed:    number;
}

// Inline recursive key-sorter — keeps the SDK dependency-free.
// Handles nested objects inside message content without pulling in
// json-stable-stringify as an external package.
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value))              return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.keys(value as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((value as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return value;
}

function messageKey(m: ChatMessage): string {
  return JSON.stringify(sortKeys(m));
}

export function estimateTokens(messages: readonly ChatMessage[]): number {
  return messages.reduce(
    (sum, m) => sum + Math.ceil((m.content ?? "").length / 4),
    0
  );
}

export function computeMessageDiff(
  prev: readonly ChatMessage[],
  curr: readonly ChatMessage[]
): MessageDiff {
  const prevKeys = new Set(prev.map(messageKey));
  const currKeys = new Set(curr.map(messageKey));

  const operations: DiffOperation[] = [];

  curr.forEach((message, index) => {
    if (!prevKeys.has(messageKey(message))) {
      operations.push({ op: "add", index, message });
    }
  });

  prev.forEach((_message, index) => {
    if (!currKeys.has(messageKey(prev[index]))) {
      operations.push({ op: "remove", index });
    }
  });

  return {
    operations,
    tokenDelta: estimateTokens(curr) - estimateTokens(prev),
    added:      operations.filter((o) => o.op === "add").length,
    removed:    operations.filter((o) => o.op === "remove").length,
  };
}

export function applyDiff(
  base: readonly ChatMessage[],
  diff: MessageDiff
): ChatMessage[] {
  const result = [...base];

  const removes = diff.operations
    .filter((o): o is { op: "remove"; index: number } => o.op === "remove")
    .sort((a, b) => b.index - a.index);

  for (const op of removes) {
    if (op.index >= result.length) {
      throw new Error(
        `[applyDiff] remove index ${op.index} out of bounds (len=${result.length})`
      );
    }
    result.splice(op.index, 1);
  }

  const adds = diff.operations
    .filter((o): o is { op: "add"; index: number; message: ChatMessage } =>
      o.op === "add"
    )
    .sort((a, b) => a.index - b.index);

  for (const op of adds) {
    result.splice(op.index, 0, op.message);
  }

  return result;
}

export function replayDiffs(
  baseSnapshot: readonly ChatMessage[],
  diffs: MessageDiff[]
): ChatMessage[][] {
  const results: ChatMessage[][] = [Array.from(baseSnapshot)];

  for (const diff of diffs) {
    results.push(applyDiff(results[results.length - 1], diff));
  }

  return results;
}