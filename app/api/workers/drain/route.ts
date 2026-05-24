// app/api/workers/drain/route.ts

import { verifySignatureAppRouter }  from "@upstash/qstash/nextjs";
import { Redis }                     from "@upstash/redis";
import { supabaseAdmin }             from "@/lib/supabase";
import { computeMessageDiff }        from "@/lib/diff";
import { calcCostUsd }               from "@/lib/cost";
import { chunkedInsert }             from "@/lib/db";
import { dispatchAnomalyWebhooks }   from "@/lib/webhooks";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic     = "force-dynamic";

const QUEUE_KEY  = "trace:queue";
const BATCH_SIZE = 200;

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role:    "system" | "user" | "assistant" | "tool" | "function";
  content: string | null;
  name?:   string;
}

interface TracePayload {
  callId:           string;
  sessionId:        string;
  stepIndex:        number;
  timestamp:        string;
  model:            string;
  prompt:           ChatMessage[] | readonly ChatMessage[];
  response:         string;
  tokensIn:         number | undefined;
  tokensOut:        number | undefined;
  latencyMs:        number;
  isStream:         boolean;
  estimatedCostUsd: number;
  sdkVersion:       string;
  metadata?:        Record<string, unknown>;
  projectId?:       string;
}

interface LlmCallRow {
  call_id:            string;
  session_id:         string;
  step_index:         number;
  model:              string;
  tokens_in:          number | null;
  tokens_out:         number | null;
  latency_ms:         number;
  estimated_cost_usd: number;
  is_stream:          boolean;
  response:           string | null;
  sdk_version:        string | null;
  metadata:           Record<string, unknown> | null;
  timestamp:          string;
  project_id:         string;
}

interface SnapshotRow {
  call_id:            string;
  session_id:         string;
  step_index:         number;
  full_snapshot:      ChatMessage[] | null;
  diff_from_previous: ReturnType<typeof computeMessageDiff> | null;
  project_id:         string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseEntry(raw: unknown): TracePayload | null {
  if (raw !== null && typeof raw === "object") return raw as TracePayload;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as TracePayload;
    } catch {
      console.warn("[workers/drain] Unparseable payload skipped:", String(raw).slice(0, 120));
      return null;
    }
  }
  return null;
}

function toLlmCallRow(t: TracePayload, projectId: string): LlmCallRow {
  const tokensIn  = t.tokensIn  ?? null;
  const tokensOut = t.tokensOut ?? null;

  return {
    call_id:            t.callId,
    session_id:         t.sessionId,
    step_index:         t.stepIndex,
    model:              t.model,
    tokens_in:          tokensIn,
    tokens_out:         tokensOut,
    latency_ms:         t.latencyMs,
    estimated_cost_usd: calcCostUsd({
      model:     t.model,
      tokensIn:  tokensIn  ?? 0,
      tokensOut: tokensOut ?? 0,
    }),
    is_stream:   t.isStream,
    response:    t.response   ?? null,
    sdk_version: t.sdkVersion ?? null,
    metadata:    t.metadata   ?? null,
    timestamp:   t.timestamp,
    project_id:  projectId,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
// verifySignatureAppRouter wraps the handler and rejects any POST that does
// not carry a valid QStash HMAC signature — the route cannot be triggered
// publicly even if its URL is known.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handler(_req: NextRequest): Promise<NextResponse> {
  // ── 1. Atomic batch pop ───────────────────────────────────────────────────
  const rawBatch = await redis.lpop<unknown>(QUEUE_KEY, BATCH_SIZE);

  if (!rawBatch) {
    return NextResponse.json({ ok: true, processed: 0, message: "Queue empty" });
  }

  const rawArray: unknown[] = Array.isArray(rawBatch) ? rawBatch : [rawBatch];

  // ── 2. Parse ──────────────────────────────────────────────────────────────
  const allTraces = rawArray
    .map(parseEntry)
    .filter((t): t is TracePayload => t !== null);

  // ── 3. Drop orphaned traces (no project_id) ───────────────────────────────
  const orphaned = allTraces.filter((t) => !t.projectId);
  if (orphaned.length > 0) {
    console.warn(`[workers/drain] Skipping ${orphaned.length} orphaned trace(s).`);
  }

  const traces = allTraces.filter(
    (t): t is TracePayload & { projectId: string } =>
      typeof t.projectId === "string" && t.projectId.length > 0
  );

  if (traces.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: "No valid traces." });
  }

  // ── 4. Insert llm_calls ───────────────────────────────────────────────────
  const llmCallRows = traces.map((t) => toLlmCallRow(t, t.projectId));

  try {
    await chunkedInsert("llm_calls", llmCallRows);
  } catch (err) {
    console.error("[workers/drain] llm_calls insert failed:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }

  // ── 5. Build within-batch prompt cache ───────────────────────────────────
  const promptCache = new Map<string, ChatMessage[]>();
  for (const trace of traces) {
    promptCache.set(
      `${trace.sessionId}:${trace.stepIndex}`,
      [...trace.prompt] as ChatMessage[]
    );
  }

  // ── 6. Sort by session + step ─────────────────────────────────────────────
  const sorted = [...traces].sort(
    (a, b) => a.sessionId.localeCompare(b.sessionId) || a.stepIndex - b.stepIndex
  );

  // ── 7. Build snapshot rows ────────────────────────────────────────────────
  const snapshotRows: SnapshotRow[] = [];

  for (const trace of sorted) {
    const projectId = trace.projectId;

    if (trace.stepIndex === 1) {
      snapshotRows.push({
        call_id:            trace.callId,
        session_id:         trace.sessionId,
        step_index:         1,
        full_snapshot:      [...trace.prompt] as ChatMessage[],
        diff_from_previous: null,
        project_id:         projectId,
      });
      continue;
    }

    const prevKey    = `${trace.sessionId}:${trace.stepIndex - 1}`;
    let prevMessages = promptCache.get(prevKey);

    if (!prevMessages) {
      const { data } = await supabaseAdmin
        .from("prompt_snapshots")
        .select("full_snapshot")
        .eq("session_id", trace.sessionId)
        .eq("step_index", trace.stepIndex - 1)
        .eq("project_id", projectId)
        .single();

      if (data?.full_snapshot) {
        prevMessages = data.full_snapshot as ChatMessage[];
      }
    }

    if (prevMessages) {
      snapshotRows.push({
        call_id:            trace.callId,
        session_id:         trace.sessionId,
        step_index:         trace.stepIndex,
        full_snapshot:      null,
        diff_from_previous: computeMessageDiff(
          prevMessages,
          [...trace.prompt] as ChatMessage[]
        ),
        project_id: projectId,
      });
    } else {
      console.warn(
        `[workers/drain] prev snapshot not found — ` +
        `session=${trace.sessionId} step=${trace.stepIndex - 1}. Fallback to full snapshot.`
      );
      snapshotRows.push({
        call_id:            trace.callId,
        session_id:         trace.sessionId,
        step_index:         trace.stepIndex,
        full_snapshot:      [...trace.prompt] as ChatMessage[],
        diff_from_previous: null,
        project_id:         projectId,
      });
    }
  }

  // ── 8. Insert prompt_snapshots ────────────────────────────────────────────
  if (snapshotRows.length > 0) {
    try {
      await chunkedInsert("prompt_snapshots", snapshotRows);
    } catch (err) {
      console.error("[workers/drain] prompt_snapshots insert failed:", err);
      return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
    }
  }

  await dispatchAnomalyWebhooks(traces);

  return NextResponse.json({ ok: true, processed: traces.length });
}

export const POST = verifySignatureAppRouter(handler);