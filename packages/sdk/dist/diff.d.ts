import type { ChatMessage } from "./core/types";
/** A single entry in the diff — describes ONE message's change. */
export type DiffOperation = {
    op: "add";
    index: number;
    message: ChatMessage;
} | {
    op: "remove";
    index: number;
} | {
    op: "keep";
    index: number;
};
/** The payload stored in prompt_snapshots.diff_from_previous */
export interface MessageDiff {
    /** Only the add/remove operations (keeps are omitted to save bytes). */
    operations: Array<{
        op: "add";
        index: number;
        message: ChatMessage;
    } | {
        op: "remove";
        index: number;
    }>;
    /** Net token change: positive = context grew, negative = messages pruned. */
    tokenDelta: number;
    /** How many messages were added in this step. */
    added: number;
    /** How many messages were removed in this step. */
    removed: number;
}
/**
 * Rough token estimator — 1 token ≈ 4 characters (GPT rule of thumb).
 * The SDK does not run a full tokenizer to stay dependency-free.
 * The backend can re-calculate with tiktoken if needed.
 */
export declare function estimateTokens(messages: readonly ChatMessage[]): number;
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
export declare function computeMessageDiff(prev: readonly ChatMessage[], curr: readonly ChatMessage[]): MessageDiff;
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
export declare function applyDiff(base: readonly ChatMessage[], diff: MessageDiff): ChatMessage[];
/**
 * Replays an ordered series of diffs from a base snapshot.
 * Use this when you need to reconstruct every step in a session at once.
 *
 * @example
 * const steps = replayDiffs(step1Snapshot, [diff2, diff3, diff4]);
 * // steps[0] === step1, steps[1] === step2, steps[2] === step3, steps[3] === step4
 */
export declare function replayDiffs(baseSnapshot: readonly ChatMessage[], diffs: MessageDiff[]): ChatMessage[][];
