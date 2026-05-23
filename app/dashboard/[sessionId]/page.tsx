// app/dashboard/[sessionId]/page.tsx
// ============================================================================
// Session Detail Page (v2 Multi-Tenant) - FIXED
// ============================================================================
// CRITICAL FIX: params is a Promise in Next.js 15+ → must await before access
//
// This page shows:
// - All LLM calls in a session
// - Token usage per step
// - Cost breakdown
// - Link to diff viewer and replay engine

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveProjectId } from "@/lib/project-context";
import { formatCostUsd } from "@/lib/cost";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ sessionId: string }>; // ← CRITICAL: params is a Promise
}

interface LlmCall {
  call_id: string;
  session_id: string;
  step_index: number;
  model: string;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number;
  estimated_cost_usd: number | null;
  is_stream: boolean;
  response: string | null;
  sdk_version: string | null;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

// ── Data Fetching ─────────────────────────────────────────────────────────────

async function getSessionData(projectId: string, sessionId: string) {
  const { data, error } = await supabaseAdmin
    .from("llm_calls")
    .select("*")
    .eq("project_id", projectId) // ← Security: scope to project
    .eq("session_id", sessionId)
    .order("step_index", { ascending: true });

  if (error) {
    console.error("[session-detail] query failed:", error.message);
    return null;
  }

  return data as LlmCall[];
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { sessionId } = await params; // ← CRITICAL: await params

  return {
    title: `Session ${sessionId.slice(0, 8)} - 0xtrace`,
  };
}

// ── Page Component ────────────────────────────────────────────────────────────

export default async function SessionDetailPage({ params }: PageProps) {
  // ── CRITICAL FIX: await params BEFORE accessing properties ─────────────────
  const { sessionId } = await params;

  // ── Get active project (validates ownership) ────────────────────────────────
  const projectId = await getActiveProjectId();

  // ── Fetch session data ──────────────────────────────────────────────────────
  const calls = await getSessionData(projectId, sessionId);

  // ── Handle not found ────────────────────────────────────────────────────────
  if (!calls || calls.length === 0) {
    notFound();
  }

  // ── Aggregate metrics ───────────────────────────────────────────────────────
  const totalCost = calls.reduce(
    (sum, call) => sum + (call.estimated_cost_usd ?? 0),
    0,
  );

  const totalTokens = calls.reduce(
    (sum, call) => sum + (call.tokens_in ?? 0) + (call.tokens_out ?? 0),
    0,
  );

  const avgLatency =
    calls.reduce((sum, call) => sum + call.latency_ms, 0) / calls.length;

  const firstCall = calls[0];
  const model = firstCall.model;

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/dashboard"
              className="text-zinc-500 hover:text-zinc-400 transition-colors"
            >
              ← Sessions
            </Link>
            <span className="text-zinc-700">/</span>
            <h1 className="text-2xl font-medium text-white m-0">
              {sessionId.slice(0, 12)}...
            </h1>
          </div>
          <p className="text-zinc-400 text-sm m-0">
            {calls.length} step{calls.length !== 1 ? "s" : ""} · {model}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/${sessionId}/diff`}
            className="px-3 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-sm rounded-md transition-colors"
          >
            View Diff
          </Link>
          <Link
            href={`/dashboard/${sessionId}/replay`}
            className="px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm rounded-md transition-colors"
          >
            Replay
          </Link>
        </div>
      </div>

      {/* ── Metrics Strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">
            Total Steps
          </div>
          <div className="text-white text-2xl font-medium">{calls.length}</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">
            Total Cost
          </div>
          <div className="text-emerald-400 text-2xl font-medium">
            {formatCostUsd(totalCost)}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">
            Total Tokens
          </div>
          <div className="text-white text-2xl font-medium">
            {totalTokens.toLocaleString()}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">
            Avg Latency
          </div>
          <div className="text-white text-2xl font-medium">
            {(avgLatency / 1000).toFixed(2)}s
          </div>
        </div>
      </div>

      {/* ── Calls Table ────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-left text-xs uppercase tracking-wide text-zinc-500 font-medium px-4 py-3">
                Step
              </th>
              <th className="text-left text-xs uppercase tracking-wide text-zinc-500 font-medium px-4 py-3">
                Tokens In
              </th>
              <th className="text-left text-xs uppercase tracking-wide text-zinc-500 font-medium px-4 py-3">
                Tokens Out
              </th>
              <th className="text-left text-xs uppercase tracking-wide text-zinc-500 font-medium px-4 py-3">
                Latency
              </th>
              <th className="text-left text-xs uppercase tracking-wide text-zinc-500 font-medium px-4 py-3">
                Cost
              </th>
              <th className="text-left text-xs uppercase tracking-wide text-zinc-500 font-medium px-4 py-3">
                Type
              </th>
              <th className="text-left text-xs uppercase tracking-wide text-zinc-500 font-medium px-4 py-3">
                Timestamp
              </th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <tr
                key={call.call_id}
                className="border-b border-zinc-800 hover:bg-zinc-800/50 transition-colors"
              >
                <td className="px-4 py-3 text-white font-mono text-sm">
                  {call.step_index}
                </td>
                <td className="px-4 py-3 text-zinc-300 text-sm">
                  {(call.tokens_in ?? 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-zinc-300 text-sm">
                  {(call.tokens_out ?? 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-zinc-300 text-sm">
                  {(call.latency_ms / 1000).toFixed(2)}s
                </td>
                <td className="px-4 py-3 text-emerald-400 text-sm">
                  {formatCostUsd(call.estimated_cost_usd ?? 0)}
                </td>
                <td className="px-4 py-3">
                  {call.is_stream ? (
                    <span className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-md">
                      Stream
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-zinc-800 text-zinc-400 text-xs rounded-md">
                      Standard
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-500 text-xs">
                  {new Date(call.timestamp).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Debug Info (dev only) ──────────────────────────────────────── */}
      {process.env.NODE_ENV === "development" && (
        <details className="mt-6">
          <summary className="text-zinc-500 text-sm cursor-pointer hover:text-zinc-400">
            Debug: Raw Call Data
          </summary>
          <pre className="mt-2 p-4 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-400 overflow-auto">
            {JSON.stringify(calls, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
