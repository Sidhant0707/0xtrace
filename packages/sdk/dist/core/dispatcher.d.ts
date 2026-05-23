import type { IDispatcher, TracePayload } from "./types";
export interface DispatcherOptions {
    ingestUrl: string;
    apiKey?: string;
    timeoutMs?: number;
    batchSize?: number;
    flushIntervalMs?: number;
    onError?: (error: Error, payloads: TracePayload[]) => void;
}
export declare class Dispatcher implements IDispatcher {
    private readonly ingestUrl;
    private readonly apiKey;
    private readonly timeoutMs;
    private readonly batchSize;
    private readonly onError;
    /** The in-memory buffer accumulating payloads between flushes. */
    private buffer;
    /** The NodeJS/browser timer handle for the periodic flush. */
    private flushTimer;
    /** Tracks all in-flight fetch Promises so flush() can await them. */
    private inFlight;
    constructor(opts: DispatcherOptions);
    /**
     * Accepts a payload and schedules delivery non-blocking via the microtask
     * queue. The caller returns immediately; the POST happens asynchronously.
     */
    send(payload: TracePayload): void;
    /**
     * Waits for all in-flight requests and flushes any remaining buffered
     * payloads. Call this in tests or on process shutdown.
     *
     * @example
     * process.on('SIGTERM', () => tracer.flush());
     */
    flush(): Promise<void>;
    /**
     * Stops the periodic flush timer and flushes remaining payloads.
     * Call when the Tracer instance is being torn down.
     */
    destroy(): Promise<void>;
    /**
     * Atomically snapshots and clears the buffer, then initiates an async
     * POST. Multiple concurrent drains are safe — each works on its own slice.
     */
    private _drainBuffer;
    /**
     * Attempts to POST a batch to the ingest endpoint.
     * Retries up to MAX_RETRY_ATTEMPTS times with exponential back-off.
     * Only retries on network errors or 5xx responses.
     */
    private _sendWithRetry;
    /**
     * Performs the raw HTTP POST with an AbortController timeout.
     * Throws on network failure or non-2xx status.
     */
    private _post;
}
