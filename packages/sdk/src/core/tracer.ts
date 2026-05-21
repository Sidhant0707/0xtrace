// ─────────────────────────────────────────────────────────────────────────────
// packages/sdk/src/core/tracer.ts
//
// Responsibilities:
//   1. Own one logical "session" (a single agent run).
//   2. Maintain a monotonic step counter across all calls in that session.
//   3. Enrich a RawCapturePayload into a full TracePayload (ids, cost, ts).
//   4. Hand the enriched payload to the Dispatcher non-blocking.
//   5. Expose a flush() for clean shutdown / test assertions.
// ─────────────────────────────────────────────────────────────────────────────

import { Dispatcher }                            from "./dispatcher";
import { calcCostUsd }                           from "../utils/cost";
import type {
  RawCapturePayload,
  TracePayload,
  TracerOptions,
  IDispatcher,
}                                                from "./types";

// ── SDK version (keep in sync with package.json) ─────────────────────────────
const SDK_VERSION = "0.1.0";

// ── UUID helper ──────────────────────────────────────────────────────────────
// crypto.randomUUID() is available in Node ≥ 14.17, modern browsers, and
// the Edge runtime. Provide a tiny fallback for exotic environments.
function uuid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // Fallback: RFC-4122 v4 UUID
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Tracer ────────────────────────────────────────────────────────────────────

export class Tracer {
  /** Groups all LLM calls in this agent run. */
  readonly sessionId: string;

  /** Caller-supplied arbitrary metadata attached to every payload. */
  private readonly metadata: Record<string, string>;

  /** Whether telemetry is active (can be disabled via options). */
  private readonly enabled: boolean;

  /** Delivery engine — injectable for unit-testing. */
  private readonly dispatcher: IDispatcher;

  /**
   * Monotonically increasing step counter.
   * Step 1 → first call in the session (triggers full snapshot in the DB).
   * Step N → subsequent calls (store diff only).
   */
  private stepCounter = 0;

  constructor(opts: TracerOptions, dispatcher?: IDispatcher) {
    this.sessionId  = opts.sessionId ?? uuid();
    this.metadata   = opts.metadata  ?? {};
    this.enabled    = opts.enabled   ?? true;

    // Use an injected dispatcher (useful in tests) or create the real one.
    this.dispatcher = dispatcher ?? new Dispatcher({
      ingestUrl:       opts.ingestUrl,
      apiKey:    opts.apiKey,
      timeoutMs:       opts.timeoutMs,
      onError:         opts.onError
        ? (err, payloads) => payloads.forEach((p) => opts.onError!(err, p))
        : undefined,
    });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * The method called by every SDK wrapper after intercepting an LLM call.
   *
   * Design contract:
   *   - NEVER awaited by the wrapper; fire-and-forget on microtask queue.
   *   - Returns void so the wrapper cannot accidentally `await` it.
   *
   * @example
   * // Inside wrappers/openai.ts — after receiving the result:
   * tracer.captureAsync({ prompt, response, model, tokensIn, tokensOut, latencyMs, isStream });
   */
  captureAsync(raw: RawCapturePayload): void {
    if (!this.enabled) return;

    // Schedule enrichment + dispatch asynchronously so it never adds
    // synchronous latency to the intercepted call path.
    Promise.resolve().then(() => {
      try {
        const payload = this._enrich(raw);
        this.dispatcher.send(payload);
      } catch (err) {
        // Tracer must NEVER throw into user code.
        console.warn("[PromptTracer] Failed to enrich payload:", err);
      }
    });
  }

  /**
   * Returns the step index the *next* call will be assigned.
   * Useful for callers who need to know if this is step 1 (full snapshot)
   * vs. a later step (diff only) before making the LLM call.
   */
  get nextStepIndex(): number {
    return this.stepCounter + 1;
  }

  /**
   * Waits for all buffered and in-flight payloads to be delivered.
   * Call before process exit or at the end of integration tests.
   *
   * @example
   * afterAll(async () => { await tracer.flush(); });
   */
  async flush(): Promise<void> {
    await this.dispatcher.flush();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /**
   * Takes a raw capture from the wrapper and enriches it with:
   *   - a unique callId
   *   - the session's sessionId
   *   - a monotonic stepIndex
   *   - ISO-8601 timestamp
   *   - USD cost estimate
   *   - SDK version string
   *   - caller metadata
   */
  private _enrich(raw: RawCapturePayload): TracePayload {
    this.stepCounter += 1;

    const estimatedCostUsd = calcCostUsd({
      model:     raw.model,
      tokensIn:  raw.tokensIn  ?? 0,
      tokensOut: raw.tokensOut ?? 0,
    });

    return {
      // ── Core identity ───────────────────────────────────────────────────
      callId:     uuid(),
      sessionId:  this.sessionId,
      stepIndex:  this.stepCounter,
      timestamp:  new Date().toISOString(),

      // ── Raw capture data (passed through unchanged) ──────────────────────
      ...raw,

      // ── Enrichment ───────────────────────────────────────────────────────
      estimatedCostUsd,
      sdkVersion: SDK_VERSION,

      // Merge metadata into the payload so the ingest API can index on it.
      // We spread it flat; the ingest schema should have a metadata JSONB col.
      ...(Object.keys(this.metadata).length > 0
        ? { metadata: this.metadata }
        : {}),
    } as TracePayload;
  }
}