// components/dashboard/ReplayPlayground.tsx
//
// "use client" — Replay execution UI.
//
// Handles dynamic editing of the historical prompt array, model swapping,
// and consuming the raw UTF-8 ReadableStream from the Replay Engine API.

"use client";

import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "@/packages/sdk/src/core/types";

interface ReplayPlaygroundProps {
  initialMessages: ChatMessage[];
  defaultModel: string;
  availableModels: string[];
}

export function ReplayPlayground({
  initialMessages,
  defaultModel,
  availableModels,
}: ReplayPlaygroundProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [model, setModel] = useState(defaultModel);
  const [isStreaming, setIsStreaming] = useState(false);
  const [output, setOutput] = useState("");
  const [latency, setLatency] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll output window during stream
  useEffect(() => {
    if (isStreaming && outputEndRef.current) {
      outputEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [output, isStreaming]);

  function handleMessageChange(index: number, newContent: string) {
    const updated = [...messages];
    updated[index] = { ...updated[index], content: newContent };
    setMessages(updated);
  }

  async function handleRun() {
    if (isStreaming) {
      abortControllerRef.current?.abort();
      setIsStreaming(false);
      return;
    }

    setIsStreaming(true);
    setOutput("");
    setLatency(null);
    abortControllerRef.current = new AbortController();

    const startTime = Date.now();

    try {
      const res = await fetch("/api/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, model }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Execution failed");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        setOutput((prev) => prev + chunk);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name !== "AbortError") {
          setOutput(`[Error]: ${err.message}`);
        }
      } else {
        setOutput(`[Error]: ${String(err)}`);
      }
    } finally {
      setIsStreaming(false);
      setLatency(Date.now() - startTime);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-6 min-h-[600px]">
      {/* ── LEFT: Prompt Editor ── */}
      <div className="bg-[#111] border border-[#1f1f1f] rounded-lg flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1f1f1f] bg-[#0a0a0a] flex items-center justify-between">
          <h2 className="m-0 text-white text-sm font-medium">Edit Prompt</h2>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            title="Select Model"
            aria-label="Select Model"
            className="h-8 appearance-none bg-[#080808] border border-[#262626] rounded pl-3 pr-8 text-xs text-[#e4e4e7] outline-none focus:border-[#3b82f6] cursor-pointer font-mono"
          >
            {availableModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {messages.map((msg, idx) => (
            <div key={idx} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] uppercase tracking-wider font-medium ${msg.role === "user" ? "text-[#3b82f6]" : msg.role === "system" ? "text-[#f59e0b]" : "text-[#10b981]"}`}
                >
                  {msg.role}
                </span>
              </div>
              <textarea
                value={msg.content || ""}
                onChange={(e) => handleMessageChange(idx, e.target.value)}
                aria-label={`${msg.role} message`}
                title={`${msg.role} message`}
                placeholder={`Enter ${msg.role} message...`}
                className="w-full bg-[#080808] border border-[#262626] rounded-md p-3 text-[13px] text-[#e4e4e7] font-mono outline-none focus:border-[#555] transition-colors resize-y min-h-[80px]"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT: Execution Output ── */}
      <div className="bg-[#111] border border-[#1f1f1f] rounded-lg flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1f1f1f] bg-[#0a0a0a] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="m-0 text-white text-sm font-medium">Output</h2>
            {latency !== null && !isStreaming && (
              <span className="text-[#a1a1aa] font-mono text-[11px]">
                {(latency / 1000).toFixed(2)}s
              </span>
            )}
          </div>
          <button
            onClick={handleRun}
            className={`h-8 px-4 rounded text-xs font-medium transition-all ${
              isStreaming
                ? "bg-[#1f0a0a] border border-[#4a1111] text-[#f43f5e] hover:bg-[#2a0e0e]"
                : "bg-[#1a2744] border border-[#1e3a8a] text-[#3b82f6] hover:bg-[#1e3a5f]"
            }`}
          >
            {isStreaming ? "Stop Execution" : "Run Model →"}
          </button>
        </div>

        <div className="flex-1 p-5 font-mono text-[13px] leading-relaxed text-[#e4e4e7] overflow-y-auto whitespace-pre-wrap bg-[#080808]">
          {output || (
            <span className="text-[#52525b]">
              Hit run to execute the prompt against {model}...
            </span>
          )}
          {isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-[#3b82f6] animate-pulse" />
          )}
          <div ref={outputEndRef} />
        </div>
      </div>
    </div>
  );
}
