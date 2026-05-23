// components/dashboard/SessionExplorer.tsx
"use client";

import { useState } from "react";
import type { ChatMessage } from "@/packages/sdk/src/core/types";

// ── Types (moved inline — source file was deleted) ────────────────────────────

interface StepDetails {
  step_index: number;
  model: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  estimated_cost_usd: number;
  timestamp: string;
  has_anomaly: boolean;
}

interface JsonDiffDelta {
  path: (string | number)[];
  type: "added" | "removed" | "modified";
  oldValue?: unknown;
  newValue?: unknown;
}

interface PromptSnapshot {
  step_index: number;
  full_snapshot: ChatMessage[] | null;
  diff_from_previous: JsonDiffDelta[] | null;
}

// ── Actual shape stored by drain-queue cron via lib/diff.ts ──────────────────

interface StoredDiff {
  added: ChatMessage[];
  removed: ChatMessage[];
  tokenDelta: number;
}

interface SessionExplorerProps {
  timeline: StepDetails[];
  snapshots: PromptSnapshot[];
}

export function SessionExplorer({ timeline, snapshots }: SessionExplorerProps) {
  const [activeStepIndex, setActiveStepIndex] = useState<number>(
    timeline.length > 0 ? timeline[timeline.length - 1].step_index : 1,
  );

  const activeStep = timeline.find((s) => s.step_index === activeStepIndex);
  const activeSnapshot = snapshots.find(
    (s) => s.step_index === activeStepIndex,
  );

  const diff = activeSnapshot?.diff_from_previous
    ? (activeSnapshot.diff_from_previous as unknown as StoredDiff)
    : null;

  return (
    <div className="flex w-full h-full min-h-[600px]">
      {/* ── Left Rail: Timeline ── */}
      <div className="w-[320px] min-w-[320px] border-r border-[#1f1f1f] flex flex-col bg-[#0a0a0a]">
        <div className="p-4 border-b border-[#1f1f1f]">
          <h2 className="text-xs uppercase tracking-widest text-[#71717a] font-medium">
            Execution Timeline
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {timeline.map((step) => {
            const isActive = step.step_index === activeStepIndex;
            return (
              <button
                key={step.step_index}
                onClick={() => setActiveStepIndex(step.step_index)}
                className={[
                  "w-full text-left p-3 rounded-lg border transition-all duration-200",
                  isActive
                    ? step.has_anomaly
                      ? "bg-amber-950/20 border-amber-500/30 ring-1 ring-amber-500/20"
                      : "bg-[#1f1f1f] border-[#333] ring-1 ring-zinc-700/50"
                    : "bg-transparent border-transparent hover:bg-[#161616] hover:border-[#262626]",
                ].join(" ")}
              >
                <div className="flex justify-between items-start mb-2">
                  <span
                    className={[
                      "text-sm font-semibold",
                      isActive ? "text-white" : "text-zinc-400",
                    ].join(" ")}
                  >
                    Step {step.step_index}
                  </span>
                  <span
                    className={[
                      "text-xs font-mono px-1.5 py-0.5 rounded",
                      isActive
                        ? "bg-[#262626] text-zinc-300"
                        : "bg-[#111] text-zinc-500",
                    ].join(" ")}
                  >
                    {step.latency_ms}ms
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                    In: {step.tokens_in}
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500/50" />
                    Out: {step.tokens_out}
                  </div>
                </div>

                {step.has_anomaly && (
                  <div className="mt-2 text-[10px] uppercase tracking-wider text-amber-500 font-medium">
                    Anomaly Detected
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right Rail: Context X-Ray ── */}
      <div className="flex-1 flex flex-col bg-[#0f0f0f] overflow-hidden">
        <div className="p-4 border-b border-[#1f1f1f] flex justify-between items-center bg-[#0a0a0a]">
          <h2 className="text-xs uppercase tracking-widest text-[#71717a] font-medium flex items-center gap-2">
            Context X-Ray <span className="text-zinc-600">—</span> Step{" "}
            {activeStepIndex}
          </h2>
          {activeStep && (
            <div className="flex gap-4 text-xs font-mono text-zinc-500">
              <span>
                Tokens: {activeStep.tokens_in + activeStep.tokens_out}
              </span>
              <span>Cost: ${activeStep.estimated_cost_usd.toFixed(4)}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-[#0a0a0a] p-4 text-sm font-mono leading-relaxed">
          {!activeSnapshot ? (
            <div className="h-full flex items-center justify-center text-zinc-600">
              No snapshot data available for this step.
            </div>
          ) : activeSnapshot.full_snapshot ? (
            <div className="space-y-6">
              {activeSnapshot.full_snapshot.map(
                (msg: ChatMessage, idx: number) => (
                  <div
                    key={idx}
                    className="border border-[#1f1f1f] rounded bg-[#111] overflow-hidden"
                  >
                    <div className="bg-[#161616] px-3 py-1.5 border-b border-[#1f1f1f]">
                      <span
                        className={[
                          "text-xs font-bold uppercase tracking-wider",
                          msg.role === "user"
                            ? "text-blue-400"
                            : msg.role === "assistant"
                              ? "text-emerald-400"
                              : msg.role === "system"
                                ? "text-purple-400"
                                : "text-amber-400",
                        ].join(" ")}
                      >
                        {msg.role}
                      </span>
                    </div>
                    <pre className="p-3 text-zinc-300 whitespace-pre-wrap break-words">
                      {msg.content ?? "(no content)"}
                    </pre>
                  </div>
                ),
              )}
            </div>
          ) : diff ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs text-zinc-500 uppercase tracking-widest">
                  Changes from previous step
                </span>
                <span
                  className={[
                    "font-mono text-xs px-2 py-0.5 rounded border",
                    diff.tokenDelta > 0
                      ? "text-amber-400 bg-amber-950/20 border-amber-900/50"
                      : "text-emerald-400 bg-emerald-950/20 border-emerald-900/50",
                  ].join(" ")}
                >
                  {diff.tokenDelta > 0 ? "+" : ""}
                  {diff.tokenDelta} tokens
                </span>
              </div>

              {diff.removed.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-widest text-rose-500 font-medium">
                    Removed ({diff.removed.length})
                  </div>
                  {diff.removed.map((msg, idx) => (
                    <div
                      key={idx}
                      className="border border-rose-900/50 bg-rose-950/10 rounded overflow-hidden"
                    >
                      <div className="px-3 py-1.5 text-xs font-medium border-b border-rose-900/50 text-rose-500 bg-rose-950/30">
                        {msg.role}
                      </div>
                      <pre className="p-3 text-rose-300/70 whitespace-pre-wrap break-words line-through">
                        {msg.content ?? "(no content)"}
                      </pre>
                    </div>
                  ))}
                </div>
              )}

              {diff.added.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-widest text-emerald-500 font-medium">
                    Added ({diff.added.length})
                  </div>
                  {diff.added.map((msg, idx) => (
                    <div
                      key={idx}
                      className="border border-emerald-900/50 bg-emerald-950/10 rounded overflow-hidden"
                    >
                      <div className="px-3 py-1.5 text-xs font-medium border-b border-emerald-900/50 text-emerald-500 bg-emerald-950/30">
                        {msg.role}
                      </div>
                      <pre className="p-3 text-emerald-300 whitespace-pre-wrap break-words">
                        {msg.content ?? "(no content)"}
                      </pre>
                    </div>
                  ))}
                </div>
              )}

              {diff.removed.length === 0 && diff.added.length === 0 && (
                <div className="flex items-center justify-center py-8 text-zinc-600 text-xs">
                  No message changes this step — only token count shifted.
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-600">
              Snapshot structure is invalid or empty.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
