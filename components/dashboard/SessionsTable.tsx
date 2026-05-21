// components/dashboard/SessionsTable.tsx
//
// "use client" — owns sort, search, filter, and pagination state.
//
// Design decisions:
//   1. All filtering/sorting is done client-side on the already-fetched data.
//      The dataset per user is small enough (< 500 sessions) that this is
//      faster than a round-trip for every keystroke.
//   2. URL search params are kept in sync via router.replace() so the user
//      can share a filtered URL and bookmark their view.
//   3. Pagination is purely presentational — slicing the sorted array.
//      No network request on page change.
//   4. The search input is debounced at 200ms to avoid router.replace() spam.

"use client";

import { useState, useMemo, useCallback, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import type { SessionRow } from "@/app/dashboard/page";

// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey = keyof Pick<
  SessionRow,
  | "session_id"
  | "model"
  | "step_count"
  | "total_tokens"
  | "total_cost_usd"
  | "avg_latency_ms"
  | "last_call_at"
>;

type SortDir = "asc" | "desc";

export interface SessionsTableProps {
  sessions: SessionRow[];
  models: string[];
  initialModel?: string;
  initialStatus?: string;
  initialQuery?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;
const DEBOUNCE_MS = 200;

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay !== 1 ? "s" : ""} ago`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function truncateId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 12)}...` : id;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface SortButtonProps {
  field: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (field: SortKey) => void;
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
        "flex items-center gap-1",
        "bg-transparent border-none p-0 cursor-pointer",
        "text-[12px] uppercase tracking-[0.05em] font-medium",
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

interface StatusBadgeProps {
  hasAnomaly: boolean;
}

function StatusBadge({ hasAnomaly }: StatusBadgeProps) {
  if (hasAnomaly) {
    return (
      <span
        className={[
          "h-5 inline-flex items-center px-2 rounded",
          "text-[11px] font-medium tracking-[0.02em] border",
          "bg-[#2d1a00] text-[#f59e0b] border-[#451a03]",
        ].join(" ")}
      >
        anomaly
      </span>
    );
  }
  return (
    <span
      className={[
        "h-5 inline-flex items-center px-2 rounded",
        "text-[11px] font-medium tracking-[0.02em] border",
        "bg-[#052e16] text-[#10b981] border-[#064e3b]",
      ].join(" ")}
    >
      complete
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SessionsTable({
  sessions,
  models,
  initialModel,
  initialStatus,
  initialQuery,
}: SessionsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  // ── Local state ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState(initialQuery ?? "");
  const [model, setModel] = useState(initialModel ?? "");
  const [status, setStatus] = useState(initialStatus ?? "");
  const [sortKey, setSortKey] = useState<SortKey>("last_call_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  // ── URL sync ─────────────────────────────────────────────────────────────
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

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(1);
    if (debounceTimer) clearTimeout(debounceTimer);
    setDebounceTimer(
      setTimeout(() => syncUrl({ q: value, model, status }), DEBOUNCE_MS),
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
    if (sortKey === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(field);
      setSortDir("desc");
    }
    setPage(1);
  }

  // ── Derived data ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = sessions;

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      result = result.filter((s) => s.session_id.toLowerCase().includes(q));
    }
    if (model) {
      result = result.filter((s) => s.model === model);
    }
    if (status === "anomaly") {
      result = result.filter((s) => s.has_anomaly);
    } else if (status === "complete") {
      result = result.filter((s) => !s.has_anomaly);
    }

    return result;
  }, [sessions, query, model, status]);

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 p-4 border-b border-[#1f1f1f]">
        {/* Search */}
        <input
          type="search"
          placeholder="Search session ID…"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          className={[
            "h-9 flex-1 min-w-0 max-w-[280px]",
            "bg-[#0a0a0a] border border-[#262626] rounded-md",
            "px-3 text-sm text-white placeholder:text-[#52525b]",
            "outline-none transition-colors duration-[120ms]",
            "focus:border-[#3b82f6]",
          ].join(" ")}
        />

        {/* Model filter */}
        <div className="relative">
          <select
            value={model}
            onChange={(e) => handleModelChange(e.target.value)}
            className={[
              "h-9 appearance-none",
              "bg-[#0a0a0a] border border-[#262626] rounded-md",
              "pl-3 pr-8 text-sm text-[#e4e4e7]",
              "outline-none transition-colors duration-[120ms]",
              "focus:border-[#3b82f6] cursor-pointer",
            ].join(" ")}
            aria-label="Filter by model"
          >
            <option value="">All Models</option>
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-2.5 top-2.5 text-[#71717a] text-xs">
            ⌄
          </span>
        </div>

        {/* Status filter */}
        <div className="relative">
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className={[
              "h-9 appearance-none",
              "bg-[#0a0a0a] border border-[#262626] rounded-md",
              "pl-3 pr-8 text-sm text-[#e4e4e7]",
              "outline-none transition-colors duration-[120ms]",
              "focus:border-[#3b82f6] cursor-pointer",
            ].join(" ")}
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            <option value="complete">Complete</option>
            <option value="anomaly">Anomaly</option>
          </select>
          <span className="pointer-events-none absolute right-2.5 top-2.5 text-[#71717a] text-xs">
            ⌄
          </span>
        </div>

        {/* Result count — right side */}
        <span className="ml-auto text-[#52525b] text-xs whitespace-nowrap">
          {filtered.length} session{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse table-fixed min-w-[900px]">
          <colgroup>
            <col className="w-[160px]" />
            <col className="w-[160px]" />
            <col className="w-[80px]" />
            <col className="w-[130px]" />
            <col className="w-[90px]" />
            <col className="w-[110px]" />
            <col className="w-[110px]" />
            <col className="w-[120px]" />
          </colgroup>

          <thead>
            <tr>
              {(
                [
                  { field: "session_id", label: "Session ID" },
                  { field: "model", label: "Model" },
                  { field: "step_count", label: "Steps" },
                  { field: "total_tokens", label: "Total Tokens" },
                  { field: "total_cost_usd", label: "Cost" },
                  { field: "avg_latency_ms", label: "Avg Latency" },
                ] as { field: SortKey; label: string }[]
              ).map(({ field, label }) => (
                <th
                  key={field}
                  className="h-11 text-left border-b border-[#1f1f1f] px-4"
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
              <th className="h-11 text-left border-b border-[#1f1f1f] px-4 text-[#71717a] text-[12px] uppercase tracking-[0.05em] font-medium">
                Status
              </th>
              <th className="h-11 text-left border-b border-[#1f1f1f] px-4 text-[#71717a] text-[12px] uppercase tracking-[0.05em] font-medium">
                Timestamp
              </th>
            </tr>
          </thead>

          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="h-32 text-center text-[#52525b] text-sm"
                >
                  {sessions.length === 0
                    ? "No sessions yet — push your first trace to get started."
                    : "No sessions match the current filters."}
                </td>
              </tr>
            ) : (
              visible.map((session) => (
                <tr
                  key={session.session_id}
                  className={[
                    "group cursor-pointer",
                    "transition-colors duration-[120ms]",
                    "hover:bg-[#161616]",
                    // Last row: remove bottom border
                    "last:border-b-0",
                  ].join(" ")}
                >
                  {/* Session ID — amber left border for anomalies */}
                  <td
                    className={[
                      "h-14 border-b border-[#1f1f1f] px-4",
                      "group-last:border-b-0",
                      session.has_anomaly
                        ? "border-l-2 border-l-[#f59e0b]"
                        : "",
                    ].join(" ")}
                  >
                    <Link
                      href={`/dashboard/${encodeURIComponent(session.session_id)}`}
                      className={[
                        "font-mono text-[13px] text-[#e4e4e7]",
                        "hover:text-white no-underline",
                        "transition-colors duration-[120ms]",
                      ].join(" ")}
                      title={session.session_id}
                    >
                      {truncateId(session.session_id)}
                    </Link>
                  </td>

                  <td className="h-14 border-b border-[#1f1f1f] px-4 text-[#a1a1aa] text-sm group-last:border-b-0">
                    {session.model}
                  </td>

                  <td className="h-14 border-b border-[#1f1f1f] px-4 text-[#a1a1aa] text-sm group-last:border-b-0">
                    {session.step_count}
                  </td>

                  <td className="h-14 border-b border-[#1f1f1f] px-4 text-[#a1a1aa] text-sm group-last:border-b-0">
                    {formatTokens(session.total_tokens)}
                  </td>

                  <td className="h-14 border-b border-[#1f1f1f] px-4 text-[#10b981] text-sm group-last:border-b-0">
                    ${session.total_cost_usd.toFixed(4)}
                  </td>

                  <td className="h-14 border-b border-[#1f1f1f] px-4 text-[#a1a1aa] text-sm group-last:border-b-0">
                    {(session.avg_latency_ms / 1000).toFixed(2)}s
                  </td>

                  <td className="h-14 border-b border-[#1f1f1f] px-4 group-last:border-b-0">
                    <StatusBadge hasAnomaly={session.has_anomaly} />
                  </td>

                  <td className="h-14 border-b border-[#1f1f1f] px-4 text-[#52525b] text-sm group-last:border-b-0">
                    {relativeTime(session.last_call_at)}
                  </td>
                </tr>
              ))
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
              "w-8 h-8 flex items-center justify-center",
              "border border-[#333] bg-transparent rounded-md",
              "text-sm transition-colors duration-[120ms]",
              currentPage <= 1
                ? "text-[#333] cursor-not-allowed"
                : "text-[#a1a1aa] hover:border-[#555] hover:text-white cursor-pointer",
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
              "w-8 h-8 flex items-center justify-center",
              "border border-[#333] bg-transparent rounded-md",
              "text-sm transition-colors duration-[120ms]",
              currentPage >= totalPages
                ? "text-[#333] cursor-not-allowed"
                : "text-[#a1a1aa] hover:border-[#555] hover:text-white cursor-pointer",
            ].join(" ")}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
