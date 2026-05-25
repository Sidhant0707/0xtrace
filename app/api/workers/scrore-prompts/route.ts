// app/api/workers/score-prompts/route.ts

import { verifySignatureAppRouter }      from "@upstash/qstash/nextjs";
import { supabaseAdmin }                 from "@/lib/supabase";
import { dispatchPromptRevertWebhook }   from "@/lib/webhooks";
import { NextRequest, NextResponse }     from "next/server";

export const maxDuration = 60;
export const dynamic     = "force-dynamic";

const REVERT_THRESHOLD    = 60.0;
const REVERT_COOLDOWN_MS  = 6 * 60 * 60 * 1000;

interface VersionRow {
  id:          string;
  version:     string;
  is_deployed: boolean;
  created_at:  string;
}

interface MetricsRow {
  latency_ms:  number;
  tokens_in:   number | null;
  tokens_out:  number | null;
  metadata:    Record<string, unknown> | null;
}

async function handler(_req: NextRequest): Promise<NextResponse> {
  const now       = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const { data: projects } = await supabaseAdmin
    .from("projects")
    .select("id");

  if (!projects || projects.length === 0) {
    return NextResponse.json({ scored: 0, reverted: 0 });
  }

  let totalScored   = 0;
  let totalReverted = 0;

  for (const project of projects) {
    const { data: prompts } = await supabaseAdmin
      .from("prompts")
      .select("id, name, health_score");

    if (!prompts) continue;

    const projectPrompts = prompts.filter(async () => {
      const { data } = await supabaseAdmin
        .from("prompts")
        .select("id")
        .eq("project_id", project.id);
      return data;
    });

    const { data: scopedPrompts } = await supabaseAdmin
      .from("prompts")
      .select("id, name, health_score")
      .eq("project_id", project.id);

    if (!scopedPrompts) continue;

    for (const prompt of scopedPrompts) {
      const { data: calls } = await supabaseAdmin
        .from("llm_calls")
        .select("latency_ms, tokens_in, tokens_out, metadata")
        .eq("project_id", project.id)
        .gte("timestamp", yesterday.toISOString())
        .contains("metadata", { promptName: prompt.name });

      if (!calls || calls.length === 0) continue;

      const typedCalls = calls as MetricsRow[];
      const healthScore = computeHealthScore(typedCalls);

      await supabaseAdmin
        .from("prompts")
        .update({
          health_score:    healthScore,
          last_scored_at:  now.toISOString(),
        })
        .eq("id", prompt.id);

      totalScored++;

      if (healthScore < REVERT_THRESHOLD) {
        const didRevert = await attemptRevert(
          prompt.id,
          prompt.name,
          project.id,
          healthScore,
          now,
        );
        if (didRevert) totalReverted++;
      }
    }
  }

  return NextResponse.json({
    ok:       true,
    scored:   totalScored,
    reverted: totalReverted,
    timestamp: now.toISOString(),
  });
}

function computeHealthScore(calls: MetricsRow[]): number {
  const total = calls.length;

  const errorCount = calls.filter(
    (c) => c.metadata?.anomaly === true || c.metadata?.anomaly === "true",
  ).length;
  const errorRatePct = (errorCount / total) * 100;

  const totalLatency = calls.reduce((sum, c) => sum + (c.latency_ms ?? 0), 0);
  const avgLatencyMs = totalLatency / total;
  let latencyPenalty = 0;
  if (avgLatencyMs > 3_000) {
    latencyPenalty = Math.min(((avgLatencyMs - 3_000) / 12_000) * 100, 100);
  }

  const tokenSpikes = calls.filter((c) => {
    const total = (c.tokens_in ?? 0) + (c.tokens_out ?? 0);
    return total > 50_000;
  }).length;
  const tokenSpikeRatePct = (tokenSpikes / total) * 100;

  const score =
    100 - errorRatePct * 0.4 - latencyPenalty * 0.3 - tokenSpikeRatePct * 0.3;

  return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
}

async function attemptRevert(
  promptId:    string,
  promptName:  string,
  projectId:   string,
  healthScore: number,
  now:         Date,
): Promise<boolean> {
  const cooldownSince = new Date(now.getTime() - REVERT_COOLDOWN_MS).toISOString();
  const { data: recentReverts } = await supabaseAdmin
    .from("prompt_events")
    .select("id")
    .eq("prompt_id",   promptId)
    .eq("event_type",  "reverted")
    .gte("created_at", cooldownSince)
    .limit(1);

  if (recentReverts && recentReverts.length > 0) return false;

  const { data: versions } = await supabaseAdmin
    .from("prompt_versions")
    .select("id, version, is_deployed, created_at")
    .eq("prompt_id", promptId)
    .order("created_at", { ascending: false });

  if (!versions || versions.length < 2) return false;

  const typedVersions = versions as VersionRow[];
  const deployedIndex = typedVersions.findIndex((v) => v.is_deployed);

  if (deployedIndex === -1) return false;

  const currentVersion  = typedVersions[deployedIndex];
  const previousVersion = typedVersions[deployedIndex + 1];

  if (!previousVersion) return false;

  await supabaseAdmin
    .from("prompt_versions")
    .update({ is_deployed: false })
    .eq("id", currentVersion.id);

  await supabaseAdmin
    .from("prompt_versions")
    .update({ is_deployed: true })
    .eq("id", previousVersion.id);

  await supabaseAdmin.from("prompt_events").insert({
    prompt_id:  promptId,
    event_type: "reverted",
    version_id: previousVersion.id,
    metadata: {
      from_version: currentVersion.version,
      to_version:   previousVersion.version,
      health_score: healthScore,
      reason:       "health_score_below_threshold",
    },
    created_at: now.toISOString(),
  });

  await dispatchPromptRevertWebhook({
    projectId,
    promptId,
    promptName,
    fromVersion: currentVersion.version,
    toVersion:   previousVersion.version,
    healthScore,
    revertedAt:  now.toISOString(),
  });

  console.log(
    `[score-prompts] Auto-reverted "${promptName}": ` +
    `v${currentVersion.version} → v${previousVersion.version} (score: ${healthScore})`,
  );

  return true;
}

export const POST = verifySignatureAppRouter(handler);