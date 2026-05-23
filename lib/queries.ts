// lib/queries.ts
// ============================================================================
// Scoped Data Queries for Dashboard (v2 Optimized)
// ============================================================================
// All queries enforce project-level data isolation via project_id filtering.
// Uses admin client (bypasses RLS) → manual filtering is CRITICAL for security.

import { createClient } from "@supabase/supabase-js";
import { formatCostUsd } from "@/lib/cost";

// ── Supabase Admin Client ─────────────────────────────────────────────────────
// Bypasses RLS → we MUST manually filter by project_id in every query
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Type Definitions ──────────────────────────────────────────────────────────

export interface GlobalKPIs {
  totalCost: string;
  totalTokens: string;
  totalSessions: number;
}

export interface AggregatedSession {
  sessionId: string;
  totalTokens: number;
  totalCost: number;
  steps: number;
}

export interface CostByModel {
  model: string;
  cost: number;
}

export interface AnomalySession {
  sessionId: string;
  model: string;
  latencyMs: number;
  timestamp: string;
  reason: "High Latency" | "Error in Metadata";
}

export interface RecentActivity {
  session_id: string;
  model: string;
  timestamp: string;
  tokens_in: number | null;
  tokens_out: number | null;
  estimated_cost_usd: number | null;
}

// ── 1. Global KPIs ────────────────────────────────────────────────────────────

/**
 * Fetch aggregated KPIs for a project.
 * @param projectId - UUID of the project
 * @returns Total cost, total tokens, and unique session count
 */
export async function getGlobalKPIs(projectId: string): Promise<GlobalKPIs> {
  const { data, error } = await supabaseAdmin
    .from("llm_calls")
    .select("session_id, tokens_in, tokens_out, estimated_cost_usd")
    .eq("project_id", projectId);

  if (error) {
    console.error("[getGlobalKPIs] Query failed:", error.message);
    return { totalCost: "$0.00", totalTokens: "0", totalSessions: 0 };
  }

  if (!data || data.length === 0) {
    return { totalCost: "$0.00", totalTokens: "0", totalSessions: 0 };
  }

  const uniqueSessions = new Set(data.map((row) => row.session_id));

  const totalCost = data.reduce(
    (sum, row) => sum + (row.estimated_cost_usd ?? 0),
    0
  );

  const totalTokens = data.reduce(
    (sum, row) => sum + (row.tokens_in ?? 0) + (row.tokens_out ?? 0),
    0
  );

  return {
    totalCost: formatCostUsd(totalCost),
    totalTokens: totalTokens.toLocaleString(),
    totalSessions: uniqueSessions.size,
  };
}

// ── 2. Top Bloated Sessions ───────────────────────────────────────────────────

/**
 * Get sessions with highest token usage (context bloat analysis).
 * @param projectId - UUID of the project
 * @param limit - Number of top sessions to return (default: 5)
 * @returns Sessions sorted by total tokens descending
 */
export async function getTopBloatedSessions(
  projectId: string,
  limit = 5
): Promise<AggregatedSession[]> {
  const { data, error } = await supabaseAdmin
    .from("llm_calls")
    .select("session_id, step_index, tokens_in, tokens_out, estimated_cost_usd")
    .eq("project_id", projectId)
    .order("session_id")
    .order("step_index", { ascending: true });

  if (error) {
    console.error("[getTopBloatedSessions] Query failed:", error.message);
    return [];
  }

  if (!data || data.length === 0) return [];

  // Aggregate by session_id
  const sessionMap = data.reduce<Record<string, AggregatedSession>>(
    (acc, row) => {
      const sid = row.session_id;

      if (!acc[sid]) {
        acc[sid] = {
          sessionId: sid,
          totalTokens: 0,
          totalCost: 0,
          steps: 0,
        };
      }

      acc[sid].totalTokens += (row.tokens_in ?? 0) + (row.tokens_out ?? 0);
      acc[sid].totalCost += row.estimated_cost_usd ?? 0;
      acc[sid].steps += 1;

      return acc;
    },
    {}
  );

  return Object.values(sessionMap)
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, limit);
}

// ── 3. Session Details ────────────────────────────────────────────────────────

/**
 * Get all LLM calls for a specific session.
 * @param projectId - UUID of the project
 * @param sessionId - Session identifier
 * @returns Array of calls sorted by step_index ascending
 */
export async function getSessionDetails(
  projectId: string,
  sessionId: string
) {
  const { data, error } = await supabaseAdmin
    .from("llm_calls")
    .select("*")
    .eq("project_id", projectId)
    .eq("session_id", sessionId)
    .order("step_index", { ascending: true });

  if (error) {
    console.error("[getSessionDetails] Query failed:", error.message);
    return [];
  }

  return data ?? [];
}

// ── 4. Cost by Model ──────────────────────────────────────────────────────────

/**
 * Aggregate cost breakdown by model.
 * @param projectId - UUID of the project
 * @returns Models sorted by cost descending
 */
export async function getCostByModel(
  projectId: string
): Promise<CostByModel[]> {
  const { data, error } = await supabaseAdmin
    .from("llm_calls")
    .select("model, estimated_cost_usd")
    .eq("project_id", projectId);

  if (error) {
    console.error("[getCostByModel] Query failed:", error.message);
    return [];
  }

  if (!data || data.length === 0) return [];

  // Aggregate by model
  const costMap = data.reduce<Record<string, number>>((acc, row) => {
    const model = row.model || "unknown";
    acc[model] = (acc[model] ?? 0) + (row.estimated_cost_usd ?? 0);
    return acc;
  }, {});

  return Object.entries(costMap)
    .map(([model, cost]) => ({ model, cost }))
    .sort((a, b) => b.cost - a.cost);
}

// ── 5. Anomaly Detection ──────────────────────────────────────────────────────

/**
 * Detect anomalous sessions based on latency and error metadata.
 * @param projectId - UUID of the project
 * @returns Sessions flagged as anomalous with reason
 */
export async function getAnomalySessions(
  projectId: string
): Promise<AnomalySession[]> {
  const { data, error } = await supabaseAdmin
    .from("llm_calls")
    .select("session_id, model, latency_ms, timestamp, metadata")
    .eq("project_id", projectId)
    .order("timestamp", { ascending: false });

  if (error) {
    console.error("[getAnomalySessions] Query failed:", error.message);
    return [];
  }

  if (!data || data.length === 0) return [];

  const HIGH_LATENCY_THRESHOLD = 10000; // 10 seconds

  return data
    .filter((row) => {
      const isHighLatency = row.latency_ms > HIGH_LATENCY_THRESHOLD;
      const hasError =
        row.metadata && JSON.stringify(row.metadata).includes("error");
      return isHighLatency || hasError;
    })
    .map((row) => ({
      sessionId: row.session_id,
      model: row.model,
      latencyMs: row.latency_ms,
      timestamp: row.timestamp,
      reason:
        row.latency_ms > HIGH_LATENCY_THRESHOLD
          ? "High Latency"
          : "Error in Metadata",
    }));
}

// ── 6. Recent Activity ────────────────────────────────────────────────────────

/**
 * Get most recent LLM calls for a project.
 * @param projectId - UUID of the project
 * @param limit - Number of calls to return (default: 10)
 * @returns Recent calls sorted by timestamp descending
 */
export async function getRecentActivity(
  projectId: string,
  limit = 10
): Promise<RecentActivity[]> {
  const { data, error } = await supabaseAdmin
    .from("llm_calls")
    .select(
      "session_id, model, timestamp, tokens_in, tokens_out, estimated_cost_usd"
    )
    .eq("project_id", projectId)
    .order("timestamp", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[getRecentActivity] Query failed:", error.message);
    return [];
  }

  return data ?? [];
}