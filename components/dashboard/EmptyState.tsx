// components/dashboard/EmptyState.tsx
// Pure Tailwind animations, no external animation library.

"use client";

import { useState } from "react";
import Link from "next/link";

interface EmptyStateProps {
  context?: "sessions" | "explorer" | "cost" | "anomalies";
}

const MESSAGES = {
  sessions:  { title: "No sessions yet",      description: "Start tracking your LLM app by integrating the SDK. Your first trace will appear here within seconds." },
  explorer:  { title: "No calls tracked",     description: "Individual LLM calls will appear here once you integrate the SDK." },
  cost:      { title: "No cost data yet",     description: "Cost analytics populate automatically as your app makes LLM calls." },
  anomalies: { title: "No anomalies detected", description: "We'll flag high-latency calls and errors here once you start sending traces." },
} as const;

export function EmptyState({ context = "sessions" }: EmptyStateProps) {
  const [copied, setCopied] = useState(false);
  const { title, description } = MESSAGES[context];

  const snippet = `npm install 0xtrace

import { Tracer, wrapOpenAI } from "0xtrace";
import OpenAI from "openai";

const tracer = new Tracer({
  ingestUrl: process.env.INGEST_URL,
  apiKey:    process.env.INGEST_API_KEY,
});

const client = wrapOpenAI(new OpenAI(), tracer);

// Every call is now traced automatically
const res = await client.chat.completions.create({ ... });`;

  async function handleCopy() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center justify-center min-h-[520px] p-8 animate-in fade-in duration-500">
      <div className="max-w-2xl w-full">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-[#111] border border-[#1f1f1f] mb-5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
            </svg>
          </div>
          <h2 className="text-white text-[22px] font-semibold tracking-[-0.02em] mb-2">{title}</h2>
          <p className="text-[#71717a] text-[14px] leading-relaxed max-w-md mx-auto">{description}</p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { n: "1", label: "Install",   sub: "npm install 0xtrace" },
            { n: "2", label: "Wrap",      sub: "wrapOpenAI(client, tracer)" },
            { n: "3", label: "Watch",     sub: "Traces appear in real-time" },
          ].map(({ n, label, sub }) => (
            <div key={n} className="bg-[#111] border border-[#1f1f1f] rounded-lg p-4">
              <div className="w-6 h-6 rounded-full bg-[#3b82f6]/10 border border-[#3b82f6]/20 flex items-center justify-center text-[#3b82f6] text-[11px] font-bold mb-3">
                {n}
              </div>
              <div className="text-white text-[13px] font-medium mb-1">{label}</div>
              <div className="text-[#52525b] text-[11px] font-mono">{sub}</div>
            </div>
          ))}
        </div>

        {/* Code snippet */}
        <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f1f]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#3f3f46]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#3f3f46]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#3f3f46]" />
              <span className="ml-3 font-mono text-[11px] text-[#71717a]">quickstart.ts</span>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className={[
                "h-7 px-3 rounded border text-[11px] font-medium",
                "inline-flex items-center gap-1.5 transition-all duration-150",
                copied
                  ? "bg-[#052e16] border-[#064e3b] text-[#10b981]"
                  : "bg-[#1a1a1a] border-[#333] text-[#a1a1aa] hover:border-[#555] hover:text-white",
              ].join(" ")}
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <pre className="p-5 text-[12px] font-mono text-[#a1a1aa] leading-[1.8] overflow-x-auto whitespace-pre">
            {snippet}
          </pre>
        </div>

        {/* CTAs */}
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/docs"
            className="h-9 px-5 bg-[#3b82f6] rounded-lg text-white text-[13px] font-medium inline-flex items-center hover:bg-[#2563eb] transition-colors no-underline"
          >
            Read Docs
          </Link>
          <Link
            href="/dashboard/settings"
            className="h-9 px-5 bg-transparent border border-[#333] rounded-lg text-[#a1a1aa] text-[13px] font-medium inline-flex items-center hover:border-[#555] hover:text-white transition-colors no-underline"
          >
            View API Keys
          </Link>
        </div>

      </div>
    </div>
  );
}