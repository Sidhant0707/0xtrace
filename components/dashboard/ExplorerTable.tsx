// components/dashboard/ExplorerTable.tsx
//
// "use client" — owns sort, filter, search, and pagination state.
//
// Design constraints:
//   - Zero inline styles. All conditional styling via Tailwind classes.
//   - useRef for the debounce timer to avoid re-renders on every keystroke.
//   - isLast computed in JS for reliable last-row border elimination
//     (CSS :last-child is unreliable with border-collapse in Safari).

"use client";

import { useState, useMemo, useRef, useCallback, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import type { CallRow } from "@/app/dashboard/explorer/page";

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey = keyof Pick<
  CallRow,
  | "model"
  | "tokens_in"
  | "tokens_out"
  | "total_tokens"
  | "latency_ms"
  | "estimated_cost_usd"
  | "timestamp"
>;

type SortDir = "asc" | "desc";

export interface ExplorerTableProps {
  calls: CallRow[];
  models: string[];
  initialModel?: string;
  initialStatus?: string;
  initialQuery?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 200;

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.0001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(4)}`;
}

function truncateId(id: string, len = 14): string {
  return id.length > len ? `${id.slice(0, len - 1)}…` : id;
}

// ── LatencyPill ───────────────────────────────────────────────────────────────
// Color-coded latency indicator — no inline styles, pure Tailwind variants.

function LatencyPill({ ms }: { ms: number }) {
  const label =
    ms >= 5000
      ? `${(ms / 1000).toFixed(1)}s`
      : ms >= 1000
        ? `${(ms / 1000).toFixed(2)}s`
        : `${ms}ms`;

  const colorClass =
    ms >= 5000
      ? "text-[#f43f5e]"
      : ms >= 2000
        ? "text-[#f59e0b]"
        : "text-[#a1a1aa]";

  return <span className={colorClass}>{label}</span>;
}

// ── SortButton ────────────────────────────────────────────────────────────────

interface SortButtonProps {
  field: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (f: SortKey) => void;
}

function SortButton({
  field,
  label,
  sortKey,
  sortDir,
  onSort,
}: SortButtonProps) {
  const isActive = sortKey === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={[
        "flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer",
        "text-[11px] uppercase tracking-[0.05em] font-medium",
        "transition-colors duration-[120ms]",
        isActive ? "text-[#a1a1aa]" : "text-[#71717a] hover:text-[#a1a1aa]",
      ].join(" ")}
    >
      {label}
      <span className="text-[10px]" aria-hidden="true">
        {isActive ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ hasAnomaly }: { hasAnomaly: boolean }) {
  if (hasAnomaly) {
    return (
      <span className="h-5 inline-flex items-center px-2 rounded text-[11px] font-medium tracking-[0.02em] border bg-[#2d1a00] text-[#f59e0b] border-[#451a03]">
        anomaly
      </span>
    );
  }
  return (
    <span className="h-5 inline-flex items-center px-2 rounded text-[11px] font-medium tracking-[0.02em] border bg-[#052e16] text-[#10b981] border-[#064e3b]">
      ok
    </span>
  );
}

// ── ExplorerTable ─────────────────────────────────────────────────────────────

export function ExplorerTable({
  calls,
  models,
  initialModel,
  initialStatus,
  initialQuery,
}: ExplorerTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── State ──────────────────────────────────────────────────────────────
  const [query, setQuery] = useState(initialQuery ?? "");
  const [model, setModel] = useState(initialModel ?? "");
  const [status, setStatus] = useState(initialStatus ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  // ── URL sync ────────────────────────────────────────────────────────────
  const syncUrl = useCallback(
    (params: Record<string, string>) => {
      const sp = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v) sp.set(k, v);
      });
      const qs = sp.toString();
      startTransition(() => {
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
      });
    },
    [router, pathname],
  );

  // ── Handlers ────────────────────────────────────────────────────────────
  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => syncUrl({ q: value, model, status }),
      DEBOUNCE_MS,
    );
  }

  function handleModelChange(value: string) {
    setModel(value);
    setPage(1);
    syncUrl({ q: query, model: value, status });
  }

  function handleStatusChange(value: string) {
    setStatus(value);
    setPage(1);
    syncUrl({ q: query, model, status: value });
  }

  function handleSort(field: SortKey) {
    setSortDir(
      sortKey === field ? (sortDir === "asc" ? "desc" : "asc") : "desc",
    );
    setSortKey(field);
    setPage(1);
  }

  // ── Derived data ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = calls;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      result = result.filter(
        (c) =>
          c.session_id.toLowerCase().includes(q) ||
          c.model.toLowerCase().includes(q),
      );
    }
    if (model) result = result.filter((c) => c.model === model);
    if (status === "anomaly") result = result.filter((c) => c.has_anomaly);
    else if (status === "complete")
      result = result.filter((c) => !c.has_anomaly);
    return result;
  }, [calls, query, model, status]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const dir = sortDir === "asc" ? 1 : -1;
      if (typeof av === "number" && typeof bv === "number")
        return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, sorted.length);
  const visible = sorted.slice(pageStart, pageEnd);

  // ── Aggregate strip ──────────────────────────────────────────────────────
  const stripMetrics = useMemo(
    () => ({
      calls: filtered.length,
      tokens: filtered.reduce((s, c) => s + c.total_tokens, 0),
      cost: filtered.reduce((s, c) => s + c.estimated_cost_usd, 0),
      anomalies: filtered.filter((c) => c.has_anomaly).length,
    }),
    [filtered],
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Aggregate strip ── */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          {
            label: "Calls",
            value: stripMetrics.calls.toLocaleString(),
            color: "text-white",
          },
          {
            label: "Tokens",
            value: formatTokens(stripMetrics.tokens),
            color: "text-white",
          },
          {
            label: "Cost",
            value: formatCost(stripMetrics.cost),
            color: "text-[#10b981]",
          },
          {
            label: "Anomalies",
            value: stripMetrics.anomalies.toString(),
            color: stripMetrics.anomalies > 0 ? "text-[#f59e0b]" : "text-white",
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="bg-[#111] border border-[#1f1f1f] rounded-lg p-4"
          >
            <div className="text-[#71717a] text-[11px] uppercase tracking-[0.05em]">
              {label}
            </div>
            <div
              className={`mt-2 text-[26px] leading-none font-semibold tracking-[-0.03em] ${color}`}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden">
        {/* ── Toolbar ── */}
        <div className="flex items-center gap-3 p-4 border-b border-[#1f1f1f] flex-wrap">
          {/* Search */}
          <input
            type="search"
            placeholder="Search session ID or model…"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            className="h-9 flex-1 min-w-0 max-w-[300px] bg-[#0a0a0a] border border-[#262626] rounded-md px-3 text-sm text-white placeholder:text-[#52525b] outline-none transition-colors duration-[120ms] focus:border-[#3b82f6]"
          />

          {/* Model filter */}
          <div className="relative">
            <select
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              aria-label="Filter by model"
              className="h-9 appearance-none bg-[#0a0a0a] border border-[#262626] rounded-md pl-3 pr-8 text-sm text-[#e4e4e7] outline-none transition-colors duration-[120ms] focus:border-[#3b82f6] cursor-pointer"
            >
              <option value="">All Models</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <span
              className="pointer-events-none absolute right-2.5 top-2.5 text-[#71717a] text-xs"
              aria-hidden="true"
            >
              ⌄
            </span>
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              aria-label="Filter by status"
              className="h-9 appearance-none bg-[#0a0a0a] border border-[#262626] rounded-md pl-3 pr-8 text-sm text-[#e4e4e7] outline-none transition-colors duration-[120ms] focus:border-[#3b82f6] cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="complete">OK</option>
              <option value="anomaly">Anomaly</option>
            </select>
            <span
              className="pointer-events-none absolute right-2.5 top-2.5 text-[#71717a] text-xs"
              aria-hidden="true"
            >
              ⌄
            </span>
          </div>

          <span className="ml-auto text-[#52525b] text-xs whitespace-nowrap">
            {filtered.length} call{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ── Table ── */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse table-fixed min-w-[960px]">
            {/* Column widths: Status | Session ID | Model | Tokens In | Tokens Out | Total | Cost | Latency | Time */}
            <colgroup>
              <col className="w-[56px]" />
              <col className="w-[150px]" />
              <col className="w-[160px]" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col className="w-[110px]" />
              <col className="w-[100px]" />
              <col className="w-[100px]" />
              <col className="w-[110px]" />
            </colgroup>

            <thead>
              <tr>
                {/* Status — not sortable */}
                <th className="h-10 text-left border-b border-[#1f1f1f] px-4 text-[#71717a] text-[11px] uppercase tracking-[0.05em] font-medium" />

                {/* Session ID — not sortable (string, less useful) */}
                <th className="h-10 text-left border-b border-[#1f1f1f] px-4 text-[#71717a] text-[11px] uppercase tracking-[0.05em] font-medium whitespace-nowrap">
                  Session
                </th>

                {(
                  [
                    { field: "model" as SortKey, label: "Model" },
                    { field: "tokens_in" as SortKey, label: "Tokens in" },
                    { field: "tokens_out" as SortKey, label: "Tokens out" },
                    { field: "total_tokens" as SortKey, label: "Total" },
                    { field: "estimated_cost_usd" as SortKey, label: "Cost" },
                    { field: "latency_ms" as SortKey, label: "Latency" },
                    { field: "timestamp" as SortKey, label: "Time" },
                  ] satisfies { field: SortKey; label: string }[]
                ).map(({ field, label }) => (
                  <th
                    key={field}
                    className="h-10 text-left border-b border-[#1f1f1f] px-4 whitespace-nowrap"
                  >
                    <SortButton
                      field={field}
                      label={label}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    />
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="h-32 text-center text-[#52525b] text-sm"
                  >
                    {calls.length === 0
                      ? "No calls yet — push your first trace to get started."
                      : "No calls match the current filters."}
                  </td>
                </tr>
              ) : (
                visible.map((call, idx) => {
                  const isLast = idx === visible.length - 1;
                  const rowBorder = isLast ? "" : "border-b border-[#1f1f1f]";
                  const cell = `h-12 px-4 text-[13px] ${rowBorder}`;

                  return (
                    <tr
                      key={call.id}
                      className="group transition-colors duration-[120ms] hover:bg-[#161616]"
                    >
                      {/* Status dot */}
                      <td className={`${cell} text-center`}>
                        <StatusBadge hasAnomaly={call.has_anomaly} />
                      </td>

                      {/* Session ID — links to session detail */}
                      <td className={cell}>
                        <Link
                          href={`/dashboard/${encodeURIComponent(call.session_id)}`}
                          className="font-mono text-[#3b82f6] hover:text-[#60a5fa] no-underline transition-colors duration-[120ms]"
                          title={call.session_id}
                        >
                          {truncateId(call.session_id)}
                        </Link>
                      </td>

                      {/* Model */}
                      <td className={`${cell} font-mono text-[#e4e4e7]`}>
                        {call.model}
                      </td>

                      {/* Tokens in */}
                      <td className={`${cell} text-[#a1a1aa]`}>
                        {formatTokens(call.tokens_in)}
                      </td>

                      {/* Tokens out */}
                      <td className={`${cell} text-[#a1a1aa]`}>
                        {formatTokens(call.tokens_out)}
                      </td>

                      {/* Total */}
                      <td className={`${cell} text-[#a1a1aa]`}>
                        {formatTokens(call.total_tokens)}
                      </td>

                      {/* Cost */}
                      <td className={`${cell} text-[#10b981]`}>
                        {formatCost(call.estimated_cost_usd)}
                      </td>

                      {/* Latency */}
                      <td className={cell}>
                        <LatencyPill ms={call.latency_ms} />
                      </td>

                      {/* Time */}
                      <td className={`${cell} text-[#52525b]`}>
                        {relativeTime(call.timestamp)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        <div className="h-[52px] flex items-center justify-between px-4 border-t border-[#1f1f1f]">
          <span className="text-[#52525b] text-xs">
            {sorted.length === 0
              ? "No results"
              : `Showing ${pageStart + 1}–${pageEnd} of ${sorted.length}`}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              aria-label="Previous page"
              className={[
                "w-8 h-8 flex items-center justify-center rounded-md border bg-transparent text-sm",
                "transition-colors duration-[120ms]",
                currentPage <= 1
                  ? "border-[#1f1f1f] text-[#333] cursor-not-allowed"
                  : "border-[#333] text-[#a1a1aa] hover:border-[#555] hover:text-white cursor-pointer",
              ].join(" ")}
            >
              ←
            </button>

            <span className="text-[#52525b] text-xs min-w-[60px] text-center">
              {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              aria-label="Next page"
              className={[
                "w-8 h-8 flex items-center justify-center rounded-md border bg-transparent text-sm",
                "transition-colors duration-[120ms]",
                currentPage >= totalPages
                  ? "border-[#1f1f1f] text-[#333] cursor-not-allowed"
                  : "border-[#333] text-[#a1a1aa] hover:border-[#555] hover:text-white cursor-pointer",
              ].join(" ")}
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
