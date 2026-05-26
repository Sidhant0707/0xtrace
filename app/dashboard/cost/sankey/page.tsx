// app/dashboard/cost/sankey/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveProjectId } from "@/lib/project-context";
import { CostFlowSankey } from "@/components/dashboard/CostFlowSankey";

export const metadata: Metadata = { title: "Cost Flow Sankey — 0xtrace" };

// ── Types ─────────────────────────────────────────────────────────────────────

interface LlmCallRaw {
  session_id: string;
  model: string;
  estimated_cost_usd: number | null;
  tags: Record<string, string> | null;
  metadata: Record<string, unknown> | null;
  project_id: string;
}

export interface SankeyInputNode {
  id: string;
  label: string;
  layer: "project" | "model" | "feature" | "session";
  totalCost: number;
}

export interface SankeyInputLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyData {
  nodes: SankeyInputNode[];
  links: SankeyInputLink[];
  grandTotalCost: number;
}

// ── Data aggregation ──────────────────────────────────────────────────────────

const TOP_SESSIONS = 10;
const UNKNOWN_FEATURE = "(no feature tag)";

async function getSankeyData(projectId: string): Promise<SankeyData> {
  const { data } = await supabaseAdmin
    .from("llm_calls")
    .select("session_id, model, estimated_cost_usd, tags, metadata, project_id")
    .eq("project_id", projectId);

  if (!data || data.length === 0) {
    return { nodes: [], links: [], grandTotalCost: 0 };
  }

  const calls = data as LlmCallRaw[];

  // ── 1. Aggregate cost by (model, feature, session) ──────────────────────────
  type SessionAgg = {
    sessionId: string;
    model: string;
    feature: string;
    cost: number;
  };

  const sessionMap = new Map<string, SessionAgg>();

  for (const call of calls) {
    const cost = call.estimated_cost_usd ?? 0;
    if (cost === 0) continue;

    const model = call.model || "unknown";
    const feature =
      (call.tags?.feature as string | undefined) ??
      (call.metadata?.tags != null &&
      typeof call.metadata.tags === "object" &&
      !Array.isArray(call.metadata.tags)
        ? (call.metadata.tags as Record<string, string>).feature
        : undefined) ??
      UNKNOWN_FEATURE;

    const key = call.session_id;
    const existing = sessionMap.get(key);
    if (existing) {
      existing.cost += cost;
      // Keep dominant model (first seen)
    } else {
      sessionMap.set(key, {
        sessionId: key,
        model,
        feature,
        cost,
      });
    }
  }

  const sessions = Array.from(sessionMap.values());

  // ── 2. Top N sessions by cost ─────────────────────────────────────────────
  const topSessions = [...sessions]
    .sort((a, b) => b.cost - a.cost)
    .slice(0, TOP_SESSIONS);

  const grandTotalCost = sessions.reduce((s, c) => s + c.cost, 0);

  // ── 3. Build Sankey nodes & links ─────────────────────────────────────────
  const PROJECT_ID = `project:${projectId.slice(0, 8)}`;
  const projectLabel = `Project (${projectId.slice(0, 6)}…)`;

  const modelCosts = new Map<string, number>();
  const featureCosts = new Map<string, number>();

  // Only aggregate from the top sessions so widths reflect filtered view
  for (const s of topSessions) {
    modelCosts.set(s.model, (modelCosts.get(s.model) ?? 0) + s.cost);
    featureCosts.set(s.feature, (featureCosts.get(s.feature) ?? 0) + s.cost);
  }

  const nodes: SankeyInputNode[] = [];
  const links: SankeyInputLink[] = [];

  // Project node
  const topCost = topSessions.reduce((s, c) => s + c.cost, 0);
  nodes.push({
    id: PROJECT_ID,
    label: projectLabel,
    layer: "project",
    totalCost: topCost,
  });

  // Model nodes + project→model links
  for (const [model, cost] of modelCosts.entries()) {
    const modelId = `model:${model}`;
    nodes.push({ id: modelId, label: model, layer: "model", totalCost: cost });
    links.push({ source: PROJECT_ID, target: modelId, value: cost });
  }

  // Feature nodes + model→feature links
  // Build (model, feature) pair costs
  const modelFeatureCosts = new Map<string, number>();
  for (const s of topSessions) {
    const key = `${s.model}|||${s.feature}`;
    modelFeatureCosts.set(key, (modelFeatureCosts.get(key) ?? 0) + s.cost);
  }

  for (const [model] of modelCosts.entries()) {
    const modelId = `model:${model}`;
    for (const [feature] of featureCosts.entries()) {
      const pairKey = `${model}|||${feature}`;
      const pairCost = modelFeatureCosts.get(pairKey);
      if (pairCost && pairCost > 0) {
        const featureId = `feature:${feature}`;
        // Add feature node if not present
        if (!nodes.find((n) => n.id === featureId)) {
          nodes.push({
            id: featureId,
            label: feature,
            layer: "feature",
            totalCost: featureCosts.get(feature) ?? 0,
          });
        }
        links.push({ source: modelId, target: featureId, value: pairCost });
      }
    }
  }

  // Session nodes + feature→session links
  for (const s of topSessions) {
    const sessionId = `session:${s.sessionId}`;
    const featureId = `feature:${s.feature}`;
    nodes.push({
      id: sessionId,
      label: s.sessionId.slice(0, 12) + "…",
      layer: "session",
      totalCost: s.cost,
    });
    links.push({ source: featureId, target: sessionId, value: s.cost });
  }

  return { nodes, links, grandTotalCost };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CostSankeyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const projectId = await getActiveProjectId();
  const sankeyData = await getSankeyData(projectId);

  const costTabs = [
    { label: "Overview", href: "/dashboard/cost" },
    { label: "Sankey",   href: "/dashboard/cost/sankey" },
  ];

  function formatCost(usd: number): string {
    if (usd === 0)    return "$0.00";
    if (usd < 0.01)   return `$${usd.toFixed(4)}`;
    if (usd < 1)      return `$${usd.toFixed(3)}`;
    return `$${usd.toFixed(2)}`;
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-zinc-500 text-sm mb-3 flex-wrap">
          <Link href="/dashboard/cost" className="hover:text-zinc-400 transition-colors">
            Cost Analysis
          </Link>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-400">Sankey</span>
        </div>

        <h1 className="m-0 text-white text-2xl font-medium leading-tight tracking-[-0.02em]">
          Cost Flow Sankey
        </h1>
        <p className="mt-1.5 text-zinc-500 text-sm m-0">
          Where your spend flows — Project → Model → Feature → Top{" "}
          {TOP_SESSIONS} Sessions · Grand total{" "}
          <span className="text-zinc-300 font-medium">
            {formatCost(sankeyData.grandTotalCost)}
          </span>
        </p>
      </div>

      {/* Cost sub-tabs */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto">
        {costTabs.map((tab) => {
          const isActive = tab.label === "Sankey";
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

      {sankeyData.nodes.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-12 text-center">
          <p className="text-zinc-400 text-sm">No cost data found.</p>
          <p className="text-zinc-600 text-xs mt-1">
            Send traces with non-zero estimated_cost_usd to populate this view.
          </p>
        </div>
      ) : (
        <CostFlowSankey data={sankeyData} />
      )}
    </div>
  );
}