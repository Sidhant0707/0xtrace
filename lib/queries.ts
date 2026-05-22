import { createClient } from "@supabase/supabase-js";
import { formatCostUsd } from "@/lib/cost";

// Standard Supabase client (Server-side read-only)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── 1. The Command Center: Global KPIs ───────────────────────────────────────
export async function getGlobalKPIs() {
  const { data, error } = await supabase
    .from("llm_calls")
    .select("session_id, tokens_in, tokens_out, estimated_cost_usd");

  if (error || !data) {
    console.error("Failed to fetch KPIs:", error);
    return { totalCost: "$0.00", totalTokens: "0", totalSessions: 0 };
  }

  const uniqueSessions = new Set(data.map((row) => row.session_id));
  
  const totalCost = data.reduce((sum, row) => sum + (row.estimated_cost_usd || 0), 0);
  const totalTokens = data.reduce((sum, row) => sum + (row.tokens_in || 0) + (row.tokens_out || 0), 0);

  return {
    totalCost: formatCostUsd(totalCost),
    totalTokens: totalTokens.toLocaleString(),
    totalSessions: uniqueSessions.size,
  };
}

// ── 2. The Command Center: Context Bleed Leaderboard ─────────────────────────

// Strictly typing the accumulator to block `any`
export interface AggregatedSession {
  sessionId: string;
  totalTokens: number;
  totalCost: number;
  steps: number;
}

export async function getTopBloatedSessions(limit = 5): Promise<AggregatedSession[]> {
  const { data, error } = await supabase
    .from("llm_calls")
    .select("session_id, step_index, tokens_in, tokens_out, estimated_cost_usd")
    .order("session_id")
    .order("step_index", { ascending: true });

  if (error || !data) return [];

  // Enforcing the Record type so `acc` is no longer `any`
  const aggregated = data.reduce<Record<string, AggregatedSession>>((acc, row) => {
    if (!acc[row.session_id]) {
      acc[row.session_id] = { 
        sessionId: row.session_id, 
        totalTokens: 0, 
        totalCost: 0, 
        steps: 0 
      };
    }
    acc[row.session_id].totalTokens += (row.tokens_in || 0) + (row.tokens_out || 0);
    acc[row.session_id].totalCost += row.estimated_cost_usd || 0;
    acc[row.session_id].steps += 1;
    
    return acc;
  }, {});

  // TypeScript now natively knows `a` and `b` are `AggregatedSession` objects
  return Object.values(aggregated)
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, limit);
}

// ── 3. The Session Explorer: Waterfall Timeline ──────────────────────────────
export async function getSessionTimeline(sessionId: string) {
  const { data, error } = await supabase
    .from("llm_calls")
    .select("step_index, model, latency_ms, tokens_in, tokens_out, estimated_cost_usd, timestamp")
    .eq("session_id", sessionId)
    .order("step_index", { ascending: true });

  if (error) {
    console.error(`Failed to fetch timeline for ${sessionId}:`, error);
    return [];
  }

  return data;
}

// ── 4. The Replay Engine: Context Visualizer ─────────────────────────────────
export async function getPromptSnapshot(sessionId: string, stepIndex: number) {
  const { data, error } = await supabase
    .from("prompt_snapshots")
    .select("full_snapshot, diff_from_previous")
    .eq("session_id", sessionId)
    .eq("step_index", stepIndex)
    .single();

  if (error) {
    console.error(`Failed to fetch snapshot for ${sessionId} step ${stepIndex}:`, error);
    return null;
  }

  return data;
}