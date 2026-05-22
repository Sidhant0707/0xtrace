// app/api/cron/drain-queue/route.ts
//
// Drains the Redis ingest queue into Supabase in atomic batches.
// Invoked by Vercel Cron — protected by CRON_SECRET.
//
// Two-table write per batch:
//   llm_calls        — one row per trace (cost, tokens, latency, model)
//   prompt_snapshots — diff-only storage:
//                      step 1  → full_snapshot
//                      step N  → diff_from_previous (computed here)
//
// Diff lookup order:
//   1. In-memory cache (same batch — zero DB round-trips)
//   2. prompt_snapshots table (previous batch)
//   3. Graceful fallback: store full snapshot if prev not found

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
//
// FIX 1: Removed cross-package import:
//   import type { TracePayload, ChatMessage } from "@/packages/sdk/src/core/types"
//
// Root cause: The SDK uses "type": "module" (ESM) but Next.js compiles
// server routes as CJS by default. Importing across the boundary causes
// the "module format mismatch" error we fixed earlier.
//
// Fix: Define the types we actually need locally. They mirror the SDK
// exactly — if you change the SDK's TracePayload, update this too.

export interface ChatMessage {
  role:     "system" | "user" | "assistant" | "tool" | "function";
  content:  string | null;
  name?:    string;
}

// FIX 2: TracePayload.metadata was missing from the SDK's interface.
// The SDK's tracer.ts spreads metadata onto the payload but the interface
// never declared it, so TypeScript didn't know it existed.
// We define it explicitly here so the drain-queue can read it safely.

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
  // explicitly typed — was missing from SDK interface
  metadata?:        Record<string, unknown>;
}

// DB row shapes

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
}

interface SnapshotRow {
  call_id:            string;
  session_id:         string;
  step_index:         number;
  full_snapshot:      ChatMessage[] | null;
  diff_from_previous: ReturnType<typeof computeMessageDiff> | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseEntry(raw: unknown): TracePayload | null {
  // FIX 3: Upstash lpop may return already-parsed objects or raw JSON strings
  // depending on SDK version and how the payload was pushed. Handle both.
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

function toLlmCallRow(t: TracePayload): LlmCallRow {
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
    // Recalculate cost server-side — single source of truth
    // Overrides whatever the SDK sent, uses our MODEL_PRICES table
    estimated_cost_usd: calcCostUsd({
      model:     t.model,
      tokensIn:  tokensIn  ?? 0,
      tokensOut: tokensOut ?? 0,
    }),
    is_stream:          t.isStream,
    response:           t.response   ?? null,
    sdk_version:        t.sdkVersion ?? null,
    // FIX 4: t.metadata was previously typed as never because TracePayload
    // didn't declare it. Now that we've added metadata? to our local
    // TracePayload type above, this compiles correctly.
    metadata:           t.metadata   ?? null,
    timestamp:          t.timestamp,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── 1. Atomic batch pop ──────────────────────────────────────────────────
  // FIX 5: Original code used lrange + ltrim which has a race condition —
  // if two cron ticks overlap, both read the same items before either trims.
  //
  // lpop with count is a single atomic command with no race window.
  //
  // Upstash type: lpop<T>(key, count) → Promise<T[] | null>
  // The generic T is the element type, not the array type.
  const rawBatch = await redis.lpop<unknown>(QUEUE_KEY, BATCH_SIZE);

  // FIX 6: Upstash returns null (not an empty array) when the queue is empty,
  // and returns a single item (not an array) when count=1 with one item.
  // Normalise both edge cases.
  if (!rawBatch) {
    return Response.json({ ok: true, processed: 0, message: "Queue empty" });
  }

  const rawArray: unknown[] = Array.isArray(rawBatch) ? rawBatch : [rawBatch];

  // ── 2. Parse — skip corrupted entries, continue with the rest ────────────
  const traces = rawArray
    .map((raw) => parseEntry(raw))
    .filter((t): t is TracePayload => t !== null);

  if (traces.length === 0) {
    return Response.json({
      ok:        true,
      processed: 0,
      message:   "All entries in batch were unparseable — skipped.",
    });
  }

  // ── 3. Insert into llm_calls ─────────────────────────────────────────────
  const llmCallRows: LlmCallRow[] = traces.map(toLlmCallRow);

  const { error: llmError } = await supabaseAdmin
    .from("llm_calls")
    .insert(llmCallRows);

  if (llmError) {
    console.error("[drain-queue] llm_calls insert failed:", llmError.message);
    return Response.json({ ok: false, error: llmError.message }, { status: 500 });
  }

  // ── 4. Build in-memory prompt cache for within-batch diff ────────────────
  const promptCache = new Map<string, ChatMessage[]>();
  for (const trace of traces) {
    promptCache.set(
      `${trace.sessionId}:${trace.stepIndex}`,
      // FIX 7: trace.prompt is readonly ChatMessage[] — spread it to get a
      // mutable copy so downstream code can safely mutate if needed.
      [...trace.prompt] as ChatMessage[],
    );
  }

  // ── 5. Sort by session + step ─────────────────────────────────────────────
  const sorted = [...traces].sort(
    (a, b) =>
      a.sessionId.localeCompare(b.sessionId) || a.stepIndex - b.stepIndex,
  );

  // ── 6. Build snapshot rows with diff-only logic ───────────────────────────
  const snapshotRows: SnapshotRow[] = [];

  for (const trace of sorted) {
    if (trace.stepIndex === 1) {
      snapshotRows.push({
        call_id:            trace.callId,
        session_id:         trace.sessionId,
        step_index:         trace.stepIndex,
        full_snapshot:      [...trace.prompt] as ChatMessage[],
        diff_from_previous: null,
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
      });
    } else {
      console.warn(
        `[drain-queue] prev snapshot not found — ` +
        `session=${trace.sessionId} step=${trace.stepIndex - 1}. ` +
        `Storing full snapshot as fallback.`,
      );
      snapshotRows.push({
        call_id:            trace.callId,
        session_id:         trace.sessionId,
        step_index:         trace.stepIndex,
        full_snapshot:      [...trace.prompt] as ChatMessage[],
        diff_from_previous: null,
      });
    }
  }

  // ── 7. Bulk insert snapshot rows ──────────────────────────────────────────
  if (snapshotRows.length > 0) {
    const { error: snapError } = await supabaseAdmin
      .from("prompt_snapshots")
      .insert(snapshotRows);

    if (snapError) {
      console.error("[drain-queue] prompt_snapshots insert failed:", snapError.message);
      // llm_calls rows already committed.
      // Dashboard degrades gracefully — session detail works,
      // diff viewer shows empty state.
      return Response.json({ ok: false, error: snapError.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true, processed: traces.length });
}