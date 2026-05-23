// app/api/cron/drain-queue/route.ts
//
// Drains the Redis ingest queue into Supabase in atomic batches.
// Invoked by Vercel Cron — protected by CRON_SECRET.
//
// v2 change: every row now includes project_id, read from the payload.
// The ingest endpoint injects project_id at queue time after validating
// the API key, so drain-queue trusts it unconditionally.
// Traces with no project_id are skipped and logged — they are orphaned
// v1 payloads that arrived before the migration.

import { Redis }              from "@upstash/redis";
import { supabaseAdmin }      from "@/lib/supabase";
import { computeMessageDiff } from "@/lib/diff";
import { calcCostUsd }        from "@/lib/cost";

// ── Runtime config ────────────────────────────────────────────────────────────

export const maxDuration = 60;
export const dynamic     = "force-dynamic";

// ── Constants ─────────────────────────────────────────────────────────────────

const QUEUE_KEY  = "trace:queue";
const BATCH_SIZE = 100;

// ── Redis client ──────────────────────────────────────────────────────────────

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role:    "system" | "user" | "assistant" | "tool" | "function";
  content: string | null;
  name?:   string;
}

export interface TracePayload {
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
  // Injected by the ingest endpoint after API key validation
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
      console.warn("[drain-queue] Unparseable payload skipped:", String(raw).slice(0, 120));
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
      model:    t.model,
      tokensIn:  tokensIn  ?? 0,
      tokensOut: tokensOut ?? 0,
    }),
    is_stream:          t.isStream,
    response:           t.response  ?? null,
    sdk_version:        t.sdkVersion ?? null,
    metadata:           t.metadata  ?? null,
    timestamp:          t.timestamp,
    project_id:         projectId,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── 1. Atomic batch pop ───────────────────────────────────────────────────
  const rawBatch = await redis.lpop<unknown>(QUEUE_KEY, BATCH_SIZE);

  if (!rawBatch) {
    return Response.json({ ok: true, processed: 0, message: "Queue empty" });
  }

  const rawArray: unknown[] = Array.isArray(rawBatch) ? rawBatch : [rawBatch];

  // ── 2. Parse and validate ─────────────────────────────────────────────────
  const allTraces = rawArray
    .map((raw) => parseEntry(raw))
    .filter((t): t is TracePayload => t !== null);

  // ── 3. Filter out orphaned v1 traces (no project_id) ─────────────────────
  const orphaned = allTraces.filter((t) => !t.projectId);
  if (orphaned.length > 0) {
    console.warn(
      `[drain-queue] Skipping ${orphaned.length} orphaned trace(s) with no project_id.`
    );
  }

  const traces = allTraces.filter((t): t is TracePayload & { projectId: string } =>
    typeof t.projectId === "string" && t.projectId.length > 0
  );

  if (traces.length === 0) {
    return Response.json({
      ok:        true,
      processed: 0,
      message:   "No valid project-scoped traces in batch.",
    });
  }

  // ── 4. Insert into llm_calls ──────────────────────────────────────────────
  const llmCallRows: LlmCallRow[] = traces.map((t) =>
    toLlmCallRow(t, t.projectId)
  );

  const { error: llmError } = await supabaseAdmin
    .from("llm_calls")
    .insert(llmCallRows);

  if (llmError) {
    console.error("[drain-queue] llm_calls insert failed:", llmError.message);
    return Response.json({ ok: false, error: llmError.message }, { status: 500 });
  }

  // ── 5. Build prompt cache for within-batch diffs ──────────────────────────
  const promptCache = new Map<string, ChatMessage[]>();
  for (const trace of traces) {
    promptCache.set(
      `${trace.sessionId}:${trace.stepIndex}`,
      [...trace.prompt] as ChatMessage[],
    );
  }

  // ── 6. Sort by session + step for correct diff ordering ───────────────────
  const sorted = [...traces].sort(
    (a, b) =>
      a.sessionId.localeCompare(b.sessionId) || a.stepIndex - b.stepIndex,
  );

  // ── 7. Build snapshot rows with diff-only logic ───────────────────────────
  const snapshotRows: SnapshotRow[] = [];

  for (const trace of sorted) {
    const projectId = trace.projectId;

    if (trace.stepIndex === 1) {
      snapshotRows.push({
        call_id:            trace.callId,
        session_id:         trace.sessionId,
        step_index:         trace.stepIndex,
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
          [...trace.prompt] as ChatMessage[],
        ),
        project_id:         projectId,
      });
    } else {
      console.warn(
        `[drain-queue] prev snapshot not found — ` +
        `session=${trace.sessionId} step=${trace.stepIndex - 1}. ` +
        `Storing full snapshot as fallback.`
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

  // ── 8. Bulk insert snapshot rows ──────────────────────────────────────────
  if (snapshotRows.length > 0) {
    const { error: snapError } = await supabaseAdmin
      .from("prompt_snapshots")
      .insert(snapshotRows);

    if (snapError) {
      console.error("[drain-queue] prompt_snapshots insert failed:", snapError.message);
      return Response.json({ ok: false, error: snapError.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true, processed: traces.length });
}