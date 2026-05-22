import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { formatCostUsd } from "@/lib/cost";
import Link from "next/link";
import { SessionExplorer } from "@/components/dashboard/SessionExplorer";
import type { ChatMessage } from "@/packages/sdk/src/core/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StepDetails {
  step_index: number;
  model: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  estimated_cost_usd: number;
  timestamp: string;
  has_anomaly: boolean;
}

// Strict typing for the diff data structure.
// This assumes your diff utility generates a path, operation type, and values.
export interface JsonDiffDelta {
  path: (string | number)[];
  type: "added" | "removed" | "modified";
  oldValue?: unknown;
  newValue?: unknown;
}

export interface PromptSnapshot {
  step_index: number;
  full_snapshot: ChatMessage[] | null;
  diff_from_previous: JsonDiffDelta[] | null;
}

// ── Data Fetching ─────────────────────────────────────────────────────────────

async function getSessionData(sessionId: string) {
  // Decode the URL parameter just in case
  const decodedId = decodeURIComponent(sessionId);

  // Fetch the timeline metrics
  const { data: timelineData, error: timelineError } = await supabaseAdmin
    .from("llm_calls")
    .select(
      "step_index, model, latency_ms, tokens_in, tokens_out, estimated_cost_usd, timestamp, metadata",
    )
    .eq("session_id", decodedId)
    .order("step_index", { ascending: true });

  if (timelineError || !timelineData || timelineData.length === 0) {
    return null;
  }

  // Fetch the diffs
  const { data: snapshotData, error: snapshotError } = await supabaseAdmin
    .from("prompt_snapshots")
    .select("step_index, full_snapshot, diff_from_previous")
    .eq("session_id", decodedId)
    .order("step_index", { ascending: true });

  if (snapshotError) {
    console.error("Failed to fetch snapshots:", snapshotError);
    // Proceeding without snapshots is fine; the UI will handle it gracefully.
  }

  // Process timeline data to match interfaces
  const timeline: StepDetails[] = timelineData.map((row) => ({
    step_index: row.step_index,
    model: row.model,
    latency_ms: row.latency_ms,
    tokens_in: row.tokens_in || 0,
    tokens_out: row.tokens_out || 0,
    estimated_cost_usd: row.estimated_cost_usd || 0,
    timestamp: row.timestamp,
    has_anomaly:
      row.metadata?.anomaly === true || row.metadata?.anomaly === "true",
  }));

  // Map the snapshot data and enforce the strict types
  const snapshots: PromptSnapshot[] = (snapshotData || []).map((row) => ({
    step_index: row.step_index,
    full_snapshot: row.full_snapshot as ChatMessage[] | null,
    diff_from_previous: row.diff_from_previous as JsonDiffDelta[] | null,
  }));

  // Aggregate totals
  const totalTokens = timeline.reduce(
    (sum, row) => sum + row.tokens_in + row.tokens_out,
    0,
  );
  const totalCost = timeline.reduce(
    (sum, row) => sum + row.estimated_cost_usd,
    0,
  );
  const totalLatency = timeline.reduce((sum, row) => sum + row.latency_ms, 0);

  return {
    sessionId: decodedId,
    model: timeline[0]?.model || "Unknown",
    totalTokens,
    totalCost,
    totalLatency,
    stepCount: timeline.length,
    timeline,
    snapshots,
  };
}

// ── Page Component ────────────────────────────────────────────────────────────

export default async function SessionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const sessionData = await getSessionData(id);

  if (!sessionData) {
    notFound();
  }

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* ── Header ── */}
      <div>
        <nav className="flex items-center text-sm font-medium text-zinc-500 mb-2">
          <Link
            href="/dashboard"
            className="hover:text-zinc-300 transition-colors"
          >
            Dashboard
          </Link>
          <span className="mx-2">/</span>
          <span className="text-zinc-300 font-mono">
            {sessionData.sessionId}
          </span>
        </nav>
        <div className="flex items-end justify-between">
          <h1 className="text-2xl font-semibold text-white tracking-tight font-mono">
            {sessionData.sessionId}
          </h1>
        </div>
      </div>

      {/* ── Summary Strip ── */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[#111] border border-[#1f1f1f] rounded-lg p-4 flex flex-col justify-between">
          <span className="text-[#71717a] text-[11px] uppercase tracking-wider font-medium">
            Model
          </span>
          <span className="text-zinc-200 font-medium mt-1">
            {sessionData.model}
          </span>
        </div>
        <div className="bg-[#111] border border-[#1f1f1f] rounded-lg p-4 flex flex-col justify-between">
          <span className="text-[#71717a] text-[11px] uppercase tracking-wider font-medium">
            Steps
          </span>
          <span className="text-zinc-200 font-medium mt-1">
            {sessionData.stepCount}
          </span>
        </div>
        <div className="bg-[#111] border border-[#1f1f1f] rounded-lg p-4 flex flex-col justify-between">
          <span className="text-[#71717a] text-[11px] uppercase tracking-wider font-medium">
            Total Tokens
          </span>
          <span className="text-zinc-200 font-medium mt-1">
            {sessionData.totalTokens.toLocaleString()}
          </span>
        </div>
        <div className="bg-[#111] border border-[#1f1f1f] rounded-lg p-4 flex flex-col justify-between">
          <span className="text-[#71717a] text-[11px] uppercase tracking-wider font-medium">
            Total Cost
          </span>
          <span className="text-emerald-400 font-medium mt-1">
            {formatCostUsd(sessionData.totalCost)}
          </span>
        </div>
      </div>

      {/* ── Interactive Explorer (Client Component) ── */}
      <div className="flex-1 min-h-0 bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden flex">
        <SessionExplorer
          timeline={sessionData.timeline}
          snapshots={sessionData.snapshots}
        />
      </div>
    </div>
  );
}
