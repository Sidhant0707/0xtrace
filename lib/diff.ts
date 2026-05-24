// lib/diff.ts

import stableStringify        from "json-stable-stringify";
import type { ChatMessage }   from "../packages/sdk/src/core/types";

export interface MessageDiff {
  added:      ChatMessage[];
  removed:    ChatMessage[];
  tokenDelta: number;
}

function estimateTokens(messages: readonly ChatMessage[]): number {
  return Math.ceil((stableStringify(messages) ?? "").length / 4);
}

function messageKey(m: ChatMessage): string {
  return stableStringify(m) ?? JSON.stringify(m);
}

export function computeMessageDiff(
  prev: ChatMessage[],
  curr: readonly ChatMessage[]
): MessageDiff {
  const prevKeys = new Set(prev.map(messageKey));
  const currKeys = new Set(curr.map(messageKey));

  const added   = curr.filter((m) => !prevKeys.has(messageKey(m)));
  const removed = prev.filter((m) => !currKeys.has(messageKey(m)));

  return {
    added,
    removed,
    tokenDelta: estimateTokens(curr) - estimateTokens(prev),
  };
}

export function replayDiffs(
  baseSnapshot: ChatMessage[],
  diffs: MessageDiff[]
): ChatMessage[] {
  let current = [...baseSnapshot];

  for (const diff of diffs) {
    const removedKeys = new Set(diff.removed.map(messageKey));
    current = [
      ...current.filter((m) => !removedKeys.has(messageKey(m))),
      ...diff.added,
    ];
  }

  return current;
}