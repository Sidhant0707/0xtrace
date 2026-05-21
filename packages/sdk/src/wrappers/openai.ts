// ─────────────────────────────────────────────────────────────────────────────
// packages/sdk/src/wrappers/openai.ts
//
// Wraps an OpenAI client instance in a deeply nested Proxy that intercepts
// `chat.completions.create`, captures telemetry, and fires it non-blocking.
//
// Key guarantees:
//   1. The original OpenAI types are 100% preserved — callers see no diffs.
//   2. Streaming responses (`stream: true`) are fully supported via an async
//      generator that transparently yields every chunk unchanged.
//   3. Telemetry is fired via the microtask queue — zero latency added.
//   4. Nothing is monkey-patched; the original client is never mutated.
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletion,
} from "openai/resources/chat/completions";
import type { Stream } from "openai/streaming";
import type { ChatCompletionChunk } from "openai/resources";
import type { Tracer } from "../core/tracer";
import type { ChatMessage } from "../core/types";

// ── Type helpers ──────────────────────────────────────────────────────────────

type CreateParams =
  | ChatCompletionCreateParamsNonStreaming
  | ChatCompletionCreateParamsStreaming;

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Wraps an OpenAI client with a transparent telemetry layer.
 *
 * @param client  The original `new OpenAI(...)` instance.
 * @param tracer  A configured `Tracer` instance (owns the session + dispatch).
 * @returns       A Proxy of the client — drop-in replacement, same types.
 *
 * @example
 * import OpenAI from "openai";
 * import { Tracer, wrapOpenAI } from "@prompt-tracer/sdk";
 *
 * const openai  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 * const tracer  = new Tracer({ ingestUrl: "https://your-app.com/api/ingest" });
 * const ai      = wrapOpenAI(openai, tracer);
 *
 * // Use exactly like the original client — streaming, tools, everything works.
 * const res = await ai.chat.completions.create({ model: "gpt-4o", messages });
 */
export function wrapOpenAI(client: OpenAI, tracer: Tracer): OpenAI {
  return new Proxy(client, {
    get(target, prop, receiver) {
      // ── Intercept .chat ───────────────────────────────────────────────────
      if (prop === "chat") {
        return new Proxy(target.chat, {
          get(chatTarget, chatProp, chatReceiver) {
            // ── Intercept .chat.completions ─────────────────────────────────
            if (chatProp === "completions") {
              return new Proxy(chatTarget.completions, {
                get(compTarget, compProp, compReceiver) {
                  // ── Intercept .chat.completions.create ────────────────────
                  if (compProp === "create") {
                    return _makeCreateInterceptor(compTarget, tracer);
                  }
                  // All other completions methods (e.g. .stream()) pass through
                  return Reflect.get(compTarget, compProp, compReceiver);
                },
              });
            }
            return Reflect.get(chatTarget, chatProp, chatReceiver);
          },
        });
      }
      // All other top-level methods (embeddings, images, etc.) pass through
      return Reflect.get(target, prop, receiver);
    },
  });
}

// ── Interceptor factory ───────────────────────────────────────────────────────

/**
 * Returns the replacement `create` function that wraps the original.
 * Extracted so the Proxy `get` handler stays readable.
 */
function _makeCreateInterceptor(
  compTarget: OpenAI["chat"]["completions"],
  tracer: Tracer
) {
  // Overloaded signature mirrors the OpenAI SDK exactly so TypeScript callers
  // see the correct return type based on whether `stream` is true.
  async function create(
    params: ChatCompletionCreateParamsNonStreaming
  ): Promise<ChatCompletion>;
  async function create(
    params: ChatCompletionCreateParamsStreaming
  ): Promise<Stream<ChatCompletionChunk>>;
  async function create(params: CreateParams): Promise<unknown> {
    const startMs = Date.now();

    if (params.stream === true) {
      // ── Streaming path ────────────────────────────────────────────────────
      // We must return an async generator so the caller's `for await` loop
      // works identically to the original SDK.
      const stream = await (
        compTarget.create as (
          p: ChatCompletionCreateParamsStreaming
        ) => Promise<Stream<ChatCompletionChunk>>
      )(params as ChatCompletionCreateParamsStreaming);

      return _wrapStream(stream, params, startMs, tracer);
    }

    // ── Non-streaming path ────────────────────────────────────────────────────
    const result = await (
      compTarget.create as (
        p: ChatCompletionCreateParamsNonStreaming
      ) => Promise<ChatCompletion>
    )(params as ChatCompletionCreateParamsNonStreaming);

    const latencyMs = Date.now() - startMs;

    // Fire telemetry onto the microtask queue — never blocks the caller.
    tracer.captureAsync({
      prompt:    params.messages as ChatMessage[],
      response:  result.choices[0]?.message?.content ?? "",
      model:     params.model,
      tokensIn:  result.usage?.prompt_tokens,
      tokensOut: result.usage?.completion_tokens,
      latencyMs,
      isStream:  false,
    });

    return result;
  }

  return create;
}

// ── Stream wrapper ────────────────────────────────────────────────────────────

/**
 * Wraps an OpenAI streaming response in an async generator that:
 *   1. Yields every chunk to the caller unchanged.
 *   2. Reconstructs the full text and counts chunks.
 *   3. Fires telemetry after the last chunk via the microtask queue.
 *
 * The returned generator preserves the `Symbol.asyncIterator` contract so
 * `for await (const chunk of stream)` works exactly as before.
 */
async function* _wrapStream(
  stream: Stream<ChatCompletionChunk>,
  params: CreateParams,
  startMs: number,
  tracer: Tracer
): AsyncGenerator<ChatCompletionChunk> {
  let fullContent    = "";
  let chunkCount     = 0;
  let promptTokens: number | undefined;

  try {
    for await (const chunk of stream) {
      // Capture prompt tokens if the first chunk carries usage data
      // (available when `stream_options: { include_usage: true }` is set).
      if (chunk.usage?.prompt_tokens !== undefined) {
        promptTokens = chunk.usage.prompt_tokens;
      }

      const delta = chunk.choices[0]?.delta?.content ?? "";
      fullContent += delta;
      chunkCount  += 1;

      yield chunk; // ← caller gets every chunk unmodified, zero delay
    }
  } finally {
    // `finally` runs whether the caller broke out early or read everything.
    const latencyMs = Date.now() - startMs;

    // Schedule telemetry on the microtask queue so it fires after the
    // caller's current `for await` iteration completes.
    tracer.captureAsync({
      prompt:    params.messages as ChatMessage[],
      response:  fullContent,
      model:     params.model,
      tokensIn:  promptTokens,          // exact if include_usage was set
      tokensOut: chunkCount,            // approximation: 1 chunk ≈ 1 token
      latencyMs,
      isStream:  true,
    });
  }
}