// ─────────────────────────────────────────────────────────────────────────────
// packages/sdk/src/core/dispatcher.ts
//
// Responsibilities:
//   1. Accept TracePayload objects from the Tracer via a fire-and-forget API.
//   2. Accumulate payloads in an in-memory micro-batch.
//   3. Flush the batch to the ingest endpoint as a single POST request.
//   4. Retry failed requests with exponential back-off (max 3 attempts).
//   5. NEVER block the caller's thread — every send goes onto the microtask
//      queue via Promise.resolve().then(...)
// ─────────────────────────────────────────────────────────────────────────────

import type { IDispatcher, TracePayload } from "./types";

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_BATCH_SIZE   = 10;    // flush after N payloads accumulate
const DEFAULT_FLUSH_MS     = 2_000; // flush every 2 s even if batch isn't full
const DEFAULT_TIMEOUT_MS   = 5_000; // per-request abort timeout
const MAX_RETRY_ATTEMPTS   = 3;
const BASE_RETRY_DELAY_MS  = 200;   // doubles on each retry (200 → 400 → 800)

// ── Types ────────────────────────────────────────────────────────────────────

export interface DispatcherOptions {
  ingestUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  batchSize?: number;
  flushIntervalMs?: number;
  onError?: (error: Error, payloads: TracePayload[]) => void;
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

export class Dispatcher implements IDispatcher {
  private readonly ingestUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly batchSize: number;
  private readonly onError: (error: Error, payloads: TracePayload[]) => void;

  /** The in-memory buffer accumulating payloads between flushes. */
  private buffer: TracePayload[] = [];

  /** The NodeJS/browser timer handle for the periodic flush. */
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  /** Tracks all in-flight fetch Promises so flush() can await them. */
  private inFlight = new Set<Promise<void>>();

  constructor(opts: DispatcherOptions) {
    this.ingestUrl  = opts.ingestUrl;
    this.apiKey     = opts.apiKey;
    this.timeoutMs  = opts.timeoutMs  ?? DEFAULT_TIMEOUT_MS;
    this.batchSize  = opts.batchSize  ?? DEFAULT_BATCH_SIZE;

    this.onError = opts.onError ?? ((err, payloads) => {
      console.warn(
        `[PromptTracer] Failed to deliver ${payloads.length} trace(s):`,
        err.message
      );
    });

    // Start the periodic flush timer.
    const intervalMs = opts.flushIntervalMs ?? DEFAULT_FLUSH_MS;
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this._drainBuffer();
      }
    }, intervalMs);

    // Prevent the timer from keeping a Node process alive indefinitely.
    if (typeof this.flushTimer === "object" && typeof (this.flushTimer as NodeJS.Timeout).unref === "function") {
  (this.flushTimer as NodeJS.Timeout).unref();
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Accepts a payload and schedules delivery non-blocking via the microtask
   * queue. The caller returns immediately; the POST happens asynchronously.
   */
  send(payload: TracePayload): void {
    // Schedule the actual buffer-push on the microtask queue so it never
    // adds synchronous overhead to the intercepted LLM call path.
    Promise.resolve().then(() => {
      this.buffer.push(payload);

      if (this.buffer.length >= this.batchSize) {
        this._drainBuffer();
      }
    });
  }

  /**
   * Waits for all in-flight requests and flushes any remaining buffered
   * payloads. Call this in tests or on process shutdown.
   *
   * @example
   * process.on('SIGTERM', () => tracer.flush());
   */
  async flush(): Promise<void> {
    // Flush whatever is sitting in the buffer right now.
    if (this.buffer.length > 0) {
      this._drainBuffer();
    }

    // Await all in-flight POSTs.
    if (this.inFlight.size > 0) {
      await Promise.allSettled([...this.inFlight]);
    }
  }

  /**
   * Stops the periodic flush timer and flushes remaining payloads.
   * Call when the Tracer instance is being torn down.
   */
  async destroy(): Promise<void> {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Atomically snapshots and clears the buffer, then initiates an async
   * POST. Multiple concurrent drains are safe — each works on its own slice.
   */
  private _drainBuffer(): void {
    const batch = this.buffer.splice(0, this.buffer.length);
    if (batch.length === 0) return;

    const promise = this._sendWithRetry(batch, 1).finally(() => {
      this.inFlight.delete(promise);
    });

    this.inFlight.add(promise);
  }

  /**
   * Attempts to POST a batch to the ingest endpoint.
   * Retries up to MAX_RETRY_ATTEMPTS times with exponential back-off.
   * Only retries on network errors or 5xx responses.
   */
  private async _sendWithRetry(
    batch: TracePayload[],
    attempt: number
  ): Promise<void> {
    try {
      await this._post(batch);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (attempt < MAX_RETRY_ATTEMPTS) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
        return this._sendWithRetry(batch, attempt + 1);
      }

      // All retries exhausted — surface to the error handler.
      this.onError(error, batch);
    }
  }

  /**
   * Performs the raw HTTP POST with an AbortController timeout.
   * Throws on network failure or non-2xx status.
   */
  private async _post(batch: TracePayload[]): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), this.timeoutMs);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (this.apiKey) {
    headers["x-api-key"] = this.apiKey;
  }

  let response: Response;
  try {
    response = await fetch(this.ingestUrl, {
      method:  "POST",
      headers,
      body:    JSON.stringify({ traces: batch }),
      signal:  controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    if (response.status >= 500) {
      throw new Error(`Ingest endpoint returned ${response.status}`);
    }
    console.warn(
      `[PromptTracer] Ingest rejected batch (${response.status}). ` +
      `Discarding ${batch.length} trace(s).`
    );
  }
}
// ── Helpers ──────────────────────────────────────────────────────────────────
}
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}