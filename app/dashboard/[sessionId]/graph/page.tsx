// app/dashboard/[sessionId]/graph/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveProjectId } from "@/lib/project-context";
import { AgentLoopGraph } from "@/components/dashboard/AgentLoopGraph";
import type { StepData } from "@/components/dashboard/AgentLoopGraph";

export const metadata: Metadata = { title: "Agent Loop Graph — 0xtrace" };

interface LlmCallRow {
  step_index: number;
  model: string;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number;
  estimated_cost_usd: number | null;
  is_stream: boolean;
  metadata: Record<string, unknown> | null;
}

async function getSessionSteps(
  projectId: string,
  sessionId: string,
): Promise<StepData[]> {
  const { data } = await supabaseAdmin
    .from("llm_calls")
    .select(
      "step_index, model, tokens_in, tokens_out, latency_ms, estimated_cost_usd, is_stream, metadata",
    )
    .eq("project_id", projectId)
    .eq("session_id", sessionId)
    .order("step_index", { ascending: true });

  if (!data) return [];

  return (data as LlmCallRow[]).map((row) => ({
    stepIndex: row.step_index,
    model: row.model,
    tokensIn: row.tokens_in ?? 0,
    tokensOut: row.tokens_out ?? 0,
    latencyMs: row.latency_ms,
    costUsd: row.estimated_cost_usd ?? 0,
    isStream: row.is_stream,
    hasError:
      row.metadata?.anomaly === true || row.metadata?.anomaly === "true",
  }));
}

export default async function GraphPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const projectId = await getActiveProjectId();
  const steps = await getSessionSteps(projectId, sessionId);

  if (steps.length === 0) notFound();

  const tabs = [
    { label: "Overview", href: `/dashboard/${sessionId}` },
    { label: "Diff", href: `/dashboard/${sessionId}/diff` },
    { label: "Graph", href: `/dashboard/${sessionId}/graph` },
    { label: "Replay", href: `/dashboard/${sessionId}/replay` },
  ];

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2 text-zinc-500 text-sm mb-3 flex-wrap">
          <Link
            href="/dashboard"
            className="hover:text-zinc-400 transition-colors"
          >
            Sessions
          </Link>
          <span className="text-zinc-700">/</span>
          <Link
            href={`/dashboard/${sessionId}`}
            className="hover:text-zinc-400 transition-colors font-mono"
          >
            {sessionId.slice(0, 8)}…
          </Link>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-400">Graph</span>
        </div>

        <h1 className="m-0 text-white text-2xl font-medium leading-tight tracking-[-0.02em]">
          Agent Loop Graph
        </h1>
        <p className="mt-1.5 text-zinc-500 text-sm m-0">
          Execution flow for{" "}
          <span className="font-mono text-zinc-400">
            {sessionId.slice(0, 16)}…
          </span>{" "}
          · Red edges = context explosion · Violet nodes = loop suspect
        </p>
      </div>

      <div className="flex items-center gap-1 mb-6 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.label === "Graph";
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

      <AgentLoopGraph steps={steps} />
    </div>
  );
}
