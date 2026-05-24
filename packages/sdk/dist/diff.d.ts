import type { ChatMessage } from "./core/types";
export type DiffOperation = {
    op: "add";
    index: number;
    message: ChatMessage;
} | {
    op: "remove";
    index: number;
};
export interface MessageDiff {
    operations: DiffOperation[];
    tokenDelta: number;
    added: number;
    removed: number;
}
export declare function estimateTokens(messages: readonly ChatMessage[]): number;
export declare function computeMessageDiff(prev: readonly ChatMessage[], curr: readonly ChatMessage[]): MessageDiff;
export declare function applyDiff(base: readonly ChatMessage[], diff: MessageDiff): ChatMessage[];
export declare function replayDiffs(baseSnapshot: readonly ChatMessage[], diffs: MessageDiff[]): ChatMessage[][];
