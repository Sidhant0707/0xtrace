// app/api/replay/route.ts
//
// Replay Engine API — Secure, zero-dependency streaming proxy.
//
// Architecture:
//   1. Strict Auth: Validates the Supabase session before proxying.
//   2. Smart Routing: Intercepts the requested model string and dynamically
//      switches the Base URL and API key (e.g., routing llama-* to Groq
//      and gpt-* to OpenAI) under the hood using the same OpenAI client.
//   3. Text-Only Web Stream: Instead of piping the raw Server-Sent Events (SSE)
//      JSON payload to the client, this route extracts the delta text and
//      yields a clean, raw UTF-8 stream. This allows the frontend to consume
//      the stream natively without heavy libraries like ai or eventsource-parser.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
try {
// ── 1. Strict Authentication ──────────────────────────────────────────────
const cookieStore = await cookies();
const supabase = createServerClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
{
cookies: {
getAll() {
return cookieStore.getAll();
},
setAll() {}, // Read-only in route handlers
},
},
);

const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
}

// ── 2. Payload Validation ─────────────────────────────────────────────────
const body = await req.json();
const { messages, model, temperature = 0.7, max_tokens } = body;

if (!messages || !Array.isArray(messages) || !model) {
  return NextResponse.json(
    { error: "Invalid payload. 'messages' array and 'model' string required." },
    { status: 400 },
  );
}

// ── 3. Smart Provider Routing ─────────────────────────────────────────────
let apiKey = process.env.OPENAI_API_KEY;
let baseURL = "[https://api.openai.com/v1](https://api.openai.com/v1)";

const isGroq =
  model.startsWith("llama") ||
  model.startsWith("mixtral") ||
  model.startsWith("gemma");

if (isGroq) {
  apiKey = process.env.GROQ_API_KEY;
  baseURL = "[https://api.groq.com/openai/v1](https://api.groq.com/openai/v1)";
}

if (!apiKey) {
  return NextResponse.json(
    { error: `Missing environment variable for model family: ${model}` },
    { status: 500 },
  );
}

// ── 4. Execute Native Stream ──────────────────────────────────────────────
const openai = new OpenAI({ apiKey, baseURL });

const stream = await openai.chat.completions.create({
  model,
  messages,
  temperature,
  max_tokens,
  stream: true,
});

// ── 5. Transform to Raw Text Stream ───────────────────────────────────────
// Strips the JSON overhead so the frontend receives pure text chunks.
const encoder = new TextEncoder();
const readableStream = new ReadableStream({
  async start(controller) {
    try {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) {
          controller.enqueue(encoder.encode(text));
        }
      }
    } catch (err) {
      controller.error(err);
    } finally {
      controller.close();
    }
  },
});

return new Response(readableStream, {
  headers: {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  },
});
  } catch (error: unknown) {
    console.error("[ReplayEngine] Proxy error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
);
}
}


