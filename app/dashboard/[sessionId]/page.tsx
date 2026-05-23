// app/dashboard/[sessionId]/page.tsx
//
// Session detail — renders the full execution timeline for one agent run.
//
// Data architecture:
//   - Pure Server Component. All queries run at request time.
//   - `llm_calls` rows ordered ASC by timestamp become the steps array.
//     Each row's `tokens_in` is the full cumulative context that was sent
//     to the model at that step — so the growth curve falls out naturally.
//   - Step classification (normal / spike / error) is derived from how each
//     step's token delta compares to the session average delta.
//   - The context growth chart is pure CSS — no client JS, no chart library.
//     Bar heights are inline styles computed here on the server.
//
// Next.js 15 note:
//   `params` is a Promise in the App Router. Both generateMetadata and the
//   default export must await it before destructuring.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActiveProjectId } from "@/lib/project-context";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Standard GPT-4o / Claude Sonnet context window. Adjust if you support
 *  models with different limits — or make this per-model in the future. */
const CONTEXT_LIMIT = 128_000;

/** Fraction of CONTEXT_LIMIT at which the anomaly threshold line is drawn. */
const ANOMALY_THRESHOLD_PCT = 0.6;

// ── Types ─────────────────────────────────────────────────────────────────────

/** Raw row shape returned by the Supabase query. */
interface LlmCallRaw {
  id: string;
  model: string;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number;
  estimated_cost_usd: number | null;
  metadata: Record<string, unknown> | null;
  timestamp: string;
  /** JSONB array of {role, content} message objects. May be null if the SDK
   *  was not configured to capture prompts, or on older trace rows. */
}

type StepClassification = "normal" | "spike" | "error";

/** One processed step in the session timeline. */
interface StepData {
  llm_call_id: string;
  step_index: number; // 1-based display index
  model: string;
  tokens_in: number; // full context sent at this step
  tokens_out: number;
  tokens_prev: number; // tokens_in of the previous step (0 for step 1)
  tokens_delta: number; // tokens_in − tokens_prev
  latency_ms: number;
  cost_usd: number;
  has_anomaly: boolean;
  prompt_preview: string; // truncated last user/assistant message
  classification: StepClassification;
  timestamp: string;
}

/** Aggregated header data for the session. */
interface SessionSummary {
  session_id: string;
  model: string; // dominant model across all steps
  total_steps: number;
  total_tokens: number; // sum of (tokens_in + tokens_out) across all steps
  total_cost_usd: number;
  avg_latency_ms: number;
  has_anomaly: boolean;
  started_at: string;
}

interface PageProps {
  params: Promise<{ SessionId: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.0001) return `$${usd.toFixed(8).replace(/0+$/, "")}`;
  if (usd < 0.01) return `$${usd.toFixed(6).replace(/0+$/, "")}`;
  return `$${usd.toFixed(4)}`;
}

/** Safely extracts a short preview from a prompt JSONB column.
 *  Returns the last user or assistant message, truncated to 120 chars.
 *  Never throws — returns "" on any parse failure. */
function extractPromptPreview(raw: unknown): string {
  if (!raw) return "";
  try {
    if (!Array.isArray(raw) || raw.length === 0) return "";

    const messages = raw as Array<{ role?: string; content?: unknown }>;
    const last = [...messages]
      .reverse()
      .find((m) => m.role === "user" || m.role === "assistant");

    const target = last ?? messages[messages.length - 1];
    const content =
      typeof target?.content === "string"
        ? target.content
        : JSON.stringify(target?.content ?? "");

    return content.slice(0, 120);
  } catch {
    return "";
  }
}

/** Classifies a step based on how its token delta compares to the session
 *  average. The `hasAnomaly` flag (from metadata) always forces "error". */
function classifyStep(
  tokensDelta: number,
  avgDelta: number,
  hasAnomaly: boolean,
): StepClassification {
  if (hasAnomaly) return "error";
  if (avgDelta > 0 && tokensDelta > avgDelta * 2.5) return "error";
  if (avgDelta > 0 && tokensDelta > avgDelta * 1.5) return "spike";
  return "normal";
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getSessionData(
  projectId: string,
  sessionId: string,
): Promise<{
  summary: SessionSummary;
  steps: StepData[];
} | null> {
  const { data, error } = (await supabaseAdmin
    .from("llm_calls")
    .select(
      "id, model, tokens_in, tokens_out, latency_ms, " +
        "estimated_cost_usd, metadata, timestamp",
    )
    .eq("session_id", sessionId)
    .eq("project_id", projectId)
    .order("timestamp", { ascending: true })
    .limit(200)) as { data: LlmCallRaw[] | null; error: Error | null };

  if (error) {
    console.error("[session-detail] query failed:", error.message);
    return null;
  }

  if (!data || data.length === 0) return null;

  // ── Average token delta (skip step 1 which has no previous) ─────────────
  let avgDelta = 0;
  if (data.length > 1) {
    const deltas = data
      .slice(1)
      .map((row, i) => (row.tokens_in ?? 0) - (data[i].tokens_in ?? 0));
    avgDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  }

  // ── Build StepData[] ─────────────────────────────────────────────────────
  const steps: StepData[] = data.map((row, idx) => {
    const tokensIn = row.tokens_in ?? 0;
    const tokensOut = row.tokens_out ?? 0;
    const tokensPrev = idx > 0 ? (data[idx - 1].tokens_in ?? 0) : 0;
    const tokensDelta = tokensIn - tokensPrev;
    const hasAnomaly =
      row.metadata?.anomaly === true || row.metadata?.anomaly === "true";

    return {
      llm_call_id: row.id,
      step_index: idx + 1,
      model: row.model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      tokens_prev: tokensPrev,
      tokens_delta: tokensDelta,
      latency_ms: row.latency_ms,
      cost_usd: row.estimated_cost_usd ?? 0,
      has_anomaly: hasAnomaly,
      prompt_preview: extractPromptPreview(null),
      classification: classifyStep(tokensDelta, avgDelta, hasAnomaly),
      timestamp: row.timestamp,
    };
  });

  // ── SessionSummary ───────────────────────────────────────────────────────
  const totalCost = steps.reduce((s, st) => s + st.cost_usd, 0);
  const totalTokens = steps.reduce(
    (s, st) => s + st.tokens_in + st.tokens_out,
    0,
  );
  const avgLatencyMs =
    steps.reduce((s, st) => s + st.latency_ms, 0) / steps.length;
  const hasAnomaly = steps.some((s) => s.has_anomaly);

  // Dominant model: the model that appears on the most steps.
  const modelCounts = steps.reduce<Record<string, number>>((acc, s) => {
    acc[s.model] = (acc[s.model] ?? 0) + 1;
    return acc;
  }, {});
  const dominantModel = Object.entries(modelCounts).sort(
    (a, b) => b[1] - a[1],
  )[0][0];

  return {
    summary: {
      session_id: sessionId,
      model: dominantModel,
      total_steps: steps.length,
      total_tokens: totalTokens,
      total_cost_usd: totalCost,
      avg_latency_ms: avgLatencyMs,
      has_anomaly: hasAnomaly,
      started_at: data[0].timestamp,
    },
    steps,
  };
}

// ── generateMetadata ──────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { SessionId } = await params;
  const display =
    SessionId.length > 16 ? `${SessionId.slice(0, 12)}…` : SessionId;
  return { title: display };
}

// ── ContextGrowthChart ────────────────────────────────────────────────────────
//
// Pure server component — zero client JS. Heights are inline styles so
// Tailwind's purge step never strips them.

function barFill(tokensIn: number): string {
  const ratio = tokensIn / CONTEXT_LIMIT;
  if (ratio >= 0.7) return "#f43f5e"; // rose  — critical
  if (ratio >= 0.4) return "#f59e0b"; // amber — warning
  return "#10b981"; // emerald — healthy
}

interface ContextGrowthChartProps {
  steps: StepData[];
  hasAnomaly: boolean;
}

function ContextGrowthChart({ steps, hasAnomaly }: ContextGrowthChartProps) {
  // Scale the y-axis to the session's peak context, never below 20% of limit.
  const peakTokens = steps.reduce((m, s) => Math.max(m, s.tokens_in), 0);
  const yMax = Math.max(peakTokens, CONTEXT_LIMIT * 0.2);

  // Round yMax up to a clean multiple of CONTEXT_LIMIT / 4 for neat labels.
  const quarter = CONTEXT_LIMIT / 4;
  const yMaxRound = Math.ceil(yMax / quarter) * quarter;

  // Five evenly-spaced y labels from top to bottom.
  const yLabels = [
    yMaxRound,
    yMaxRound * 0.75,
    yMaxRound * 0.5,
    yMaxRound * 0.25,
    0,
  ];

  // Height of the threshold line as a percentage from the bottom.
  const thresholdFromBottom =
    ((ANOMALY_THRESHOLD_PCT * CONTEXT_LIMIT) / yMaxRound) * 100;

  function labelText(val: number): string {
    if (val >= 1_000_000) return `${Math.round(val / 1_000_000)}M`;
    if (val >= 1_000) return `${Math.round(val / 1_000)}k`;
    return String(Math.round(val));
  }

  return (
    <div className="bg-[#111] border border-[#1f1f1f] rounded-lg p-6 mb-6">
      {/* Header */}
      <h2 className="m-0 text-white text-sm font-medium">Context Growth</h2>
      <p
        className={[
          "mt-1.5 mb-0 text-[12px]",
          hasAnomaly ? "text-[#f59e0b]" : "text-[#71717a]",
        ].join(" ")}
      >
        {hasAnomaly
          ? "Token accumulation per step — exponential growth detected"
          : "Token accumulation per step"}
      </p>

      {/* Chart grid: y-axis (44px) + plot area (1fr) */}
      <div className="mt-6 grid grid-cols-[44px_1fr] gap-3">
        {/* ── Y-axis ── */}
        <div className="relative h-[280px]">
          {yLabels.map((val, i) => (
            <span
              key={i}
              className={`absolute right-0 text-[#71717a] text-[11px] leading-none ${
                i === yLabels.length - 1 ? "bottom-0" : "translate-y-1/2"
              }`}
              style={
                i === yLabels.length - 1
                  ? undefined
                  : {
                      top: `${(i / (yLabels.length - 1)) * 100}%`,
                      transform: "translateY(50%)",
                    }
              }
            >
              {labelText(val)}
            </span>
          ))}
        </div>

        {/* ── Plot area ── */}
        <div className="relative border-l border-b border-[#1f1f1f] h-[280px] px-[14px]">
          {/* Anomaly threshold dashed line */}
          <div
            className="absolute left-0 right-0 pointer-events-none"
            style={{ bottom: `${thresholdFromBottom}%` }}
          >
            <div className="border-t border-dashed border-[#f59e0b]" />
            <span
              className="absolute right-2 text-[#f59e0b] text-[11px] bg-[#111] pl-2"
              style={{ bottom: "2px" }}
            >
              anomaly threshold
            </span>
          </div>

          {/* Bar columns */}
          <div className="h-full flex w-full items-end gap-[10px]">
            {steps.map((step) => {
              const heightPct = Math.min(
                100,
                (step.tokens_in / yMaxRound) * 100,
              );

              return (
                <div
                  key={step.step_index}
                  className="h-full flex flex-col items-center justify-end gap-2"
                  title={`Step ${step.step_index}: ${formatTokens(step.tokens_in)} tokens`}
                >
                  <div
                    className="w-full max-w-[34px] rounded-t min-h-[2px]"
                    style={{
                      height: heightPct > 0 ? `${heightPct}%` : "2px",
                      backgroundColor: barFill(step.tokens_in),
                    }}
                  />
                  <span className="text-[#71717a] text-[10px]">
                    {step.step_index}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── StepCard ──────────────────────────────────────────────────────────────────

const BORDER_COLOR: Record<StepClassification, string> = {
  normal: "border-l-[#10b981]",
  spike: "border-l-[#f59e0b]",
  error: "border-l-[#f43f5e]",
};

const DELTA_COLOR: Record<StepClassification, string> = {
  normal: "text-[#10b981]",
  spike: "text-[#f59e0b]",
  error: "text-[#f43f5e]",
};

interface StepCardProps {
  step: StepData;
  sessionId: string;
}

function StepCard({ step, sessionId }: StepCardProps) {
  return (
    <div
      className={[
        "bg-[#111] border border-[#1f1f1f] border-l-2 rounded-lg",
        "py-4 px-[18px]",
        "transition-colors duration-[120ms]",
        "hover:bg-[#161616] hover:border-[#333]",
        BORDER_COLOR[step.classification],
      ].join(" ")}
    >
      {/* ── Top row: step number + model + latency ── */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-white text-[13px] font-medium">
          Step {step.step_index}
        </span>

        <div className="flex items-center gap-3 text-[#a1a1aa] text-[12px]">
          {step.classification === "error" && (
            <span className="h-5 inline-flex items-center px-2 rounded text-[11px] font-medium tracking-[0.02em] border bg-[#2d1a00] text-[#f59e0b] border-[#451a03]">
              Context anomaly
            </span>
          )}
          <span className="font-mono text-[#e4e4e7] text-[12px]">
            {step.model}
          </span>
          <span>{(step.latency_ms / 1000).toFixed(2)}s</span>
        </div>
      </div>

      {/* ── Middle row: token range + delta + cost + VIEW button ── */}
      <div className="flex items-center justify-between gap-4 mt-2.5">
        <div className="flex items-center gap-3 text-[12px] flex-wrap">
          <span className="text-[#a1a1aa]">
            {formatTokens(step.tokens_prev)} → {formatTokens(step.tokens_in)}{" "}
            tokens
          </span>
          <span className={DELTA_COLOR[step.classification]}>
            +{formatTokens(step.tokens_delta)} Δ
          </span>
          <span className="text-[#10b981]">{formatCost(step.cost_usd)}</span>
        </div>

        <Link
          href={`/dashboard/${encodeURIComponent(sessionId)}/diff?step=${step.step_index}`}
          className={[
            "h-7 flex-none px-[10px]",
            "border border-[#262626] rounded",
            "text-[#3b82f6] text-[11px] no-underline",
            "inline-flex items-center",
            "transition-colors duration-[120ms]",
            "hover:border-[#3b82f6] hover:bg-[#161b27]",
          ].join(" ")}
        >
          VIEW
        </Link>
      </div>

      {/* ── Prompt preview (only rendered if we have content) ── */}
      {step.prompt_preview.length > 0 && (
        <p className="mt-2.5 mb-0 text-[#71717a] text-[12px] italic truncate">
          {step.prompt_preview}
        </p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SessionDetailPage({ params }: PageProps) {
  const { SessionId } = await params;
  const projectId = await getActiveProjectId();
  const result = await getSessionData(SessionId, projectId);

  if (!result) notFound();

  const { summary, steps } = result;

  // Display-safe truncated ID for the breadcrumb.
  const truncatedId =
    SessionId.length > 20 ? `${SessionId.slice(0, 16)}…` : SessionId;

  return (
    <div>
      {/* ── Breadcrumb + page title ── */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-[#52525b] text-[13px] mb-2">
          <Link
            href="/dashboard"
            className="hover:text-[#a1a1aa] no-underline transition-colors duration-[120ms]"
          >
            Sessions
          </Link>
          <span aria-hidden="true">›</span>
          <span className="text-[#a1a1aa]">{truncatedId}</span>
        </div>
        <h1 className="m-0 text-white text-2xl font-medium leading-tight tracking-[-0.02em]">
          Session Detail
        </h1>
      </div>

      {/* ── Session header card ── */}
      <div className="bg-[#111] border border-[#1f1f1f] rounded-lg px-6 py-5 flex items-center justify-between gap-6 mb-6 flex-wrap">
        <div className="min-w-0">
          <div className="font-mono text-white text-[16px] font-medium break-all">
            {SessionId}
          </div>
          <div className="mt-1.5 text-[#71717a] text-[13px]">
            {summary.total_steps} step{summary.total_steps !== 1 ? "s" : ""} ·{" "}
            {summary.model} · Started {relativeTime(summary.started_at)}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          <span className="h-7 border border-[#262626] rounded px-2.5 inline-flex items-center font-mono text-xs bg-[#111] text-[#a1a1aa]">
            {formatTokens(summary.total_tokens)} tokens
          </span>

          <span className="h-7 border border-[#064e3b] rounded px-2.5 inline-flex items-center text-xs bg-[#052e16] text-[#10b981]">
            {formatCost(summary.total_cost_usd)}
          </span>

          {summary.has_anomaly && (
            <span className="h-7 border border-[#451a03] rounded px-2.5 inline-flex items-center text-xs bg-[#2d1a00] text-[#f59e0b]">
              Anomaly detected
            </span>
          )}

          <button
            type="button"
            className={[
              "h-9 px-3 border border-[#333] bg-transparent",
              "text-[#e4e4e7] text-sm rounded-md",
              "inline-flex items-center gap-2",
              "transition-colors duration-[120ms]",
              "hover:border-[#555] active:scale-[0.98]",
            ].join(" ")}
          >
            Replay Session
          </button>
        </div>
      </div>

      {/* ── Context growth chart ── */}
      <ContextGrowthChart steps={steps} hasAnomaly={summary.has_anomaly} />

      {/* ── Step timeline ── */}
      <div className="flex flex-col gap-3">
        {steps.map((step) => (
          <StepCard key={step.llm_call_id} step={step} sessionId={SessionId} />
        ))}
      </div>
    </div>
  );
}
