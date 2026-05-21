// ─────────────────────────────────────────────────────────────────────────────
// packages/sdk/src/index.ts
// Public surface of the @prompt-tracer/sdk package.
// ─────────────────────────────────────────────────────────────────────────────

// Core
export { Tracer }          from "./core/tracer";
export { Dispatcher }      from "./core/dispatcher";

// Wrappers
export { wrapOpenAI }      from "./wrappers/openai";

// Utilities
export { calcCostUsd, formatCostUsd } from "./utils/cost";

// Types — consumers can import these without `import type` gymnastics
export type {
  ChatMessage,
  RawCapturePayload,
  TracePayload,
  TracerOptions,
  IDispatcher,
} from "./core/types";
export type { DispatcherOptions } from "./core/dispatcher";