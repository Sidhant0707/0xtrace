// app/api/cron/drain-queue/route.ts
import { Redis } from "@upstash/redis";
import { supabaseAdmin } from "../../../../lib/supabase";
import { computeMessageDiff } from "../../../../lib/diff";
import type { TracePayload, ChatMessage } from "../../../../packages/sdk/src/core/types";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const QUEUE_KEY = "trace:queue";
const BATCH_SIZE = 100;

// Required for Next.js — prevents static caching of this route
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // ── Auth: only Vercel cron or manual trigger with secret ─────────────────
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── 1. Pop up to BATCH_SIZE items from Redis queue ────────────────────────
  const raw = await redis.lrange(QUEUE_KEY, 0, BATCH_SIZE - 1);

  if (raw.length === 0) {
    return Response.json({ ok: true, processed: 0, message: "Queue empty" });
  }

  // Atomically remove the items we just read
  await redis.ltrim(QUEUE_KEY, raw.length, -1);

  const traces: TracePayload[] = raw.map((item) =>
    typeof item === "string" ? JSON.parse(item) : item
  );

  // ── 2. Bulk insert into llm_calls ─────────────────────────────────────────
  // Prompt data is NOT stored here — lives in prompt_snapshots only.
  const llmCallRows = traces.map((t) => ({
    call_id:            t.callId,
    session_id:         t.sessionId,
    step_index:         t.stepIndex,
    model:              t.model,
    tokens_in:          t.tokensIn   ?? null,
    tokens_out:         t.tokensOut  ?? null,
    latency_ms:         t.latencyMs,
    estimated_cost_usd: t.estimatedCostUsd,
    is_stream:          t.isStream,
    response:           t.response,
    sdk_version:        t.sdkVersion,
    metadata:           (t as TracePayload & { metadata?: Record<string, unknown> }).metadata ?? null,
    timestamp:          t.timestamp,
  }));

  const { error: llmError } = await supabaseAdmin
    .from("llm_calls")
    .insert(llmCallRows);

  if (llmError) {
    console.error("[drain-queue] llm_calls insert failed:", llmError);
    return Response.json(
      { ok: false, error: llmError.message },
      { status: 500 }
    );
  }

  // ── 3. Build in-memory prompt cache for within-batch diff computation ─────
  // Key: `${sessionId}:${stepIndex}` → full ChatMessage[]
  // This avoids DB round-trips when steps arrive in the same batch.
  const promptCache = new Map<string, ChatMessage[]>();
  for (const trace of traces) {
    promptCache.set(
      `${trace.sessionId}:${trace.stepIndex}`,
      trace.prompt as ChatMessage[]
    );
  }

  // ── 4. Sort by session + step so step 1 is always processed before step N ─
  const sorted = [...traces].sort(
    (a, b) =>
      a.sessionId.localeCompare(b.sessionId) || a.stepIndex - b.stepIndex
  );

  // ── 5. Build prompt_snapshots rows with diff-only logic ───────────────────
  const snapshotRows: object[] = [];

  for (const trace of sorted) {
    if (trace.stepIndex === 1) {
      // ── Step 1: store full snapshot ──────────────────────────────────────
      snapshotRows.push({
        call_id:            trace.callId,
        session_id:         trace.sessionId,
        step_index:         trace.stepIndex,
        full_snapshot:      trace.prompt,
        diff_from_previous: null,
      });
    } else {
      // ── Step N: compute diff against previous step ───────────────────────

      // First: check in-memory cache (same batch)
      const prevKey = `${trace.sessionId}:${trace.stepIndex - 1}`;
      let prevMessages = promptCache.get(prevKey);

      // Second: query DB if not in batch
      if (!prevMessages) {
        const { data } = await supabaseAdmin
          .from("prompt_snapshots")
          .select("full_snapshot")
          .eq("session_id", trace.sessionId)
          .eq("step_index", trace.stepIndex - 1)
          .single();

        if (data?.full_snapshot) {
          prevMessages = data.full_snapshot as ChatMessage[];
        }
      }

      if (prevMessages) {
        const diff = computeMessageDiff(
          prevMessages,
          trace.prompt as ChatMessage[]
        );
        snapshotRows.push({
          call_id:            trace.callId,
          session_id:         trace.sessionId,
          step_index:         trace.stepIndex,
          full_snapshot:      null,
          diff_from_previous: diff,
        });
      } else {
        // ── Graceful fallback: store full snapshot if prev not found ─────
        // Rare — only happens when previous batch failed mid-write.
        console.warn(
          `[drain-queue] prev snapshot not found for session=${trace.sessionId} ` +
          `step=${trace.stepIndex - 1}. Storing full snapshot as fallback.`
        );
        snapshotRows.push({
          call_id:            trace.callId,
          session_id:         trace.sessionId,
          step_index:         trace.stepIndex,
          full_snapshot:      trace.prompt,
          diff_from_previous: null,
        });
      }
    }
  }

  // ── 6. Bulk insert all snapshot rows ──────────────────────────────────────
  const { error: snapError } = await supabaseAdmin
    .from("prompt_snapshots")
    .insert(snapshotRows);

  if (snapError) {
    console.error("[drain-queue] prompt_snapshots insert failed:", snapError);
    return Response.json(
      { ok: false, error: snapError.message },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, processed: traces.length });
}