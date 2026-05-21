// app/api/ingest/route.ts

import { Redis } from "@upstash/redis";
import type { TracePayload } from "../../../packages/sdk/src/core/types";
import { NextRequest, NextResponse } from "next/server";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const QUEUE_KEY = "trace:queue";

export async function POST(req: NextRequest) {
  // ── Auth guard ─────────────────────────────────────────────────────────────
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.INGEST_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
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

  for (const trace of body.traces) {
    if (!trace.callId || !trace.sessionId || !trace.model) {
      return NextResponse.json(
        { ok: false, error: "Malformed trace: missing callId, sessionId, or model" },
        { status: 400 }
      );
    }
  }

  try {
    await Promise.all(
      body.traces.map((trace) =>
        redis.lpush(QUEUE_KEY, JSON.stringify(trace))
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