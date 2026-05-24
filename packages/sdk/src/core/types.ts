export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool" | "function";
  content: string | null;
  name?: string;
  tool_call_id?: string;
}

export interface RawCapturePayload {
  prompt:    ChatMessage[] | readonly ChatMessage[];
  response:  string;
  model:     string;
  tokensIn:  number | undefined;
  tokensOut: number | undefined;
  latencyMs: number;
  isStream:  boolean;
  error?:    string;
}

export interface TracePayload extends RawCapturePayload {
  callId:           string;
  sessionId:        string;
  stepIndex:        number;
  timestamp:        string;
  estimatedCostUsd: number;
  sdkVersion:       string;
  metadata?:        Record<string, unknown>;
}

export interface TracerOptions {
  ingestUrl:    string;
  apiKey?:      string;
  sessionId?:   string;
  metadata?:    Record<string, string>;
  timeoutMs?:   number;
  onError?:     (error: Error, payload: TracePayload) => void;
  enabled?:     boolean;
  samplingRate?: number;
}

export interface IDispatcher {
  send(payload: TracePayload): void;
  flush(): Promise<void>;
}

export interface PromptResolution {
  name:    string;
  version: string;
  content: string;
  model:   string | null;
}