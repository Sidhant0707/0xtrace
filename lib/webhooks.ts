// lib/webhooks.ts

import { supabaseAdmin } from "@/lib/supabase";

export type WebhookTrigger =
  | "explicit"
  | "high_latency"
  | "token_explosion"
  | "cost_spike"
  | "prompt_reverted";

export type WebhookProvider = "slack" | "discord" | "generic";

export interface WebhookConfig {
  id:         string;
  project_id: string;
  name:       string;
  url:        string;
  provider:   WebhookProvider;
  triggers:   WebhookTrigger[];
  is_active:  boolean;
}

export interface AnomalyEvent {
  type:        WebhookTrigger;
  severity:    "critical" | "warning";
  projectId:   string;
  sessionId:   string;
  description: string;
  detectedAt:  string;
  meta:        Record<string, unknown>;
}

export interface PromptRevertEvent {
  projectId:       string;
  promptId:        string;
  promptName:      string;
  fromVersion:     string;
  toVersion:       string;
  healthScore:     number;
  revertedAt:      string;
}

interface TracePayload {
  callId:           string;
  sessionId:        string;
  stepIndex:        number;
  timestamp:        string;
  model:            string;
  tokensIn?:        number;
  latencyMs:        number;
  estimatedCostUsd: number;
  metadata?:        Record<string, unknown>;
  projectId:        string;
}

const HIGH_LATENCY_MS       = 10_000;
const TOKEN_EXPLOSION_LIMIT = 50_000;
const COST_SPIKE_USD        = 0.10;

export function detectAnomalies(traces: TracePayload[]): AnomalyEvent[] {
  const events: AnomalyEvent[] = [];

  for (const t of traces) {
    if (t.metadata?.anomaly === true || t.metadata?.anomaly === "true") {
      events.push({
        type:        "explicit",
        severity:    "critical",
        projectId:   t.projectId,
        sessionId:   t.sessionId,
        description: t.metadata.anomaly_reason
          ? String(t.metadata.anomaly_reason)
          : `Step ${t.stepIndex} flagged by the tracer SDK.`,
        detectedAt:  t.timestamp,
        meta:        { model: t.model, stepIndex: t.stepIndex, callId: t.callId },
      });
    }

    if (t.latencyMs >= HIGH_LATENCY_MS) {
      events.push({
        type:        "high_latency",
        severity:    t.latencyMs >= 20_000 ? "critical" : "warning",
        projectId:   t.projectId,
        sessionId:   t.sessionId,
        description: `Step ${t.stepIndex} took ${(t.latencyMs / 1000).toFixed(2)}s on model ${t.model}.`,
        detectedAt:  t.timestamp,
        meta:        { latencyMs: t.latencyMs, model: t.model, callId: t.callId },
      });
    }

    if ((t.tokensIn ?? 0) >= TOKEN_EXPLOSION_LIMIT) {
      events.push({
        type:        "token_explosion",
        severity:    (t.tokensIn ?? 0) >= 100_000 ? "critical" : "warning",
        projectId:   t.projectId,
        sessionId:   t.sessionId,
        description: `Step ${t.stepIndex} sent ${t.tokensIn?.toLocaleString()} input tokens — context window near limit.`,
        detectedAt:  t.timestamp,
        meta:        { tokensIn: t.tokensIn, model: t.model, callId: t.callId },
      });
    }

    if (t.estimatedCostUsd >= COST_SPIKE_USD) {
      events.push({
        type:        "cost_spike",
        severity:    t.estimatedCostUsd >= 0.50 ? "critical" : "warning",
        projectId:   t.projectId,
        sessionId:   t.sessionId,
        description: `Single call cost $${t.estimatedCostUsd.toFixed(4)} on model ${t.model}.`,
        detectedAt:  t.timestamp,
        meta:        { costUsd: t.estimatedCostUsd, model: t.model, callId: t.callId },
      });
    }
  }

  return events;
}

const SEVERITY_EMOJI: Record<string, string> = {
  critical: "🔴",
  warning:  "🟡",
};

function formatSlackPayload(event: AnomalyEvent): Record<string, unknown> {
  const emoji = SEVERITY_EMOJI[event.severity] ?? "⚠️";
  return {
    text: `${emoji} *0xtrace · ${event.type.replace(/_/g, " ")}*`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `${emoji} *0xtrace Alert: ${event.type.replace(/_/g, " ")}*`,
            `*Severity:* ${event.severity}`,
            `*Session:* \`${event.sessionId}\``,
            `*Detail:* ${event.description}`,
          ].join("\n"),
        },
      },
    ],
  };
}

function formatDiscordPayload(event: AnomalyEvent): Record<string, unknown> {
  const color = event.severity === "critical" ? 0xff4444 : 0xf5a623;
  return {
    embeds: [
      {
        title:       `0xtrace · ${event.type.replace(/_/g, " ")}`,
        description: event.description,
        color,
        fields: [
          { name: "Severity", value: event.severity,   inline: true },
          { name: "Session",  value: event.sessionId,  inline: true },
        ],
        timestamp: event.detectedAt,
      },
    ],
  };
}

function buildPayload(
  provider: WebhookProvider,
  event:    AnomalyEvent,
): Record<string, unknown> {
  if (provider === "slack")   return formatSlackPayload(event);
  if (provider === "discord") return formatDiscordPayload(event);
  return {
    type:        event.type,
    severity:    event.severity,
    projectId:   event.projectId,
    sessionId:   event.sessionId,
    description: event.description,
    detectedAt:  event.detectedAt,
    meta:        event.meta,
  };
}

async function deliverWebhook(
  webhook: WebhookConfig,
  event:   AnomalyEvent,
): Promise<void> {
  const payload = buildPayload(webhook.provider, event);

  let responseCode: number | null        = null;
  let responseBody: string | null        = null;
  let status: "delivered" | "failed"    = "failed";
  let deliveredAt: string | null         = null;

  try {
    const res = await fetch(webhook.url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(8_000),
    });

    responseCode = res.status;
    responseBody = (await res.text()).slice(0, 500);

    if (res.ok) {
      status      = "delivered";
      deliveredAt = new Date().toISOString();
    }
  } catch (err) {
    responseBody = String(err).slice(0, 500);
  }

  await supabaseAdmin.from("webhook_deliveries").insert({
    webhook_id:    webhook.id,
    trigger_type:  event.type,
    payload,
    status,
    response_code: responseCode,
    response_body: responseBody,
    delivered_at:  deliveredAt,
  });
}

export async function dispatchAnomalyWebhooks(
  traces: TracePayload[],
): Promise<void> {
  const projectIds = [...new Set(traces.map((t) => t.projectId))];

  for (const projectId of projectIds) {
    const { data: webhooks } = await supabaseAdmin
      .from("webhook_configs")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_active",  true);

    if (!webhooks || webhooks.length === 0) continue;

    const projectTraces = traces.filter((t) => t.projectId === projectId);
    const anomalies     = detectAnomalies(projectTraces);

    for (const anomaly of anomalies) {
      const matching = (webhooks as WebhookConfig[]).filter((w) =>
        w.triggers.includes(anomaly.type),
      );
      await Promise.allSettled(matching.map((w) => deliverWebhook(w, anomaly)));
    }
  }
}

export async function dispatchPromptRevertWebhook(
  event: PromptRevertEvent,
): Promise<void> {
  const { data: webhooks } = await supabaseAdmin
    .from("webhook_configs")
    .select("*")
    .eq("project_id", event.projectId)
    .eq("is_active",  true);

  if (!webhooks || webhooks.length === 0) return;

  const matching = (webhooks as WebhookConfig[]).filter((w) =>
    w.triggers.includes("prompt_reverted"),
  );

  if (matching.length === 0) return;

  const now = new Date().toISOString();

  await Promise.allSettled(
    matching.map(async (webhook) => {
      const payload = buildRevertPayload(webhook.provider, event);

      let responseCode: number | null     = null;
      let responseBody: string | null     = null;
      let status: "delivered" | "failed" = "failed";
      let deliveredAt: string | null      = null;

      try {
        const res = await fetch(webhook.url, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
          signal:  AbortSignal.timeout(8_000),
        });

        responseCode = res.status;
        responseBody = (await res.text()).slice(0, 500);

        if (res.ok) {
          status      = "delivered";
          deliveredAt = new Date().toISOString();
        }
      } catch (err) {
        responseBody = String(err).slice(0, 500);
      }

      await supabaseAdmin.from("webhook_deliveries").insert({
        webhook_id:    webhook.id,
        trigger_type:  "prompt_reverted",
        payload,
        status,
        response_code: responseCode,
        response_body: responseBody,
        delivered_at:  deliveredAt,
        created_at:    now,
      });
    }),
  );
}

function buildRevertPayload(
  provider: WebhookProvider,
  event:    PromptRevertEvent,
): Record<string, unknown> {
  if (provider === "slack") {
    return {
      text: `🔁 *0xtrace · Prompt Auto-Reverted*`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: [
              `🔁 *0xtrace: Prompt Auto-Reverted*`,
              `*Prompt:* \`${event.promptName}\``,
              `*Rolled back:* v${event.fromVersion} → v${event.toVersion}`,
              `*Health score at revert:* ${event.healthScore.toFixed(1)}`,
            ].join("\n"),
          },
        },
      ],
    };
  }

  if (provider === "discord") {
    return {
      embeds: [
        {
          title:       `0xtrace · Prompt Auto-Reverted`,
          description: `Prompt \`${event.promptName}\` was automatically rolled back due to health degradation.`,
          color:       0xf5a623,
          fields: [
            { name: "From Version", value: `v${event.fromVersion}`, inline: true },
            { name: "To Version",   value: `v${event.toVersion}`,   inline: true },
            { name: "Health Score", value: event.healthScore.toFixed(1), inline: true },
          ],
          timestamp: event.revertedAt,
        },
      ],
    };
  }

  return {
    type:        "prompt_reverted",
    projectId:   event.projectId,
    promptId:    event.promptId,
    promptName:  event.promptName,
    fromVersion: event.fromVersion,
    toVersion:   event.toVersion,
    healthScore: event.healthScore,
    revertedAt:  event.revertedAt,
  };
}