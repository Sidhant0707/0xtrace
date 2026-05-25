// components/dashboard/SessionsTable.tsx

"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TagBadge } from "./TagBadge";
import type { SessionRow } from "@/app/dashboard/page";

interface SessionsTableProps {
  sessions: SessionRow[];
  models: string[];
  initialModel?: string;
  initialStatus?: string;
  initialQuery?: string;
  initialTag?: string;
}

export function SessionsTable({
  sessions,
  models,
  initialModel,
  initialStatus,
  initialQuery,
  initialTag,
}: SessionsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [model, setModel] = useState(initialModel ?? "");
  const [status, setStatus] = useState(initialStatus ?? "");
  const [query, setQuery] = useState(initialQuery ?? "");
  const [tag, setTag] = useState(initialTag ?? "");

  function buildUrl(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");

    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });

    return `/dashboard?${params.toString()}`;
  }

  function handleModelChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setModel(val);
    router.push(buildUrl({ model: val, status, q: query, tag }));
  }

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setStatus(val);
    router.push(buildUrl({ model, status: val, q: query, tag }));
  }

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    router.push(buildUrl({ model, status, q: val, tag }));
  }

  function handleTagChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setTag(val);
    router.push(buildUrl({ model, status, q: query, tag: val }));
  }

  function handleRowClick(sessionId: string) {
    router.push(`/dashboard/${sessionId}`);
  }

  const activeFilterCount = [model, status, query, tag].filter(Boolean).length;

  return (
    <div>
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search session ID..."
          value={query}
          onChange={handleQueryChange}
          className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
        />

        <input
          type="text"
          placeholder="Filter by tag (e.g. env:prod)"
          value={tag}
          onChange={handleTagChange}
          className="flex-1 sm:flex-[0.6] px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500"
        />

        <select
          value={model}
          onChange={handleModelChange}
          className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
          title="Filter by model"
        >
          <option value="">All Models</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={handleStatusChange}
          className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
          title="Filter by status"
        >
          <option value="">All Status</option>
          <option value="complete">Complete</option>
          <option value="anomaly">Anomaly</option>
        </select>
      </div>

      {activeFilterCount > 0 && (
        <div className="mb-3 flex items-center gap-2 text-xs text-zinc-400">
          <span>
            {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
          </span>
          <button
            onClick={() => {
              setModel("");
              setStatus("");
              setQuery("");
              setTag("");
              router.push("/dashboard");
            }}
            className="text-emerald-400 hover:text-emerald-300 underline"
          >
            Clear all
          </button>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="p-8 text-center border border-zinc-800 rounded-lg bg-zinc-900/50">
          <p className="text-zinc-400 text-sm">
            No sessions match your filters.
          </p>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50">
                  <th className="text-left text-xs uppercase tracking-wide text-zinc-500 font-medium px-4 py-3">
                    Session ID
                  </th>
                  <th className="text-left text-xs uppercase tracking-wide text-zinc-500 font-medium px-4 py-3">
                    Model
                  </th>
                  <th className="text-left text-xs uppercase tracking-wide text-zinc-500 font-medium px-4 py-3">
                    Steps
                  </th>
                  <th className="text-left text-xs uppercase tracking-wide text-zinc-500 font-medium px-4 py-3">
                    Tokens
                  </th>
                  <th className="text-left text-xs uppercase tracking-wide text-zinc-500 font-medium px-4 py-3">
                    Cost
                  </th>
                  <th className="text-left text-xs uppercase tracking-wide text-zinc-500 font-medium px-4 py-3">
                    Latency
                  </th>
                  <th className="text-left text-xs uppercase tracking-wide text-zinc-500 font-medium px-4 py-3">
                    Tags
                  </th>
                  <th className="text-left text-xs uppercase tracking-wide text-zinc-500 font-medium px-4 py-3">
                    Last Call
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr
                    key={session.session_id}
                    onClick={() => handleRowClick(session.session_id)}
                    className="border-b border-zinc-800 hover:bg-zinc-800/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="text-white font-mono text-sm">
                          {session.session_id.slice(0, 8)}
                        </code>
                        {session.has_anomaly && (
                          <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 text-xs rounded">
                            !
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-300 text-sm">
                      {session.model}
                    </td>
                    <td className="px-4 py-3 text-zinc-300 text-sm">
                      {session.step_count}
                    </td>
                    <td className="px-4 py-3 text-zinc-300 text-sm">
                      {session.total_tokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-emerald-400 text-sm">
                      ${session.total_cost_usd.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-zinc-300 text-sm">
                      {(session.avg_latency_ms / 1000).toFixed(2)}s
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(session.tags)
                          .slice(0, 2)
                          .map(([k, v]) => (
                            <TagBadge key={k} tagKey={k} tagValue={v} />
                          ))}
                        {Object.keys(session.tags).length > 2 && (
                          <span className="text-xs text-zinc-500">
                            +{Object.keys(session.tags).length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs" suppressHydrationWarning>
                      {new Date(session.last_call_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
