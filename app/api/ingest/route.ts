// app/api/ingest/route.ts

import { Redis }                      from "@upstash/redis";
import { Ratelimit }                  from "@upstash/ratelimit";
import { supabaseAdmin }              from "@/lib/supabase";
import { NextRequest, NextResponse }  from "next/server";

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

// ── Infrastructure ────────────────────────────────────────────────────────────
// Single Redis client shared by both the rate limiter and the queue writer.
// Module-scope so it is reused across requests within the same worker lifetime.

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const QUEUE_KEY = "trace:queue";

// ── Rate limiter ──────────────────────────────────────────────────────────────
// Sliding window prevents the fixed-window burst edge case where an agent
// could fire 200 requests across a window boundary in under 2 seconds.
// 100 req / 60 s per API key. A healthy agent rarely exceeds 1 req/s.

const ratelimit = new Ratelimit({
  redis,
  limiter:   Ratelimit.slidingWindow(100, "60 s"),
  prefix:    "oxtr_ingest",
  analytics: true,
});

// ── Key hashing ───────────────────────────────────────────────────────────────

async function hashApiKey(plainKey: string): Promise<string> {
  const encoded = new TextEncoder().encode(plainKey);
  const hashBuf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Key → project lookup ──────────────────────────────────────────────────────

async function resolveProjectId(plainKey: string): Promise<string | null> {
  const keyHash = await hashApiKey(plainKey);

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select("project_id, is_active")
    .eq("key_hash", keyHash)
    .single();

  if (error || !data) return null;
  if (data.is_active === false) return null;

  supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("key_hash", keyHash)
    .then(() => {});

  return data.project_id as string;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawKey = req.headers.get("x-api-key");

  if (!rawKey) {
    return NextResponse.json(
      { ok: false, error: "Missing x-api-key header" },
      { status: 401 }
    );
  }

  // ── Rate limit (checked before auth to also throttle invalid key probes) ──
  const { success, limit, remaining, reset } = await ratelimit.limit(rawKey);

  if (!success) {
    return NextResponse.json(
      {
        ok:      false,
        error:   "Rate limit exceeded. Maximum 100 requests per 60 seconds.",
        limit,
        remaining,
        resetAt: new Date(reset).toISOString(),
      },
      {
        status:  429,
        headers: {
          "X-RateLimit-Limit":     String(limit),
          "X-RateLimit-Remaining": String(remaining),
          "X-RateLimit-Reset":     String(reset),
          "Retry-After":           "60",
        },
      }
    );
  }

  // ── Auth: resolve API key → project_id ────────────────────────────────────
  const projectId = await resolveProjectId(rawKey);

  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: "Invalid or revoked API key" },
      { status: 401 }
    );
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: { traces: TracePayload[] };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!Array.isArray(body?.traces) || body.traces.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Body must contain a non-empty traces array" },
      { status: 400 }
    );
  }

  // ── Validate individual traces ─────────────────────────────────────────────
  for (const trace of body.traces) {
    if (!trace.callId || !trace.sessionId || !trace.model) {
      return NextResponse.json(
        { ok: false, error: "Malformed trace: missing callId, sessionId, or model" },
        { status: 400 }
      );
    }
  }

  // ── Inject project_id and push to queue ───────────────────────────────────
  try {
    await Promise.all(
      body.traces.map((trace) =>
        redis.lpush(
          QUEUE_KEY,
          JSON.stringify({ ...trace, projectId })
        )
      )
    );
  } catch (err) {
    console.error("[0xtrace/ingest] Redis push failed:", err);
    return NextResponse.json(
      { ok: false, error: "Queue unavailable" },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, queued: body.traces.length, remaining });
}