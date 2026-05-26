// app/dashboard/prompts/[promptId]/blast-radius/BlastRadiusChart.tsx

"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { RevertIncident } from "./page";

interface BlastRadiusChartProps {
  incidents: RevertIncident[];
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.0001) return `$${usd.toFixed(8).replace(/0+$/, "")}`;
  if (usd < 0.01) return `$${usd.toFixed(6).replace(/0+$/, "")}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getIntensityColor(sessions: number): string {
  if (sessions === 0) return "#27272a";
  if (sessions < 10) return "#fbbf24"; // yellow
  if (sessions < 50) return "#fb923c"; // orange
  if (sessions < 100) return "#f87171"; // red
  return "#dc2626"; // dark red
}

export function BlastRadiusChart({ incidents }: BlastRadiusChartProps) {
  // Flatten to chart-friendly shape — memoised to avoid rebuilding on every render
  const chartData = useMemo(
    () =>
      incidents.map((inc, idx) => ({
        name: `Revert ${idx + 1}`,
        sessions: inc.sessionCount,
        cost: inc.totalCostUsd,
        badVersion: inc.badVersion,
        safeVersion: inc.safeVersion,
        deployedAt: inc.deployedAt,
        revertedAt: inc.revertedAt,
        durationMinutes: inc.durationMinutes,
        healthScore: inc.healthScore,
        affectedTags: inc.affectedTags,
      })),
    [incidents],
  );

  return (
    <div className="space-y-6">
      {/* Timeline Chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
        <div className="mb-4">
          <h2 className="text-white text-lg font-medium m-0">
            Revert Timeline
          </h2>
          <p className="text-zinc-500 text-sm mt-1 m-0">
            Session impact and cost burned per revert event
          </p>
        </div>

        <div className="overflow-x-auto">
          <ResponsiveContainer width="100%" height={300} minWidth={600}>
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />

              <XAxis
                dataKey="name"
                stroke="#71717a"
                tick={{ fill: "#71717a", fontSize: 12 }}
              />

              <YAxis
                stroke="#71717a"
                tick={{ fill: "#71717a", fontSize: 12 }}
                label={{
                  value: "Affected Sessions",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#71717a",
                }}
              />

              <Tooltip
                contentStyle={{
                  backgroundColor: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: "6px",
                  color: "#fff",
                }}
                labelStyle={{ color: "#a1a1aa" }}
                formatter={(value, name) => {
                  if (name !== "sessions") return undefined;
                  const count =
                    typeof value === "number"
                      ? value.toLocaleString()
                      : String(value);
                  return [`${count} sessions`, "Affected"] as [string, string];
                }}
                labelFormatter={(label, payload) => {
                  const item = payload?.[0]?.payload as
                    | (typeof chartData)[0]
                    | undefined;
                  if (!item) return String(label);
                  return `v${item.badVersion} → v${item.safeVersion}`;
                }}
              />

              <Bar dataKey="sessions" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={getIntensityColor(entry.sessions)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs flex-wrap">
          <span className="text-zinc-500">Intensity:</span>
          {[
            { color: "#fbbf24", label: "<10 sessions" },
            { color: "#fb923c", label: "10–49 sessions" },
            { color: "#f87171", label: "50–99 sessions" },
            { color: "#dc2626", label: "100+ sessions" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: color }}
              />
              <span className="text-zinc-400">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Incident cards */}
      <div className="space-y-4">
        {chartData.map((inc, idx) => {
          // affectedTags is Record<string, string[]> — show each key with its distinct values
          const tagEntries = Object.entries(inc.affectedTags).slice(0, 5);

          return (
            <div
              key={idx}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-5"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: getIntensityColor(inc.sessions),
                      }}
                    />
                    <h3 className="text-white font-medium text-base m-0">
                      v{inc.badVersion} → v{inc.safeVersion}
                    </h3>
                  </div>
                  <div className="text-zinc-500 text-sm space-y-1">
                    <p className="m-0">
                      Deployed:{" "}
                      <span className="text-zinc-400">
                        {formatDate(inc.deployedAt)}
                      </span>
                    </p>
                    <p className="m-0">
                      Reverted:{" "}
                      <span className="text-zinc-400">
                        {formatDate(inc.revertedAt)}
                      </span>
                      <span className="text-zinc-600 ml-2">
                        ({formatDuration(inc.durationMinutes)} live)
                      </span>
                    </p>
                    {inc.healthScore !== null && (
                      <p className="m-0">
                        Health Score:{" "}
                        <span className="text-red-400">
                          {inc.healthScore.toFixed(1)}
                        </span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-4">
                  <div>
                    <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">
                      Sessions
                    </div>
                    <div className="text-white text-2xl font-semibold">
                      {inc.sessions.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-zinc-500 text-xs uppercase tracking-wide mb-1">
                      Cost Burned
                    </div>
                    <div className="text-red-400 text-2xl font-semibold">
                      {formatCost(inc.cost)}
                    </div>
                  </div>
                </div>
              </div>

              {tagEntries.length > 0 && (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <div className="text-zinc-500 text-xs uppercase tracking-wide mb-2">
                    Affected Tags
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {tagEntries.map(([key, values]) => (
                      <div
                        key={key}
                        className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs"
                      >
                        <span className="text-zinc-500">{key}:</span>{" "}
                        <span className="text-zinc-300">
                          {values.join(", ")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
