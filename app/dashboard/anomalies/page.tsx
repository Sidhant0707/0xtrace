// app/dashboard/anomalies/page.tsx
//
// Anomaly Feed — surfaces both explicitly flagged calls and
// automatically detected patterns across all sessions.
//
// Detection logic (two sources):
//
//   1. Explicit — rows where metadata.anomaly === true, set by the SDK
//      dispatcher when the Tracer's anomaly config fires.
//
//   2. Computed — detected in a single JS pass over the dataset:
//      a. Token explosion  — a step's context grew >2.5× the session's
//                            average delta. Signals runaway RAG or loop.
//      b. High latency     — a single call took >5 000ms. Signals timeout,
//                            cold start, or overloaded provider.
//      c. Session cost spike — a session's total cost is >5× the account's
//                              average session cost. Signals infinite loop
//                              or unbounded tool usage.
//
// A session can surface multiple anomaly types. Each gets its own feed card
// so the developer can drill into each issue independently.
//
// One query, zero extra round-trips. All detection runs in JS after the
// initial llm_calls pull.

import type { Metadata } from "next";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveProjectId } from "@/lib/project-context";

// ── Metadata ──────────────────────────────────────────────────────────────────

export const metadata: Metadata = { title: "Anomalies" };

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS_WINDOW = 30;

/** A step is a token explosion if its delta exceeds this multiple of the
 *  session's average delta. */
const EXPLOSION_MULTIPLIER = 2.5;

/** Calls above this latency in ms are flagged as high-latency anomalies. */
const HIGH_LATENCY_MS = 5_000;

/** A session is a cost spike if it costs more than this multiple of the
 *  account-wide average session cost. */
const COST_SPIKE_MULTIPLIER = 5;

// ── Types ─────────────────────────────────────────────────────────────────────

interface LlmCallRaw {
  id: string;
  session_id: string;
  model: string;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number;
  estimated_cost_usd: number | null;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

type AnomalyType =
  | "explicit" // SDK-flagged
  | "token_explosion" // context grew >2.5× avg delta
  | "high_latency" // single call >5s
  | "cost_spike"; // session cost >5× account avg

type Severity = "critical" | "warning";

interface AnomalyItem {
  id: string; // unique key for React — deterministic from source data
  session_id: string;
  type: AnomalyType;
  severity: Severity;
  title: string;
  description: string;
  model: string;
  step_index: number | null; // null for session-level anomalies
  cost_usd: number;
  latency_ms: number | null;
  tokens_in: number | null;
  detected_at: string; // ISO timestamp of the triggering call
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
  return id.length > 20 ? `${id.slice(0, 16)}…` : id;
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

// ── Detection ─────────────────────────────────────────────────────────────────

function detectAnomalies(data: LlmCallRaw[]): AnomalyItem[] {
  const anomalies: AnomalyItem[] = [];

  // ── Group calls by session, ordered ASC ─────────────────────────────────
  const sessionMap = new Map<string, LlmCallRaw[]>();
  for (const row of data) {
    const existing = sessionMap.get(row.session_id);
    if (!existing) {
      sessionMap.set(row.session_id, [row]);
    } else {
      existing.push(row);
    }
  }
  // Each session's calls are already ordered DESC from the query;
  // reverse so step math works in ASC order.
  for (const calls of sessionMap.values()) {
    calls.reverse();
  }

  // ── Account-wide avg session cost (for cost spike detection) ─────────────
  let totalSessionCost = 0;
  let totalSessionCount = 0;
  for (const calls of sessionMap.values()) {
    const cost = calls.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0);
    totalSessionCost += cost;
    totalSessionCount += 1;
  }
  const avgSessionCost =
    totalSessionCount > 0 ? totalSessionCost / totalSessionCount : 0;

  // ── Per-session detection pass ───────────────────────────────────────────
  for (const [sessionId, calls] of sessionMap.entries()) {
    const sessionCost = calls.reduce(
      (s, r) => s + (r.estimated_cost_usd ?? 0),
      0,
    );

    // ── 1. Explicit SDK flags ──────────────────────────────────────────────
    for (let i = 0; i < calls.length; i++) {
      const row = calls[i];
      const flagged =
        row.metadata?.anomaly === true || row.metadata?.anomaly === "true";

      if (flagged) {
        anomalies.push({
          id: `explicit-${row.id}`,
          session_id: sessionId,
          type: "explicit",
          severity: "critical",
          title: "SDK-flagged anomaly",
          description: row.metadata?.anomaly_reason
            ? String(row.metadata.anomaly_reason)
            : `Step ${i + 1} was flagged by the tracer SDK at call time.`,
          model: row.model,
          step_index: i + 1,
          cost_usd: row.estimated_cost_usd ?? 0,
          latency_ms: row.latency_ms,
          tokens_in: row.tokens_in,
          detected_at: row.timestamp,
        });
      }
    }

    // ── 2. Token explosion ─────────────────────────────────────────────────
    if (calls.length > 1) {
      // Compute average delta across all steps.
      const deltas = calls
        .slice(1)
        .map((r, i) => (r.tokens_in ?? 0) - (calls[i].tokens_in ?? 0));
      const avgDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;

      for (let i = 1; i < calls.length; i++) {
        const prev = calls[i - 1];
        const curr = calls[i];
        const delta = (curr.tokens_in ?? 0) - (prev.tokens_in ?? 0);

        if (avgDelta > 0 && delta > avgDelta * EXPLOSION_MULTIPLIER) {
          anomalies.push({
            id: `explosion-${curr.id}`,
            session_id: sessionId,
            type: "token_explosion",
            severity: delta > avgDelta * 4 ? "critical" : "warning",
            title: "Token explosion",
            description: `Context grew by ${formatTokens(delta)} at step ${i + 1} — ${(delta / avgDelta).toFixed(1)}× the session average delta of ${formatTokens(Math.round(avgDelta))}.`,
            model: curr.model,
            step_index: i + 1,
            cost_usd: curr.estimated_cost_usd ?? 0,
            latency_ms: curr.latency_ms,
            tokens_in: curr.tokens_in,
            detected_at: curr.timestamp,
          });
        }
      }
    }

    // ── 3. High latency ───────────────────────────────────────────────────
    for (let i = 0; i < calls.length; i++) {
      const row = calls[i];
      if (row.latency_ms >= HIGH_LATENCY_MS) {
        anomalies.push({
          id: `latency-${row.id}`,
          session_id: sessionId,
          type: "high_latency",
          severity: row.latency_ms >= 10_000 ? "critical" : "warning",
          title: "High latency call",
          description: `Step ${i + 1} took ${(row.latency_ms / 1000).toFixed(2)}s — likely a provider timeout, cold start, or rate-limit retry.`,
          model: row.model,
          step_index: i + 1,
          cost_usd: row.estimated_cost_usd ?? 0,
          latency_ms: row.latency_ms,
          tokens_in: row.tokens_in,
          detected_at: row.timestamp,
        });
      }
    }

    // ── 4. Session cost spike ─────────────────────────────────────────────
    if (
      avgSessionCost > 0 &&
      sessionCost > avgSessionCost * COST_SPIKE_MULTIPLIER
    ) {
      // Attribute to the last call in the session (most recent timestamp).
      const lastCall = calls[calls.length - 1];
      anomalies.push({
        id: `spike-${sessionId}`,
        session_id: sessionId,
        type: "cost_spike",
        severity: "critical",
        title: "Session cost spike",
        description: `Session cost ${formatCost(sessionCost)} is ${(sessionCost / avgSessionCost).toFixed(1)}× the account average of ${formatCost(avgSessionCost)} per session.`,
        model: lastCall.model,
        step_index: null,
        cost_usd: sessionCost,
        latency_ms: null,
        tokens_in: null,
        detected_at: lastCall.timestamp,
      });
    }
  }

  // Sort: critical before warning, then newest first within each severity.
  anomalies.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === "critical" ? -1 : 1;
    }
    return a.detected_at < b.detected_at ? 1 : -1;
  });

  return anomalies;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getAnomalyData(projectId: string): Promise<AnomalyItem[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - DAYS_WINDOW);

  const { data, error } = (await supabaseAdmin
    .from("llm_calls")
    .select(
      "id, session_id, model, tokens_in, tokens_out, " +
        "latency_ms, estimated_cost_usd, metadata, timestamp",
    )
    .eq("project_id", projectId)
    .gte("timestamp", since.toISOString())
    .order("timestamp", { ascending: false })
    .limit(10_000)) as { data: LlmCallRaw[] | null; error: Error | null };

  if (error) {
    console.error("[anomalies] query failed:", error.message);
    return [];
  }
  if (!data || data.length === 0) return [];

  return detectAnomalies(data);
}

// ── Sub-components ────────────────────────────────────────────────────────────

// Type config — icon, border color, badge color per anomaly type.
const TYPE_CONFIG: Record<
  AnomalyType,
  { label: string; icon: React.ReactNode }
> = {
  explicit: {
    label: "SDK flagged",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    ),
  },
  token_explosion: {
    label: "Token explosion",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m3 17 6-6 4 4 8-8" />
        <path d="M14 7h7v7" />
      </svg>
    ),
  },
  high_latency: {
    label: "High latency",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  cost_spike: {
    label: "Cost spike",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
};

const SEVERITY_BORDER: Record<Severity, string> = {
  critical: "border-l-[#f43f5e]",
  warning: "border-l-[#f59e0b]",
};

const SEVERITY_BADGE: Record<
  Severity,
  { bg: string; text: string; border: string; label: string }
> = {
  critical: {
    bg: "bg-[#1f0a0a]",
    text: "text-[#f43f5e]",
    border: "border-[#3b0c0c]",
    label: "critical",
  },
  warning: {
    bg: "bg-[#2d1a00]",
    text: "text-[#f59e0b]",
    border: "border-[#451a03]",
    label: "warning",
  },
};

// AnomalyCard — one detected anomaly.
function AnomalyCard({ item }: { item: AnomalyItem }) {
  const typeConfig = TYPE_CONFIG[item.type];
  const badge = SEVERITY_BADGE[item.severity];

  return (
    <div
      className={[
        "bg-[#111] border border-[#1f1f1f] border-l-2 rounded-lg",
        "px-5 py-4",
        "transition-colors duration-[120ms] hover:bg-[#161616] hover:border-[#333]",
        SEVERITY_BORDER[item.severity],
      ].join(" ")}
    >
      {/* ── Top row: type + severity + timestamp ── */}
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-2">
          {/* Type icon */}
          <span
            className={[
              "flex-none",
              item.severity === "critical"
                ? "text-[#f43f5e]"
                : "text-[#f59e0b]",
            ].join(" ")}
            aria-hidden="true"
          >
            {typeConfig.icon}
          </span>

          {/* Title */}
          <span className="text-white text-[13px] font-medium">
            {item.title}
          </span>

          {/* Severity badge */}
          <span
            className={[
              "h-5 inline-flex items-center px-2 rounded",
              "text-[11px] font-medium tracking-[0.02em] border",
              badge.bg,
              badge.text,
              badge.border,
            ].join(" ")}
          >
            {badge.label}
          </span>
        </div>

        <span className="text-[#52525b] text-[12px] flex-shrink-0">
          {relativeTime(item.detected_at)}
        </span>
      </div>

      {/* ── Description ── */}
      <p className="m-0 text-[#71717a] text-[13px] leading-relaxed mb-3">
        {item.description}
      </p>

      {/* ── Meta row: session + model + step + stats ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 text-[12px]">
          {/* Session link */}
          <Link
            href={`/dashboard/${encodeURIComponent(item.session_id)}`}
            className="font-mono text-[#3b82f6] hover:text-[#60a5fa] no-underline transition-colors duration-[120ms]"
            title={item.session_id}
          >
            {truncateId(item.session_id)}
          </Link>

          {/* Model */}
          <span className="font-mono text-[#a1a1aa]">{item.model}</span>

          {/* Step */}
          {item.step_index !== null && (
            <span className="text-[#52525b]">step {item.step_index}</span>
          )}
        </div>

        {/* Stats pills */}
        <div className="flex items-center gap-2">
          {item.cost_usd > 0 && (
            <span className="h-6 border border-[#262626] rounded px-2 inline-flex items-center text-[11px] text-[#10b981] bg-[#111]">
              {formatCost(item.cost_usd)}
            </span>
          )}
          {item.latency_ms !== null && (
            <span className="h-6 border border-[#262626] rounded px-2 inline-flex items-center text-[11px] text-[#a1a1aa] bg-[#111]">
              {(item.latency_ms / 1000).toFixed(2)}s
            </span>
          )}
          {item.tokens_in !== null && (
            <span className="h-6 border border-[#262626] rounded px-2 inline-flex items-center font-mono text-[11px] text-[#a1a1aa] bg-[#111]">
              {formatTokens(item.tokens_in)} ctx
            </span>
          )}

          {/* View step link — only for step-level anomalies */}
          {item.step_index !== null && (
            <Link
              href={`/dashboard/${encodeURIComponent(item.session_id)}/diff?step=${item.step_index}`}
              className={[
                "h-6 flex-none px-2.5",
                "border border-[#262626] rounded",
                "text-[#3b82f6] text-[11px] no-underline",
                "inline-flex items-center",
                "transition-colors duration-[120ms]",
                "hover:border-[#3b82f6] hover:bg-[#161b27]",
              ].join(" ")}
            >
              View diff
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// TypeBreakdown — small summary of counts per anomaly type.
function TypeBreakdown({ anomalies }: { anomalies: AnomalyItem[] }) {
  const counts = (
    [
      "explicit",
      "token_explosion",
      "high_latency",
      "cost_spike",
    ] as AnomalyType[]
  ).map((type) => ({
    type,
    label: TYPE_CONFIG[type].label,
    count: anomalies.filter((a) => a.type === type).length,
    critical: anomalies.filter(
      (a) => a.type === type && a.severity === "critical",
    ).length,
  }));

  return (
    <div className="grid grid-cols-4 gap-4 mb-6">
      {counts.map(({ type, label, count, critical }) => (
        <div
          key={type}
          className="bg-[#111] border border-[#1f1f1f] rounded-lg p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <span
              className={count > 0 ? "text-[#f59e0b]" : "text-[#333]"}
              aria-hidden="true"
            >
              {TYPE_CONFIG[type].icon}
            </span>
            <span className="text-[#71717a] text-[11px] uppercase tracking-[0.05em]">
              {label}
            </span>
          </div>

          <div className="text-white text-[28px] leading-none font-semibold tracking-[-0.03em]">
            {count}
          </div>

          {critical > 0 && (
            <div className="mt-1.5 text-[#f43f5e] text-[11px]">
              {critical} critical
            </div>
          )}
          {count > 0 && critical === 0 && (
            <div className="mt-1.5 text-[#f59e0b] text-[11px]">
              {count} warning
            </div>
          )}
          {count === 0 && (
            <div className="mt-1.5 text-[#333] text-[11px]">none</div>
          )}
        </div>
      ))}
    </div>
  );
}

// EmptyState — shown when no anomalies were detected.
function EmptyState() {
  return (
    <div className="bg-[#111] border border-[#1f1f1f] rounded-lg px-6 py-16 text-center">
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#052e16] border border-[#064e3b] mb-4">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#10b981"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <p className="m-0 text-white text-sm font-medium">
        No anomalies detected
      </p>
      <p className="mt-1.5 mb-0 text-[#52525b] text-[13px]">
        All sessions in the last {DAYS_WINDOW} days look healthy.
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AnomaliesPage() {
  const projectId = await getActiveProjectId();
  const anomalies = await getAnomalyData(projectId);

  const criticalCount = anomalies.filter(
    (a) => a.severity === "critical",
  ).length;
  const warningCount = anomalies.filter((a) => a.severity === "warning").length;
  const sessionCount = new Set(anomalies.map((a) => a.session_id)).size;

  // Sessions with at least one anomaly that also have cost data.
  const affectedCost = anomalies
    .filter((a) => a.type === "cost_spike")
    .reduce((s, a) => s + a.cost_usd, 0);

  return (
    <div>
      {/* ── Page header ── */}
      <div className="flex items-end justify-between gap-6 mb-6">
        <div>
          <h1 className="m-0 text-white text-2xl font-medium leading-tight tracking-[-0.02em]">
            Anomalies
          </h1>
          <p className="mt-1.5 text-[#71717a] text-sm m-0">
            SDK-flagged and auto-detected issues · last {DAYS_WINDOW} days
          </p>
        </div>

        {anomalies.length > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {criticalCount > 0 && (
              <span className="h-7 border border-[#3b0c0c] rounded px-2.5 inline-flex items-center text-xs bg-[#1f0a0a] text-[#f43f5e]">
                {criticalCount} critical
              </span>
            )}
            {warningCount > 0 && (
              <span className="h-7 border border-[#451a03] rounded px-2.5 inline-flex items-center text-xs bg-[#2d1a00] text-[#f59e0b]">
                {warningCount} warning
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Metric strip ── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "Total Anomalies",
            value: anomalies.length.toString(),
            color: anomalies.length > 0 ? "text-[#f59e0b]" : "text-white",
          },
          {
            label: "Critical",
            value: criticalCount.toString(),
            color: criticalCount > 0 ? "text-[#f43f5e]" : "text-white",
          },
          {
            label: "Affected Sessions",
            value: sessionCount.toString(),
            color: "text-white",
          },
          {
            label: "Cost Spike Total",
            value: affectedCost > 0 ? formatCost(affectedCost) : "—",
            color: affectedCost > 0 ? "text-[#f43f5e]" : "text-[#52525b]",
          },
        ].map(({ label, value, color }) => (
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

      {/* ── Type breakdown ── */}
      <TypeBreakdown anomalies={anomalies} />

      {/* ── Feed ── */}
      {anomalies.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-3">
          {/* Section dividers between critical and warning groups */}
          {criticalCount > 0 && (
            <>
              <div className="flex items-center gap-3">
                <span className="text-[#f43f5e] text-[11px] uppercase tracking-[0.05em] font-medium">
                  Critical
                </span>
                <div className="flex-1 h-px bg-[#1f1f1f]" />
                <span className="text-[#52525b] text-[11px]">
                  {criticalCount}
                </span>
              </div>
              {anomalies
                .filter((a) => a.severity === "critical")
                .map((item) => (
                  <AnomalyCard key={item.id} item={item} />
                ))}
            </>
          )}

          {warningCount > 0 && (
            <>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-[#f59e0b] text-[11px] uppercase tracking-[0.05em] font-medium">
                  Warning
                </span>
                <div className="flex-1 h-px bg-[#1f1f1f]" />
                <span className="text-[#52525b] text-[11px]">
                  {warningCount}
                </span>
              </div>
              {anomalies
                .filter((a) => a.severity === "warning")
                .map((item) => (
                  <AnomalyCard key={item.id} item={item} />
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
