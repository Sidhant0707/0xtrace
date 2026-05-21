// app/dashboard/explorer/page.tsx
//
// Explorer — raw LLM call browser. Every individual llm_call row,
// filterable, sortable, and paginated.
//
// Think Chrome DevTools Network tab: one row per call (not per session).
// Clicking a row navigates to the parent session detail.
//
// Architecture:
//   - Server Component fetches calls + distinct models server-side.
//   - <ExplorerTable> is "use client" for sort / filter / pagination.
//   - Zero inline styles — all dynamic state expressed via Tailwind
//     conditional classes or CSS custom properties in globals.css.

import type { Metadata } from "next";
import type { SearchParams } from "@/types/next";
import { supabaseAdmin } from "@/lib/supabase";
import { ExplorerTable } from "@/components/dashboard/ExplorerTable";

// ── Metadata ──────────────────────────────────────────────────────────────────

export const metadata: Metadata = { title: "Explorer" };

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CallRow {
  id:                 string;
  session_id:         string;
  model:              string;
  tokens_in:          number;
  tokens_out:         number;
  total_tokens:       number;
  latency_ms:         number;
  estimated_cost_usd: number;
  has_anomaly:        boolean;
  prompt_preview:     string;
  timestamp:          string;
}

interface PageProps {
  searchParams: SearchParams;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getCalls(filters: {
  model?:  string;
  q?:      string;
  status?: string;
}): Promise<CallRow[]> {
  let query = supabaseAdmin
    .from("llm_calls")
    .select(
      "id, session_id, model, tokens_in, tokens_out, " +
      "latency_ms, estimated_cost_usd, metadata, timestamp",
    )
    .order("timestamp", { ascending: false })
    .limit(500);

  if (filters.model) query = query.eq("model", filters.model);
  if (filters.q)     query = query.ilike("session_id", `${filters.q}%`);

  const { data, error } = (await query) as {
    data: Array<{
      id:                  string;
      session_id:          string;
      model:               string;
      tokens_in:           number | null;
      tokens_out:          number | null;
      latency_ms:          number;
      estimated_cost_usd:  number | null;
      metadata:            Record<string, unknown> | null;
      timestamp:           string;
    }> | null;
    error: Error | null;
  };

  if (error || !data) return [];

  let rows: CallRow[] = data.map((r) => {
    const tokensIn  = r.tokens_in  ?? 0;
    const tokensOut = r.tokens_out ?? 0;
    const hasAnomaly =
      r.metadata?.anomaly === true || r.metadata?.anomaly === "true";

    // Extract a short preview from metadata if the SDK stored it,
    // otherwise show an empty string — never crash on missing data.
    const promptPreview =
      typeof r.metadata?.prompt_preview === "string"
        ? r.metadata.prompt_preview.slice(0, 100)
        : "";

    return {
      id:                 r.id,
      session_id:         r.session_id,
      model:              r.model,
      tokens_in:          tokensIn,
      tokens_out:         tokensOut,
      total_tokens:       tokensIn + tokensOut,
      latency_ms:         r.latency_ms,
      estimated_cost_usd: r.estimated_cost_usd ?? 0,
      has_anomaly:        hasAnomaly,
      prompt_preview:     promptPreview,
      timestamp:          r.timestamp,
    };
  });

  // Post-fetch status filter (anomaly vs complete).
  if (filters.status === "anomaly") {
    rows = rows.filter((r) => r.has_anomaly);
  } else if (filters.status === "complete") {
    rows = rows.filter((r) => !r.has_anomaly);
  }

  return rows;
}

async function getDistinctModels(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("llm_calls")
    .select("model");
  if (error || !data) return [];
  return [...new Set(data.map((r) => r.model as string))].sort();
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ExplorerPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const model =
    typeof params.model === "string" ? params.model : undefined;
  const q =
    typeof params.q === "string" ? params.q : undefined;
  const status =
    typeof params.status === "string" ? params.status : undefined;

  const [calls, models] = await Promise.all([
    getCalls({ model, q, status }),
    getDistinctModels(),
  ]);

  return (
    <div>
      {/* ── Page header ── */}
      <div className="flex items-end justify-between gap-6 mb-6">
        <div>
          <h1 className="m-0 text-white text-2xl font-medium leading-tight tracking-[-0.02em]">
            Explorer
          </h1>
          <p className="mt-1.5 text-[#71717a] text-sm m-0">
            Every LLM call — raw, unfiltered, fully inspectable
          </p>
        </div>
      </div>

      {/* ── Call table (client component) ── */}
      <ExplorerTable
        calls={calls}
        models={models}
        initialModel={model}
        initialStatus={status}
        initialQuery={q}
      />
    </div>
  );
}