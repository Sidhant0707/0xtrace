// ─────────────────────────────────────────────────────────────────────────────
// packages/sdk/src/core/types.ts
// Central type contracts for the entire SDK. No runtime code lives here.
// ─────────────────────────────────────────────────────────────────────────────

/** A single message in an OpenAI-compatible chat conversation. */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool" | "function";
  content: string | null;
  name?: string;
  tool_call_id?: string;
}

/** Raw data captured at the intercept point, before any enrichment. */
export interface RawCapturePayload {
  /** The messages array sent to the model. */
  prompt: ChatMessage[] | readonly ChatMessage[];
  /** The text content of the completion (reconstructed for streams). */
  response: string;
  /** Model string exactly as passed by the caller e.g. "gpt-4o". */
  model: string;
  /** Prompt tokens from usage object. Undefined for streams (not available). */
  tokensIn: number | undefined;
  /** Completion tokens. For streams this is an approximation (chunk count). */
  tokensOut: number | undefined;
  /** Wall-clock ms from request start to last byte received. */
  latencyMs: number;
  /** Whether the call used server-sent streaming. */
  isStream: boolean;
}

/** The fully enriched payload that gets pushed to the ingest queue. */
export interface TracePayload extends RawCapturePayload {
  /** SDK-generated UUID for this individual LLM call. */
  callId: string;
  /** Session/trace ID grouping multiple calls in one agent run.
   *  Set via TracerOptions.sessionId or auto-generated per Tracer instance. */
  sessionId: string;
  /** Step index within the session (1-based, incremented per capture). */
  stepIndex: number;
  /** ISO-8601 timestamp of the call start. */
  timestamp: string;
  /** Estimated USD cost for this call. */
  estimatedCostUsd: number;
  /** Version string of the SDK emitting this payload. */
  sdkVersion: string;
}

/** Options passed when constructing a Tracer instance. */
export interface TracerOptions {
  /** Full URL of your Next.js ingest endpoint.
   *  e.g. "https://your-app.vercel.app/api/ingest" */
  ingestUrl: string;
  apiKey?: string;
  /** Optional session ID to group multiple calls into one trace. If omitted,
  /** Groups multiple LLM calls into one logical agent run.
   *  Auto-generated (UUID v4) if omitted. */
  sessionId?: string;
  /** Attach arbitrary key/value metadata to every payload (e.g. userId, env). */
  metadata?: Record<string, string>;
  /** Max ms to wait for the ingest POST before aborting. Default: 5000. */
  timeoutMs?: number;
  /** Called when the ingest POST fails. Defaults to console.warn. */
  onError?: (error: Error, payload: TracePayload) => void;
  /** Set false to completely disable telemetry (e.g. in unit tests). Default: true */
  enabled?: boolean;
}

/** Minimal interface the Dispatcher must satisfy — useful for testing. */
export interface IDispatcher {
  send(payload: TracePayload): void; // non-blocking fire-and-forget
  flush(): Promise<void>;            // drain all pending sends (use in tests / shutdown)
}