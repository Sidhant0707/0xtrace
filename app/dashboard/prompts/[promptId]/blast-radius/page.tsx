// app/dashboard/prompts/[promptId]/blast-radius/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveProjectId } from "@/lib/project-context";
import { BlastRadiusChart } from "./BlastRadiusChart";

export const metadata: Metadata = { title: "Blast Radius — 0xtrace" };

// ── Types ─────────────────────────────────────────────────────────────────────

interface PromptEventRow {
  id: string;
  event_type: "deployed" | "reverted" | "score_updated";
  version_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface LlmCallRaw {
  session_id: string;
  estimated_cost_usd: number | null;
  tags: Record<string, string> | null;
}

export interface RevertIncident {
  /** The revert event ID */
  id: string;
  /** Version string of the bad version, e.g. "3" */
  badVersion: string;
  /** Version string of the safe version reverted to */
  safeVersion: string;
  /** ISO timestamp of when the bad version was deployed */
  deployedAt: string;
  /** ISO timestamp of the revert */
  revertedAt: string;
  /** Duration of the blast window in minutes */
  durationMinutes: number;
  /** Sessions that ran under the bad version */
  sessionCount: number;
  /** Total cost burned in that window */
  totalCostUsd: number;
  /** Tag key → distinct values seen across affected calls */
  affectedTags: Record<string, string[]>;
  /** Health score at time of revert, if recorded */
  healthScore: number | null;
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function getPromptName(
  promptId: string,
  projectId: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("prompts")
    .select("name")
    .eq("id", promptId)
    .eq("project_id", projectId)
    .single();
  return data?.name ?? null;
}

async function getBlastIncidents(
  promptId: string,
  projectId: string,
): Promise<RevertIncident[]> {
  // 1. Fetch all events for this prompt in a single query (ascending) so we can
  //    pair each revert with its preceding deploy entirely in memory — avoids
  //    an N+1 query pattern.
  const { data: events } = await supabaseAdmin
    .from("prompt_events")
    .select("id, event_type, version_id, metadata, created_at")
    .eq("prompt_id", promptId)
    .order("created_at", { ascending: true });

  if (!events || events.length === 0) return [];

  const rows = events as PromptEventRow[];
  const incidents: RevertIncident[] = [];

  for (const evt of rows) {
    if (evt.event_type !== "reverted") continue;

    const meta = evt.metadata ?? {};
    const badVersion  = String(meta.from_version ?? "");
    const safeVersion = String(meta.to_version   ?? "");
    const healthScore =
      typeof meta.health_score === "number" ? meta.health_score : null;

    // Find the most-recent deploy of the same version that precedes this revert
    const deployEvent = [...rows]
      .reverse()
      .find(
        (e) =>
          e.event_type === "deployed" &&
          e.created_at < evt.created_at &&
          (e.version_id === evt.version_id ||
            String((e.metadata ?? {}).version) === badVersion),
      );

    const deployedAt = deployEvent?.created_at ?? evt.created_at;
    const revertedAt = evt.created_at;
    const durationMinutes = Math.round(
      (new Date(revertedAt).getTime() - new Date(deployedAt).getTime()) / 60_000,
    );

    // 2. Pull llm_calls in the blast window, scoped to this prompt so we don't
    //    inflate counts with unrelated prompts running in the same project.
    const { data: calls } = await supabaseAdmin
      .from("llm_calls")
      .select("session_id, estimated_cost_usd, tags")
      .eq("project_id", projectId)
      .eq("prompt_id", promptId)
      .gte("timestamp", deployedAt)
      .lte("timestamp", revertedAt);

    const blastCalls = (calls ?? []) as LlmCallRaw[];

    // 3. Aggregate in a single pass
    const uniqueSessions = new Set<string>();
    let totalCostUsd = 0;
    const tagSets: Record<string, Set<string>> = {};

    for (const call of blastCalls) {
      uniqueSessions.add(call.session_id);
      totalCostUsd += call.estimated_cost_usd ?? 0;

      for (const [k, v] of Object.entries(call.tags ?? {})) {
        if (!tagSets[k]) tagSets[k] = new Set();
        tagSets[k].add(v);
      }
    }

    incidents.push({
      id: evt.id,
      badVersion:  badVersion  || "?",
      safeVersion: safeVersion || "?",
      deployedAt,
      revertedAt,
      durationMinutes,
      sessionCount: uniqueSessions.size,
      totalCostUsd,
      affectedTags: Object.fromEntries(
        Object.entries(tagSets).map(([k, s]) => [k, Array.from(s)]),
      ),
      healthScore,
    });
  }

  return incidents.reverse(); // newest first
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BlastRadiusPage({
  params,
}: {
  params: Promise<{ promptId: string }>;
}) {
  const { promptId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const projectId = await getActiveProjectId();

  // Fetch name and incidents in parallel
  const [promptName, incidents] = await Promise.all([
    getPromptName(promptId, projectId),
    getBlastIncidents(promptId, projectId),
  ]);

  if (!promptName) notFound();

  const totalSessionsBlasted = incidents.reduce((s, i) => s + i.sessionCount, 0);
  const totalCostBurned      = incidents.reduce((s, i) => s + i.totalCostUsd, 0);

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-zinc-500 text-sm mb-3 flex-wrap">
          <Link href="/dashboard/prompts" className="hover:text-zinc-400 transition-colors">
            Prompts
          </Link>
          <span className="text-zinc-700">/</span>
          <Link
            href={`/dashboard/prompts/${promptId}`}
            className="hover:text-zinc-400 transition-colors"
          >
            {promptName}
          </Link>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-400">Blast Radius</span>
        </div>

        <h1 className="m-0 text-white text-2xl font-medium leading-tight tracking-[-0.02em]">
          Blast Radius
        </h1>
        <p className="mt-1.5 text-zinc-500 text-sm m-0">
          Auto-revert incidents for{" "}
          <span className="text-zinc-300 font-medium">{promptName}</span>
          {incidents.length === 0 ? (
            " · No revert events recorded"
          ) : (
            <>
              {" "}· {incidents.length} incident{incidents.length !== 1 ? "s" : ""}{" "}
              · {totalSessionsBlasted} sessions blasted{" "}
              · ${totalCostBurned.toFixed(4)} burned
            </>
          )}
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto">
        {[
          { label: "Overview",     href: `/dashboard/prompts/${promptId}` },
          { label: "Blast Radius", href: `/dashboard/prompts/${promptId}/blast-radius` },
        ].map((tab) => {
          const isActive = tab.label === "Blast Radius";
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`shrink-0 px-3 py-1.5 rounded text-sm transition-colors ${
                isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {incidents.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-12 text-center">
          <p className="text-zinc-400 text-sm">No auto-revert events found for this prompt.</p>
          <p className="text-zinc-600 text-xs mt-1">
            Blast radius is populated when the scorer triggers an auto-revert.
          </p>
        </div>
      ) : (
        <BlastRadiusChart incidents={incidents} />
      )}
    </div>
  );
}