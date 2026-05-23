// app/dashboard/cost/page.tsx
//
// Cost Analytics — full cost visibility across all sessions.
//
// Data architecture:
//   One query pulls all llm_calls from the last 30 days.
//   Every chart and table is derived from that single dataset in JS.
//   No N+1 queries, no GROUP BY RPC needed at this scale.
//
// Charts:
//   All pure CSS — bar heights are inline styles, no chart library.
//   This keeps the server component boundary clean (zero client JS
//   for the charts themselves).
//
// Sections:
//   1. Metric strip       — total cost, tokens, sessions, avg cost/session
//   2. Daily spend chart  — last 14 days, bar per day
//   3. Model breakdown    — cost + tokens + calls + avg latency per model
//   4. Top sessions       — 10 most expensive sessions, linked
//   5. Latency dist.      — bucketed histogram of call latencies

import type { Metadata } from "next";
import Link from "next/link";
import { getActiveProjectId } from "@/lib/project-context";
import { supabaseAdmin } from "@/lib/supabase";

// ── Metadata ──────────────────────────────────────────────────────────────────

export const metadata: Metadata = { title: "Cost Analysis" };

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS_WINDOW = 30; // how far back to query
const CHART_DAYS = 14; // how many days the trend chart shows
const TOP_N_SESSIONS = 10;

// Latency buckets in ms — [label, min, max]
const LATENCY_BUCKETS: [string, number, number][] = [
  ["<500ms", 0, 500],
  ["0.5–1s", 500, 1000],
  ["1–2s", 1000, 2000],
  ["2–5s", 2000, 5000],
  [">5s", 5000, Infinity],
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface LlmCallRaw {
  session_id: string;
  model: string;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number;
  estimated_cost_usd: number | null;
  timestamp: string;
}

interface DailySpend {
  date: string; // "YYYY-MM-DD"
  cost_usd: number;
  call_count: number;
}

interface ModelStat {
  model: string;
  call_count: number;
  total_cost_usd: number;
  total_tokens: number;
  avg_latency_ms: number;
  pct_of_total: number; // 0–100
}

interface SessionCost {
  session_id: string;
  total_cost_usd: number;
  call_count: number;
  total_tokens: number;
  last_call_at: string;
}

interface LatencyBucket {
  label: string;
  count: number;
  pct: number; // 0–100 of max bucket
}

interface CostAnalytics {
  // Metric strip
  total_cost_usd: number;
  total_tokens: number;
  total_sessions: number;
  avg_cost_per_session: number;
  // Charts / tables
  daily_spend: DailySpend[]; // 14 entries, oldest → newest
  model_stats: ModelStat[]; // sorted by cost desc
  top_sessions: SessionCost[]; // top 10 by cost
  latency_buckets: LatencyBucket[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.0001) return `$${usd.toFixed(8).replace(/0+$/, "")}`;
  if (usd < 0.01) return `$${usd.toFixed(6).replace(/0+$/, "")}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function truncateId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 12)}…` : id;
}

/** Returns an array of YYYY-MM-DD strings for the last N days, newest last. */
function lastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/** Short display label for a date string: "May 21" */
function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getCostAnalytics(projectId: string): Promise<CostAnalytics> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - DAYS_WINDOW);

  const { data, error } = (await supabaseAdmin
    .from("llm_calls")
    .select(
      "session_id, model, tokens_in, tokens_out, latency_ms, estimated_cost_usd, timestamp",
    )
    .eq("project_id", projectId)
    .gte("timestamp", since.toISOString())
    .order("timestamp", { ascending: false })
    .limit(10_000)) as { data: LlmCallRaw[] | null; error: Error | null };

  if (error || !data || data.length === 0) {
    const emptyDays = lastNDays(CHART_DAYS).map((date) => ({
      date,
      cost_usd: 0,
      call_count: 0,
    }));
    return {
      total_cost_usd: 0,
      total_tokens: 0,
      total_sessions: 0,
      avg_cost_per_session: 0,
      daily_spend: emptyDays,
      model_stats: [],
      top_sessions: [],
      latency_buckets: LATENCY_BUCKETS.map(([label]) => ({
        label,
        count: 0,
        pct: 0,
      })),
    };
  }

  // ── Aggregate: daily spend ─────────────────────────────────────────────────
  const dailyMap = new Map<string, { cost_usd: number; call_count: number }>();
  for (const row of data) {
    const day = row.timestamp.slice(0, 10);
    const existing = dailyMap.get(day);
    if (!existing) {
      dailyMap.set(day, {
        cost_usd: row.estimated_cost_usd ?? 0,
        call_count: 1,
      });
    } else {
      existing.cost_usd += row.estimated_cost_usd ?? 0;
      existing.call_count += 1;
    }
  }

  // Fill every day in the chart window even if no calls that day.
  const daily_spend: DailySpend[] = lastNDays(CHART_DAYS).map((date) => {
    const entry = dailyMap.get(date);
    return {
      date,
      cost_usd: entry?.cost_usd ?? 0,
      call_count: entry?.call_count ?? 0,
    };
  });

  // ── Aggregate: model stats ─────────────────────────────────────────────────
  const modelMap = new Map<
    string,
    { cost: number; tokens: number; calls: number; latencySum: number }
  >();

  for (const row of data) {
    const tokens = (row.tokens_in ?? 0) + (row.tokens_out ?? 0);
    const existing = modelMap.get(row.model);
    if (!existing) {
      modelMap.set(row.model, {
        cost: row.estimated_cost_usd ?? 0,
        tokens,
        calls: 1,
        latencySum: row.latency_ms,
      });
    } else {
      existing.cost += row.estimated_cost_usd ?? 0;
      existing.tokens += tokens;
      existing.calls += 1;
      existing.latencySum += row.latency_ms;
    }
  }

  const totalCostAllModels = Array.from(modelMap.values()).reduce(
    (s, m) => s + m.cost,
    0,
  );

  const model_stats: ModelStat[] = Array.from(modelMap.entries())
    .map(([model, m]) => ({
      model,
      call_count: m.calls,
      total_cost_usd: m.cost,
      total_tokens: m.tokens,
      avg_latency_ms: m.latencySum / m.calls,
      pct_of_total:
        totalCostAllModels > 0 ? (m.cost / totalCostAllModels) * 100 : 0,
    }))
    .sort((a, b) => b.total_cost_usd - a.total_cost_usd);

  // ── Aggregate: sessions ────────────────────────────────────────────────────
  const sessionMap = new Map<
    string,
    { cost: number; calls: number; tokens: number; lastAt: string }
  >();

  for (const row of data) {
    const tokens = (row.tokens_in ?? 0) + (row.tokens_out ?? 0);
    const existing = sessionMap.get(row.session_id);
    if (!existing) {
      sessionMap.set(row.session_id, {
        cost: row.estimated_cost_usd ?? 0,
        calls: 1,
        tokens,
        lastAt: row.timestamp,
      });
    } else {
      existing.cost += row.estimated_cost_usd ?? 0;
      existing.calls += 1;
      existing.tokens += tokens;
      if (row.timestamp > existing.lastAt) existing.lastAt = row.timestamp;
    }
  }

  const allSessions = Array.from(sessionMap.entries())
    .map(([session_id, s]) => ({
      session_id,
      total_cost_usd: s.cost,
      call_count: s.calls,
      total_tokens: s.tokens,
      last_call_at: s.lastAt,
    }))
    .sort((a, b) => b.total_cost_usd - a.total_cost_usd);

  const top_sessions = allSessions.slice(0, TOP_N_SESSIONS);

  // ── Aggregate: latency distribution ───────────────────────────────────────
  const bucketCounts = new Array<number>(LATENCY_BUCKETS.length).fill(0);
  for (const row of data) {
    const idx = LATENCY_BUCKETS.findIndex(
      ([, min, max]) => row.latency_ms >= min && row.latency_ms < max,
    );
    if (idx !== -1) bucketCounts[idx]++;
  }
  const maxBucketCount = Math.max(...bucketCounts, 1);
  const latency_buckets: LatencyBucket[] = LATENCY_BUCKETS.map(
    ([label], i) => ({
      label,
      count: bucketCounts[i],
      pct: (bucketCounts[i] / maxBucketCount) * 100,
    }),
  );

  // ── Metric strip totals ────────────────────────────────────────────────────
  const total_cost_usd = totalCostAllModels;
  const total_tokens = data.reduce(
    (s, r) => s + (r.tokens_in ?? 0) + (r.tokens_out ?? 0),
    0,
  );
  const total_sessions = sessionMap.size;
  const avg_cost_per_session =
    total_sessions > 0 ? total_cost_usd / total_sessions : 0;

  return {
    total_cost_usd,
    total_tokens,
    total_sessions,
    avg_cost_per_session,
    daily_spend,
    model_stats,
    top_sessions,
    latency_buckets,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

// MetricStrip — four summary cards at the top of the page.
interface MetricStripProps {
  data: CostAnalytics;
}

function MetricStrip({ data }: MetricStripProps) {
  const cards = [
    {
      label: "Total Cost",
      value: formatCost(data.total_cost_usd),
      color: "text-[#10b981]",
    },
    {
      label: "Total Tokens",
      value: formatTokens(data.total_tokens),
      color: "text-white",
    },
    {
      label: "Sessions",
      value: data.total_sessions.toLocaleString(),
      color: "text-white",
    },
    {
      label: "Avg Cost / Session",
      value: formatCost(data.avg_cost_per_session),
      color: "text-[#3b82f6]",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      {cards.map(({ label, value, color }) => (
        <div
          key={label}
          className="bg-[#111] border border-[#1f1f1f] rounded-lg p-5"
        >
          <div className="text-[#71717a] text-[12px] uppercase tracking-[0.05em]">
            {label}
          </div>
          <div
            className={[
              "mt-2.5 text-[36px] leading-none font-semibold tracking-[-0.03em]",
              color,
            ].join(" ")}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

// DailySpendChart — 14-day bar chart. Pure CSS, no JS.
function DailySpendChart({ days }: { days: DailySpend[] }) {
  const maxCost = Math.max(...days.map((d) => d.cost_usd), 0.0001);

  // Y-axis labels: 0, 25%, 50%, 75%, 100% of max, rounded.
  const yMax = maxCost;
  function yLabel(val: number): string {
    if (val === 0) return "$0";
    if (val < 0.01) return `$${val.toFixed(4)}`;
    if (val < 1) return `$${val.toFixed(3)}`;
    return `$${val.toFixed(2)}`;
  }

  return (
    <div className="bg-[#111] border border-[#1f1f1f] rounded-lg p-6 mb-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="m-0 text-white text-sm font-medium">
            Daily Spend — Last 14 Days
          </h2>
          <p className="mt-1 mb-0 text-[#71717a] text-[12px]">
            Estimated cost per calendar day
          </p>
        </div>
        <div className="text-right">
          <div className="text-[#10b981] text-sm font-medium">
            {formatCost(days.reduce((s, d) => s + d.cost_usd, 0))}
          </div>
          <div className="text-[#52525b] text-[11px] mt-0.5">14-day total</div>
        </div>
      </div>

      <div className="grid grid-cols-[44px_1fr] gap-3">
        {/* Y-axis */}
        <div className="relative h-[200px]">
          {[1, 0.75, 0.5, 0.25, 0].map((frac, i) => (
            <span
              key={i}
              className={`absolute right-0 text-[#71717a] text-[10px] leading-none ${
                frac === 0
                  ? "bottom-0"
                  : frac === 0.25
                    ? "top-[75%] translate-y-1/2"
                    : frac === 0.5
                      ? "top-[50%] translate-y-1/2"
                      : frac === 0.75
                        ? "top-[25%] translate-y-1/2"
                        : "top-0 translate-y-1/2"
              }`}
            >
              {yLabel(yMax * frac)}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div className="relative border-l border-b border-[#1f1f1f] h-[200px] px-[6px]">
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map((frac) => (
            <div
              key={frac}
              className="absolute left-0 right-0 border-t border-[#1a1a1a]"
              style={{ bottom: `${frac * 100}%` }}
            />
          ))}

          <div
            className="h-full grid gap-1 items-end"
            style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}
          >
            {days.map((day) => {
              const heightPct =
                maxCost > 0 ? (day.cost_usd / maxCost) * 100 : 0;
              const isEmpty = day.cost_usd === 0;

              return (
                <div
                  key={day.date}
                  className="h-full flex flex-col items-center justify-end gap-1.5"
                  title={`${shortDate(day.date)}: ${formatCost(day.cost_usd)} (${day.call_count} calls)`}
                >
                  <div
                    className={`w-full min-h-[2px] rounded-t-[3px] ${
                      isEmpty ? "bg-[#1f1f1f]" : "bg-[#3b82f6]"
                    }`}
                    style={{
                      height: isEmpty ? "2px" : `${heightPct}%`,
                    }}
                  />
                  {/* Only show every other label to avoid crowding */}
                  {days.indexOf(day) % 2 === 0 ? (
                    <span className="text-[#52525b] text-[9px] whitespace-nowrap">
                      {shortDate(day.date)}
                    </span>
                  ) : (
                    <span className="text-[9px]">&nbsp;</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ModelBreakdown — cost, tokens, calls, avg latency per model.
function ModelBreakdown({ models }: { models: ModelStat[] }) {
  if (models.length === 0) {
    return (
      <div className="bg-[#111] border border-[#1f1f1f] rounded-lg p-6 mb-6">
        <h2 className="m-0 text-white text-sm font-medium mb-4">
          Model Breakdown
        </h2>
        <p className="text-[#52525b] text-sm">No data yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden mb-6">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#1f1f1f]">
        <h2 className="m-0 text-white text-sm font-medium">Model Breakdown</h2>
        <p className="mt-1 mb-0 text-[#71717a] text-[12px]">
          Cost and usage distribution per model
        </p>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            {[
              "Model",
              "Calls",
              "Total Cost",
              "% of Spend",
              "Total Tokens",
              "Avg Latency",
            ].map((h) => (
              <th
                key={h}
                className="h-10 text-left border-b border-[#1f1f1f] px-6 text-[#71717a] text-[11px] uppercase tracking-[0.05em] font-medium whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((m, idx) => {
            const isLast = idx === models.length - 1;
            const rowBorder = isLast ? "" : "border-b border-[#1f1f1f]";

            return (
              <tr
                key={m.model}
                className="transition-colors duration-[120ms] hover:bg-[#161616]"
              >
                {/* Model name */}
                <td className={`h-14 px-6 ${rowBorder}`}>
                  <span className="font-mono text-[13px] text-[#e4e4e7]">
                    {m.model}
                  </span>
                </td>

                {/* Call count */}
                <td className={`h-14 px-6 ${rowBorder} text-[#a1a1aa] text-sm`}>
                  {m.call_count.toLocaleString()}
                </td>

                {/* Cost */}
                <td className={`h-14 px-6 ${rowBorder} text-[#10b981] text-sm`}>
                  {formatCost(m.total_cost_usd)}
                </td>

                {/* % of spend — bar + number */}
                <td className={`h-14 px-6 ${rowBorder}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#3b82f6] rounded-full"
                        style={{ width: `${m.pct_of_total.toFixed(1)}%` }}
                      />
                    </div>
                    <span className="text-[#a1a1aa] text-sm">
                      {m.pct_of_total.toFixed(1)}%
                    </span>
                  </div>
                </td>

                {/* Tokens */}
                <td className={`h-14 px-6 ${rowBorder} text-[#a1a1aa] text-sm`}>
                  {formatTokens(m.total_tokens)}
                </td>

                {/* Avg latency */}
                <td className={`h-14 px-6 ${rowBorder} text-[#a1a1aa] text-sm`}>
                  {(m.avg_latency_ms / 1000).toFixed(2)}s
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// TopSessions — ranked list of most expensive sessions.
function TopSessions({ sessions }: { sessions: SessionCost[] }) {
  if (sessions.length === 0) {
    return (
      <div className="bg-[#111] border border-[#1f1f1f] rounded-lg p-6">
        <h2 className="m-0 text-white text-sm font-medium mb-4">
          Top Sessions by Cost
        </h2>
        <p className="text-[#52525b] text-sm">No sessions yet.</p>
      </div>
    );
  }

  const maxCost = sessions[0].total_cost_usd;

  return (
    <div className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden">
      <div className="px-6 py-4 border-b border-[#1f1f1f]">
        <h2 className="m-0 text-white text-sm font-medium">
          Top Sessions by Cost
        </h2>
        <p className="mt-1 mb-0 text-[#71717a] text-[12px]">
          Most expensive agent runs in the last {DAYS_WINDOW} days
        </p>
      </div>

      <div className="divide-y divide-[#1f1f1f]">
        {sessions.map((s, idx) => {
          const barWidth = maxCost > 0 ? (s.total_cost_usd / maxCost) * 100 : 0;

          return (
            <div
              key={s.session_id}
              className="flex items-center gap-4 px-6 py-4 hover:bg-[#161616] transition-colors duration-[120ms]"
            >
              {/* Rank */}
              <span className="text-[#333] text-[13px] font-mono w-6 flex-shrink-0">
                {String(idx + 1).padStart(2, "0")}
              </span>

              {/* Session ID + bar */}
              <div className="flex-1 min-w-0">
                <Link
                  href={`/dashboard/${encodeURIComponent(s.session_id)}`}
                  className="font-mono text-[13px] text-[#e4e4e7] hover:text-white no-underline transition-colors duration-[120ms] block truncate"
                  title={s.session_id}
                >
                  {truncateId(s.session_id)}
                </Link>
                {/* Cost bar */}
                <div className="mt-2 h-1 bg-[#1a1a1a] rounded-full overflow-hidden w-full">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: idx === 0 ? "#f59e0b" : "#3b82f6",
                    }}
                  />
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-6 flex-shrink-0">
                <div className="text-right">
                  <div className="text-[#10b981] text-sm">
                    {formatCost(s.total_cost_usd)}
                  </div>
                  <div className="text-[#52525b] text-[11px] mt-0.5">
                    {s.call_count} calls
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[#a1a1aa] text-sm">
                    {formatTokens(s.total_tokens)}
                  </div>
                  <div className="text-[#52525b] text-[11px] mt-0.5">
                    tokens
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// LatencyDistribution — horizontal bar histogram.
function LatencyDistribution({ buckets }: { buckets: LatencyBucket[] }) {
  const total = buckets.reduce((s, b) => s + b.count, 0);

  return (
    <div className="bg-[#111] border border-[#1f1f1f] rounded-lg p-6">
      <h2 className="m-0 text-white text-sm font-medium mb-1">
        Latency Distribution
      </h2>
      <p className="mt-1 mb-6 text-[#71717a] text-[12px]">
        Call count per latency range across all LLM calls
      </p>

      <div className="flex flex-col gap-3">
        {buckets.map((bucket) => {
          // Color: fast = emerald, mid = blue, slow = amber, very slow = rose
          const color =
            bucket.label === "<500ms"
              ? "#10b981"
              : bucket.label === "0.5–1s"
                ? "#3b82f6"
                : bucket.label === "1–2s"
                  ? "#3b82f6"
                  : bucket.label === "2–5s"
                    ? "#f59e0b"
                    : "#f43f5e";

          const callPct =
            total > 0 ? ((bucket.count / total) * 100).toFixed(1) : "0";

          return (
            <div key={bucket.label} className="flex items-center gap-4">
              {/* Label */}
              <span className="font-mono text-[12px] text-[#71717a] w-16 flex-shrink-0 text-right">
                {bucket.label}
              </span>

              {/* Bar track */}
              <div className="flex-1 h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${bucket.pct}%`,
                    backgroundColor: color,
                  }}
                />
              </div>

              {/* Count + % */}
              <div className="flex items-center gap-2 w-28 flex-shrink-0">
                <span className="text-[#a1a1aa] text-[12px]">
                  {bucket.count.toLocaleString()}
                </span>
                <span className="text-[#52525b] text-[11px]">({callPct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CostAnalyticsPage() {
  const projectId = await getActiveProjectId();
  const analytics = await getCostAnalytics(projectId);

  return (
    <div>
      {/* ── Page header ── */}
      <div className="flex items-end justify-between gap-6 mb-6">
        <div>
          <h1 className="m-0 text-white text-2xl font-medium leading-tight tracking-[-0.02em]">
            Cost Analysis
          </h1>
          <p className="mt-1.5 text-[#71717a] text-sm m-0">
            Token usage, spend, and latency across all LLM calls · last{" "}
            {DAYS_WINDOW} days
          </p>
        </div>
      </div>

      {/* ── Metric strip ── */}
      <MetricStrip data={analytics} />

      {/* ── Daily spend chart ── */}
      <DailySpendChart days={analytics.daily_spend} />

      {/* ── Model breakdown + latency side by side ── */}
      <ModelBreakdown models={analytics.model_stats} />

      {/* ── Bottom row: top sessions + latency distribution ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
          gap: "24px",
        }}
      >
        <TopSessions sessions={analytics.top_sessions} />
        <LatencyDistribution buckets={analytics.latency_buckets} />
      </div>
    </div>
  );
}
