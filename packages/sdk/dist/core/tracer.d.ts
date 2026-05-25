import type { RawCapturePayload, TracerOptions, IDispatcher, PromptResolution } from "./types";
export declare class Tracer {
    readonly sessionId: string;
    private readonly metadata;
    private readonly tags;
    private readonly enabled;
    private readonly dispatcher;
    private readonly resolveBaseUrl;
    private readonly apiKey;
    private readonly timeoutMs;
    private readonly samplingRate;
    private stepCounter;
    constructor(opts: TracerOptions, dispatcher?: IDispatcher);
    captureAsync(raw: RawCapturePayload): void;
    getPrompt(name: string): Promise<PromptResolution>;
    get nextStepIndex(): number;
    flush(): Promise<void>;
    private _isAnomaly;
    private _enrich;
}
