// app/dashboard/[sessionId]/pressure/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveProjectId } from "@/lib/project-context";
import { PressureChart } from "./PressureChart";

export const metadata: Metadata = { title: "Context Pressure — 0xtrace" };

// ── Model context-window limits (tokens) ─────────────────────────────────────
// Versioned IDs are listed explicitly so real API model strings match exactly.
// getContextLimit() handles unversioned aliases and future models via substring
// fallback.

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "gpt-4o":                       128_000,
  "gpt-4o-mini":                  128_000,
  "gpt-4-turbo":                  128_000,
  "gpt-4-turbo-preview":          128_000,
  "gpt-4-turbo-2024-04-09":       128_000,
  "gpt-4":                          8_192,
  "gpt-4-32k":                     32_768,
  "gpt-3.5-turbo":                 16_385,
  "gpt-3.5-turbo-16k":             16_385,
  "claude-3-opus-20240229":       200_000,
  "claude-3-sonnet-20240229":     200_000,
  "claude-3-haiku-20240307":      200_000,
  "claude-3-5-sonnet-20241022":   200_000,
  "claude-3-5-haiku-20241022":    200_000,
  "claude-3-5-sonnet-20240620":   200_000,
  "claude-sonnet-4-20250514":     200_000,
  "gemini-1.5-pro":             1_048_576,
  "gemini-1.5-flash":           1_048_576,
  "gemini-1.0-pro":                32_000,
  "llama-3.1-8b-instant":         128_000,
  "llama-3.1-70b-versatile":      128_000,
  "mixtral-8x7b-32768":            32_768,
  "gemma2-9b-it":                   8_192,
};

const DEFAULT_CONTEXT_LIMIT = 128_000;

/**
 * Resolve a context-window limit for any model string.
 * Exact match first, then substring fallback for versioned / future aliases.
 * Exported so PressureChart tests can reuse it without a DB round-trip.
 */
export function getContextLimit(model: string): number {
  if (MODEL_CONTEXT_LIMITS[model] !== undefined) return MODEL_CONTEXT_LIMITS[model];
  const lower = model.toLowerCase();
  if (lower.includes("gpt-4o"))       return 128_000;
  if (lower.includes("gpt-4-turbo"))  return 128_000;
  if (lower.includes("gpt-4-32k"))    return  32_768;
  if (lower.includes("gpt-4"))        return   8_192;
  if (lower.includes("gpt-3.5"))      return  16_385;
  if (lower.includes("claude"))       return 200_000;
  if (lower.includes("gemini-1.5"))   return 1_048_576;
  if (lower.includes("gemini"))       return  32_000;
  return DEFAULT_CONTEXT_LIMIT;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LlmCallRow {
  step_index: number;
  tokens_in: number | null;
  model: string;
}

export interface PressureDataPoint {
  stepIndex: number;
  cumulativeTokensIn: number;
  model: string;
}

// ── Data fetcher ──────────────────────────────────────────────────────────────

async function getSessionPressureData(
  projectId: string,
  sessionId: string,
): Promise<{
  data: PressureDataPoint[];
  contextLimit: number;
  model: string;
  maxUtilizationPct: number;
}> {
  const { data } = await supabaseAdmin
    .from("llm_calls")
    .select("step_index, tokens_in, model")
    .eq("project_id", projectId)
    .eq("session_id", sessionId)
    .order("step_index", { ascending: true });

  if (!data || data.length === 0) {
    return { data: [], contextLimit: DEFAULT_CONTEXT_LIMIT, model: "unknown", maxUtilizationPct: 0 };
  }

  const calls = data as LlmCallRow[];

  // Dominant model (most frequent call) drives the context-limit reference line
  const modelCounts = calls.reduce<Record<string, number>>((acc, call) => {
    acc[call.model] = (acc[call.model] ?? 0) + 1;
    return acc;
  }, {});
  const primaryModel =
    Object.entries(modelCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "unknown";

  const contextLimit = getContextLimit(primaryModel);

  // Build cumulative series and track peak utilisation in one pass
  let cumulative = 0;
  let maxUtilizationPct = 0;

  const pressureData: PressureDataPoint[] = calls.map((call) => {
    cumulative += call.tokens_in ?? 0;
    const pct = contextLimit > 0 ? Math.round((cumulative / contextLimit) * 100) : 0;
    if (pct > maxUtilizationPct) maxUtilizationPct = pct;
    return {
      stepIndex: call.step_index,
      cumulativeTokensIn: cumulative,
      model: call.model,
    };
  });

  return { data: pressureData, contextLimit, model: primaryModel, maxUtilizationPct };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PressurePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const projectId = await getActiveProjectId();
  const { data, contextLimit, model, maxUtilizationPct } =
    await getSessionPressureData(projectId, sessionId);

  if (data.length === 0) notFound();

  const tabs = [
    { label: "Overview", href: `/dashboard/${sessionId}` },
    { label: "Diff",     href: `/dashboard/${sessionId}/diff` },
    { label: "Graph",    href: `/dashboard/${sessionId}/graph` },
    { label: "Replay",   href: `/dashboard/${sessionId}/replay` },
    { label: "Pressure", href: `/dashboard/${sessionId}/pressure` },
  ];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-zinc-500 text-sm mb-3 flex-wrap">
          <Link href="/dashboard" className="hover:text-zinc-400 transition-colors">
            Sessions
          </Link>
          <span className="text-zinc-700">/</span>
          <Link
            href={`/dashboard/${sessionId}`}
            className="hover:text-zinc-400 transition-colors font-mono"
          >
            {sessionId.slice(0, 8)}…
          </Link>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-400">Pressure</span>
        </div>

        <h1 className="m-0 text-white text-2xl font-medium leading-tight tracking-[-0.02em]">
          Context Window Pressure
        </h1>
        <p className="mt-1.5 text-zinc-500 text-sm m-0">
          Token consumption per step vs{" "}
          <span className="font-mono text-zinc-400">{model}</span> limit of{" "}
          <span className="font-mono text-zinc-400">
            {contextLimit.toLocaleString()}
          </span>{" "}
          tokens · Peak pressure{" "}
          <span className={maxUtilizationPct >= 80 ? "text-red-400 font-medium" : "text-zinc-400"}>
            {maxUtilizationPct}%
          </span>
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.label === "Pressure";
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`shrink-0 px-3 py-1.5 rounded text-sm transition-colors ${
                isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <PressureChart data={data} contextLimit={contextLimit} />
    </div>
  );
}