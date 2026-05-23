// app/api/ingest/route.ts
//
// Ingestion endpoint for the 0xtrace SDK.
//
// v2 Auth change:
//   v1: compared x-api-key header against a hardcoded INGEST_API_KEY env var.
//   v2: hashes the incoming key with SHA-256 and looks it up in the api_keys
//       table. The matching row gives us the project_id, which is attached to
//       every trace before it's pushed to the Redis queue.
//
// This is the only place that resolves API key → project_id.
// Everything downstream (drain-queue cron) reads project_id from the payload.

import { Redis }         from "@upstash/redis";
import { supabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// ── Types ─────────────────────────────────────────────────────────────────────
// Defined locally to avoid the ESM/CJS boundary with the SDK package.

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
  // Injected here — not present in SDK payload
  projectId?:       string;
}

// ── Infrastructure ────────────────────────────────────────────────────────────

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const QUEUE_KEY = "trace:queue";

// ── Key hashing ───────────────────────────────────────────────────────────────

/**
 * Hashes a plaintext API key with SHA-256 using the Web Crypto API.
 * Matches the hashing logic in app/onboarding/actions.ts exactly.
 */
async function hashApiKey(plainKey: string): Promise<string> {
  const encoded  = new TextEncoder().encode(plainKey);
  const hashBuf  = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Key → project lookup ──────────────────────────────────────────────────────

/**
 * Validates an API key and returns the associated project_id.
 * Returns null if the key is invalid, revoked, or not found.
 * Uses supabaseAdmin to bypass RLS — this is an unauthenticated endpoint.
 */
async function resolveProjectId(plainKey: string): Promise<string | null> {
  const keyHash = await hashApiKey(plainKey);

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select("project_id, is_active")
    .eq("key_hash", keyHash)
    .single();

  if (error || !data) return null;

  // Reject revoked keys
  if (data.is_active === false) return null;

  // Optionally update last_used_at — fire-and-forget, don't await
  supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("key_hash", keyHash)
    .then(() => {});

  return data.project_id as string;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth: resolve API key → project_id ────────────────────────────────────
  const rawKey = req.headers.get("x-api-key");

  if (!rawKey) {
    return NextResponse.json(
      { ok: false, error: "Missing x-api-key header" },
      { status: 401 }
    );
  }

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
  // Each trace gets the project_id from the validated API key.
  // The drain-queue cron reads this field to scope inserts correctly.
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

  return NextResponse.json({ ok: true, queued: body.traces.length });
}