import type { RawCapturePayload, TracerOptions, IDispatcher } from "./types";
export declare class Tracer {
    /** Groups all LLM calls in this agent run. */
    readonly sessionId: string;
    /** Caller-supplied arbitrary metadata attached to every payload. */
    private readonly metadata;
    /** Whether telemetry is active (can be disabled via options). */
    private readonly enabled;
    /** Delivery engine — injectable for unit-testing. */
    private readonly dispatcher;
    /**
     * Monotonically increasing step counter.
     * Step 1 → first call in the session (triggers full snapshot in the DB).
     * Step N → subsequent calls (store diff only).
     */
    private stepCounter;
    constructor(opts: TracerOptions, dispatcher?: IDispatcher);
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
    captureAsync(raw: RawCapturePayload): void;
    /**
     * Returns the step index the *next* call will be assigned.
     * Useful for callers who need to know if this is step 1 (full snapshot)
     * vs. a later step (diff only) before making the LLM call.
     */
    get nextStepIndex(): number;
    /**
     * Waits for all buffered and in-flight payloads to be delivered.
     * Call before process exit or at the end of integration tests.
     *
     * @example
     * afterAll(async () => { await tracer.flush(); });
     */
    flush(): Promise<void>;
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
    private _enrich;
}
