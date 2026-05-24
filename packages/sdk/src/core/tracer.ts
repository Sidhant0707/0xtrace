import { Dispatcher }  from "./dispatcher";
import { calcCostUsd } from "../utils/cost";
import type {
  RawCapturePayload,
  TracePayload,
  TracerOptions,
  IDispatcher,
  PromptResolution,
} from "./types";

const SDK_VERSION = "0.2.0";

const ANOMALY_LATENCY_MS     = 10_000;
const ANOMALY_TOKEN_THRESHOLD = 50_000;
const DEFAULT_TIMEOUT_MS     = 5_000;

function uuid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class Tracer {
  readonly sessionId: string;

  private readonly metadata:        Record<string, string>;
  private readonly enabled:         boolean;
  private readonly dispatcher:      IDispatcher;
  private readonly resolveBaseUrl:  string;
  private readonly apiKey:          string | undefined;
  private readonly timeoutMs:       number;
  private readonly samplingRate:    number;

  private stepCounter = 0;

  constructor(opts: TracerOptions, dispatcher?: IDispatcher) {
    this.sessionId      = opts.sessionId ?? uuid();
    this.metadata       = opts.metadata  ?? {};
    this.enabled        = opts.enabled   ?? true;
    this.apiKey         = opts.apiKey;
    this.timeoutMs      = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const raw = opts.samplingRate ?? 1.0;
    this.samplingRate = Math.min(1.0, Math.max(0.01, raw));

    const parsed        = new URL(opts.ingestUrl);
    this.resolveBaseUrl = `${parsed.protocol}//${parsed.host}`;

    this.dispatcher = dispatcher ?? new Dispatcher({
      ingestUrl: opts.ingestUrl,
      apiKey:    opts.apiKey,
      timeoutMs: opts.timeoutMs,
      onError:   opts.onError
        ? (err, payloads) => payloads.forEach((p) => opts.onError!(err, p))
        : undefined,
    });
  }

  captureAsync(raw: RawCapturePayload): void {
    if (!this.enabled) return;

    Promise.resolve().then(() => {
      try {
        const anomaly = this._isAnomaly(raw);

        if (!anomaly && Math.random() >= this.samplingRate) return;

        const payload = this._enrich(raw);
        this.dispatcher.send(payload);
      } catch (err) {
        console.warn("[PromptTracer] Failed to enrich payload:", err);
      }
    });
  }

  async getPrompt(name: string): Promise<PromptResolution> {
    if (!name || name.trim().length === 0) {
      throw new Error("[PromptTracer] getPrompt: name must be a non-empty string.");
    }

    const url = `${this.resolveBaseUrl}/api/prompts/resolve?name=${encodeURIComponent(name)}`;

    const headers: Record<string, string> = {};
    if (this.apiKey) headers["x-api-key"] = this.apiKey;

    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, { headers, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 404) {
      throw new Error(
        `[PromptTracer] getPrompt: prompt "${name}" not found or no deployed version.`
      );
    }

    if (response.status === 401) {
      throw new Error(
        "[PromptTracer] getPrompt: invalid or missing API key."
      );
    }

    if (!response.ok) {
      throw new Error(
        `[PromptTracer] getPrompt: unexpected response ${response.status}.`
      );
    }

    const data = (await response.json()) as PromptResolution;
    return data;
  }

  get nextStepIndex(): number {
    return this.stepCounter + 1;
  }

  async flush(): Promise<void> {
    await this.dispatcher.flush();
  }

  private _isAnomaly(raw: RawCapturePayload): boolean {
    if (raw.error) return true;
    if (raw.latencyMs > ANOMALY_LATENCY_MS) return true;

    const totalTokens = (raw.tokensIn ?? 0) + (raw.tokensOut ?? 0);
    if (totalTokens > ANOMALY_TOKEN_THRESHOLD) return true;

    return false;
  }

  private _enrich(raw: RawCapturePayload): TracePayload {
    this.stepCounter += 1;

    const estimatedCostUsd = calcCostUsd({
      model:     raw.model,
      tokensIn:  raw.tokensIn  ?? 0,
      tokensOut: raw.tokensOut ?? 0,
    });

    return {
      callId:    uuid(),
      sessionId: this.sessionId,
      stepIndex: this.stepCounter,
      timestamp: new Date().toISOString(),

      ...raw,

      estimatedCostUsd,
      sdkVersion: SDK_VERSION,

      ...(Object.keys(this.metadata).length > 0
        ? { metadata: this.metadata }
        : {}),
    } as TracePayload;
  }
}