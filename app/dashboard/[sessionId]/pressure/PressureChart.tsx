// app/dashboard/[sessionId]/pressure/PressureChart.tsx

"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { PressureDataPoint } from "./page";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PressureChartProps {
  data: PressureDataPoint[];
  contextLimit: number;
}

interface TooltipEntry {
  name: string;
  value: number;
  color: string;
  payload: PressureDataPoint & { isJump: boolean };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  const isJump = entry?.payload?.isJump ?? false;
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm shadow-xl">
      <p className="text-zinc-400 mb-1.5 font-mono text-xs">step {label}</p>
      <p className="m-0 text-xs text-emerald-400">
        Cumulative: {formatTokens(entry.value)}
        {isJump && <span className="ml-1.5 text-orange-400">🔥 JUMP</span>}
      </p>
      <p className="text-zinc-500 mt-1 text-xs m-0 font-mono">
        {entry.payload.model}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PressureChart({ data, contextLimit }: PressureChartProps) {
  // Annotate jumps (>10k delta) — memoised so it only reruns when data changes
  const jumps = useMemo(
    () =>
      data.map((point, idx) => {
        if (idx === 0) return { ...point, isJump: false };
        const delta = point.cumulativeTokensIn - data[idx - 1].cumulativeTokensIn;
        return { ...point, isJump: delta > 10_000 };
      }),
    [data],
  );

  // Derived KPI values — each computed once
  const peakTokens = data.length > 0
    ? Math.max(...data.map((d) => d.cumulativeTokensIn))
    : 0;
  const peakPct = contextLimit > 0 ? Math.round((peakTokens / contextLimit) * 100) : 0;
  const highRiskSteps = data.filter(
    (d) => contextLimit > 0 && d.cumulativeTokensIn / contextLimit >= 0.8,
  ).length;
  const jumpCount = jumps.filter((j) => j.isJump).length;

  const yAxisMax = Math.ceil(Math.max(peakTokens, contextLimit) * 1.1);

  return (
    <div className="space-y-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Steps",     value: String(data.length) },
          { label: "Peak Pressure",   value: `${peakPct}%`,         danger: peakPct >= 80 },
          { label: "High-Risk Steps", value: String(highRiskSteps), danger: highRiskSteps > 0 },
          { label: "Context Jumps",   value: String(jumpCount),     danger: jumpCount > 0 },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
            <p className="text-zinc-500 text-xs mb-1 m-0">{kpi.label}</p>
            <p className={`text-lg font-semibold m-0 leading-none ${kpi.danger ? "text-red-400" : "text-white"}`}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* Chart card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 md:p-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <div>
            <h2 className="text-white text-sm font-medium m-0">Cumulative Token Usage by Step</h2>
            <p className="text-zinc-500 text-xs mt-0.5 m-0">Sudden jumps indicate context injection culprits</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-500 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" />
              Cumulative usage
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-6 h-0" style={{ borderTop: "2px dashed #ef4444" }} />
              Context limit
            </span>
            <span className="flex items-center gap-1.5">
              <span>🔥</span>
              Jump {">"}10k
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div style={{ minWidth: 480 }}>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={jumps} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cumulativeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />

                <XAxis
                  dataKey="stepIndex"
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "#3f3f46" }}
                  label={{
                    value: "Step",
                    position: "insideBottomRight",
                    fill: "#52525b",
                    fontSize: 11,
                    offset: -4,
                  }}
                />
                <YAxis
                  tickFormatter={formatTokens}
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, yAxisMax]}
                  width={48}
                />

                <Tooltip content={<CustomTooltip />} />

                <ReferenceLine
                  y={contextLimit}
                  stroke="#ef4444"
                  strokeDasharray="6 3"
                  strokeWidth={1.5}
                  label={{
                    value: `Limit: ${formatTokens(contextLimit)}`,
                    fill: "#ef4444",
                    fontSize: 10,
                    position: "insideTopRight",
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="cumulativeTokensIn"
                  name="Cumulative Tokens"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#cumulativeGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#10b981", strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Step breakdown table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 md:px-6 py-3 border-b border-zinc-800 bg-zinc-950/50">
          <h2 className="text-white text-sm font-medium m-0">Step Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                {["Step", "Model", "Cumulative Tokens", "Utilization", ""].map((h) => (
                  <th
                    key={h}
                    className="text-left text-zinc-500 font-medium py-2 px-4 first:pl-6 last:pr-6"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jumps.map((s) => {
                const pct = contextLimit > 0
                  ? Math.round((s.cumulativeTokensIn / contextLimit) * 100)
                  : 0;
                return (
                  <tr
                    key={s.stepIndex}
                    className={`border-b border-zinc-800/40 last:border-0 transition-colors hover:bg-zinc-800/30 ${
                      pct >= 90 ? "bg-red-950/20" : pct >= 70 ? "bg-amber-950/10" : ""
                    }`}
                  >
                    <td className="py-2 px-4 pl-6 font-mono text-zinc-400">{s.stepIndex}</td>
                    <td className="py-2 px-4 font-mono text-zinc-500 text-[11px]">{s.model}</td>
                    <td className="py-2 px-4 font-mono text-zinc-300">
                      {formatTokens(s.cumulativeTokensIn)}
                    </td>
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden max-w-[80px]">
                          <div
                            className={`h-full rounded-full transition-all ${
                              pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span
                          className={`font-mono tabular-nums ${
                            pct >= 90 ? "text-red-400" : pct >= 70 ? "text-amber-400" : "text-zinc-400"
                          }`}
                        >
                          {pct}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-4 pr-6">
                      {s.isJump && <span title="Token jump >10k">🔥</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Debug: jump details (dev only) */}
      {process.env.NODE_ENV === "development" && (
        <details className="mt-2">
          <summary className="text-zinc-500 text-sm cursor-pointer hover:text-zinc-400">
            Debug: Token Jumps
          </summary>
          <div className="mt-2 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  {["Step", "Cumulative", "Delta"].map((h) => (
                    <th key={h} className="text-left text-zinc-500 font-medium px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jumps
                  .filter((j) => j.isJump)
                  .map((j, idx) => {
                    const prevIdx = data.findIndex((d) => d.stepIndex === j.stepIndex) - 1;
                    const delta = prevIdx >= 0
                      ? j.cumulativeTokensIn - data[prevIdx].cumulativeTokensIn
                      : 0;
                    return (
                      <tr key={idx} className="border-b border-zinc-800">
                        <td className="px-3 py-2 text-white font-mono">{j.stepIndex}</td>
                        <td className="px-3 py-2 text-emerald-400">{j.cumulativeTokensIn.toLocaleString()}</td>
                        <td className="px-3 py-2 text-red-400">+{delta.toLocaleString()}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}