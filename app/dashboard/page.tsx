// app/dashboard/page.tsx

import type { Metadata } from "next";
import type { SearchParams } from "@/types/next";
import { supabaseAdmin } from "@/lib/supabase";
import { SessionsTable } from "@/components/dashboard/SessionsTable";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatCostUsd } from "@/lib/cost";
import { getActiveProjectId } from "@/lib/project-context";

// ── Metadata ──────────────────────────────────────────────────────────────────

export const metadata: Metadata = { title: "Sessions" };

// ── Types ─────────────────────────────────────────────────────────────────────

interface LlmCallRaw {
  session_id: string;
  model: string;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number;
  estimated_cost_usd: number | null;
  metadata: Record<string, unknown> | null;
  // Sprint 3: tags column added by migration_sprint3_session_tagging.sql
  tags: Record<string, string> | null;
  timestamp: string;
}

export interface SessionRow {
  session_id: string;
  model: string;
  step_count: number;
  total_tokens: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  has_anomaly: boolean;
  last_call_at: string;
  // Sprint 3: union of all call tags within the session (later calls win on key conflict)
  tags: Record<string, string>;
}

interface DashboardMetrics {
  total_calls: number;
  total_cost_usd: number;
  avg_latency_ms: number;
  anomaly_count: number;
}

interface PageProps {
  searchParams: SearchParams;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getSessions(
  projectId: string,
  filters: { model?: string; status?: string; q?: string; tag?: string },
): Promise<SessionRow[]> {
  let query = supabaseAdmin
    .from("llm_calls")
    .select(
      "session_id, model, tokens_in, tokens_out, latency_ms, estimated_cost_usd, metadata, tags, timestamp",
    )
    .eq("project_id", projectId)
    .order("timestamp", { ascending: false });

  if (filters.model) query = query.eq("model", filters.model);
  if (filters.q) query = query.ilike("session_id", `${filters.q}%`);

  // Sprint 3: server-side tag pre-filter — only rows where the tags jsonb
  // column contains at least one key whose value matches the tag query string.
  // Client-side secondary filter below handles partial matches across key names.
  // Using .not("tags", "is", null) when a tag filter is present avoids scanning
  // tagless rows; the GIN index on tags makes this fast.
  if (filters.tag) {
    query = query.not("tags", "is", null);
  }

  const { data, error } = (await query.limit(500)) as {
    data: LlmCallRaw[] | null;
    error: Error | null;
  };

  if (error || !data || data.length === 0) return [];

  const sessionMap = new Map<string, SessionRow>();

  for (const row of data) {
    const existing = sessionMap.get(row.session_id);
    const tokens = (row.tokens_in ?? 0) + (row.tokens_out ?? 0);
    const isAnomaly =
      row.metadata?.anomaly === true || row.metadata?.anomaly === "true";

    if (!existing) {
      sessionMap.set(row.session_id, {
        session_id: row.session_id,
        model: row.model,
        step_count: 1,
        total_tokens: tokens,
        total_cost_usd: row.estimated_cost_usd ?? 0,
        avg_latency_ms: row.latency_ms,
        has_anomaly: isAnomaly,
        last_call_at: row.timestamp,
        // Sprint 3: seed tags from this call (non-null guard — empty object if null)
        tags: row.tags ?? {},
      });
    } else {
      existing.step_count += 1;
      existing.total_tokens += tokens;
      existing.total_cost_usd += row.estimated_cost_usd ?? 0;
      existing.avg_latency_ms =
        (existing.avg_latency_ms * (existing.step_count - 1) + row.latency_ms) /
        existing.step_count;
      existing.has_anomaly = existing.has_anomaly || isAnomaly;
      // Sprint 3: merge — later calls overwrite on key conflict (last-writer-wins)
      if (row.tags) existing.tags = { ...existing.tags, ...row.tags };
      if (row.timestamp > existing.last_call_at)
        existing.last_call_at = row.timestamp;
    }
  }

  let sessions = Array.from(sessionMap.values());

  if (filters.status === "anomaly")
    sessions = sessions.filter((s) => s.has_anomaly);
  if (filters.status === "complete")
    sessions = sessions.filter((s) => !s.has_anomaly);

  // Sprint 3: client-side tag filter — matches key OR value substring
  if (filters.tag) {
    const tq = filters.tag.trim().toLowerCase();
    sessions = sessions.filter((s) =>
      Object.entries(s.tags).some(
        ([k, v]) =>
          k.toLowerCase().includes(tq) || v.toLowerCase().includes(tq),
      ),
    );
  }

  sessions.sort((a, b) => (a.last_call_at < b.last_call_at ? 1 : -1));
  return sessions;
}

async function getMetrics(projectId: string): Promise<DashboardMetrics> {
  const { data, error } = (await supabaseAdmin
    .from("llm_calls")
    .select("tokens_in, tokens_out, latency_ms, estimated_cost_usd, metadata")
    .eq("project_id", projectId)) as {
    data: LlmCallRaw[] | null;
    error: Error | null;
  };

  if (error || !data)
    return {
      total_calls: 0,
      total_cost_usd: 0,
      avg_latency_ms: 0,
      anomaly_count: 0,
    };

  const total_calls = data.length;
  const total_cost_usd = data.reduce(
    (s, r) => s + (r.estimated_cost_usd ?? 0),
    0,
  );
  const avg_latency_ms =
    total_calls > 0
      ? data.reduce((s, r) => s + r.latency_ms, 0) / total_calls
      : 0;
  const anomaly_count = data.filter(
    (r) => r.metadata?.anomaly === true || r.metadata?.anomaly === "true",
  ).length;

  return { total_calls, total_cost_usd, avg_latency_ms, anomaly_count };
}

async function getDistinctModels(projectId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("llm_calls")
    .select("model")
    .eq("project_id", projectId);

  if (error || !data) return [];
  return [...new Set(data.map((r) => r.model as string))].sort();
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SessionsPage({ searchParams }: PageProps) {
  const projectId = await getActiveProjectId();

  const params = await searchParams;
  const model = typeof params.model === "string" ? params.model : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const q = typeof params.q === "string" ? params.q : undefined;
  // Sprint 3: tag filter param — e.g. ?tag=env:production or just ?tag=env
  const tag = typeof params.tag === "string" ? params.tag : undefined;

  const [sessions, metrics, models] = await Promise.all([
    getSessions(projectId, { model, status, q, tag }),
    getMetrics(projectId),
    getDistinctModels(projectId),
  ]);

  // ── Empty state — only when no filters applied and no data ────────────────
  if (sessions.length === 0 && !model && !status && !q && !tag) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="m-0 text-white text-2xl font-medium leading-tight tracking-[-0.02em]">
            Sessions
          </h1>
          <p className="mt-1.5 text-[#71717a] text-sm m-0">
            Waiting for first trace
          </p>
        </div>
        <EmptyState context="sessions" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-6 mb-6">
        <div>
          <h1 className="m-0 text-white text-2xl font-medium leading-tight tracking-[-0.02em]">
            Sessions
          </h1>
          <p className="mt-1.5 text-[#71717a] text-sm m-0">
            {sessions.length} agent run{sessions.length !== 1 ? "s" : ""} · last
            7 days
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Total Calls"
          value={metrics.total_calls.toLocaleString()}
          valueColor="white"
        />
        <MetricCard
          label="Total Cost"
          value={formatCostUsd(metrics.total_cost_usd)}
          valueColor="emerald"
        />
        <MetricCard
          label="Avg Latency"
          value={`${(metrics.avg_latency_ms / 1000).toFixed(2)}s`}
          valueColor="white"
        />
        <MetricCard
          label="Anomalies"
          value={metrics.anomaly_count.toString()}
          valueColor={metrics.anomaly_count > 0 ? "amber" : "white"}
        />
      </div>

      <SessionsTable
        sessions={sessions}
        models={models}
        initialModel={model}
        initialStatus={status}
        initialQuery={q}
        initialTag={tag}
      />
    </div>
  );
}
