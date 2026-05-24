"use strict";
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : /* @__PURE__ */ Symbol.for("Symbol." + name);
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __await = function(promise, isYieldStar) {
  this[0] = promise;
  this[1] = isYieldStar;
};
var __asyncGenerator = (__this, __arguments, generator) => {
  var resume = (k, v, yes, no) => {
    try {
      var x = generator[k](v), isAwait = (v = x.value) instanceof __await, done = x.done;
      Promise.resolve(isAwait ? v[0] : v).then((y) => isAwait ? resume(k === "return" ? k : "next", v[1] ? { done: y.done, value: y.value } : y, yes, no) : yes({ value: y, done })).catch((e) => resume("throw", e, yes, no));
    } catch (e) {
      no(e);
    }
  }, method = (k, call, wait, clear) => it[k] = (x) => (call = new Promise((yes, no, run) => (run = () => resume(k, x, yes, no), q ? q.then(run) : run())), clear = () => q === wait && (q = 0), q = wait = call.then(clear, clear), call), q, it = {};
  return generator = generator.apply(__this, __arguments), it[__knownSymbol("asyncIterator")] = () => it, method("next"), method("throw"), method("return"), it;
};
var __forAwait = (obj, it, method) => (it = obj[__knownSymbol("asyncIterator")]) ? it.call(obj) : (obj = obj[__knownSymbol("iterator")](), it = {}, method = (key, fn) => (fn = obj[key]) && (it[key] = (arg) => new Promise((yes, no, done) => (arg = fn.call(obj, arg), done = arg.done, Promise.resolve(arg.value).then((value) => yes({ value, done }), no)))), method("next"), method("return"), it);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  Dispatcher: () => Dispatcher,
  Tracer: () => Tracer,
  calcCostUsd: () => calcCostUsd,
  formatCostUsd: () => formatCostUsd,
  wrapOpenAI: () => wrapOpenAI
});
module.exports = __toCommonJS(index_exports);

// src/core/dispatcher.ts
var DEFAULT_BATCH_SIZE = 10;
var DEFAULT_FLUSH_MS = 2e3;
var DEFAULT_TIMEOUT_MS = 5e3;
var MAX_RETRY_ATTEMPTS = 3;
var BASE_RETRY_DELAY_MS = 200;
var Dispatcher = class {
  constructor(opts) {
    /** The in-memory buffer accumulating payloads between flushes. */
    this.buffer = [];
    /** The NodeJS/browser timer handle for the periodic flush. */
    this.flushTimer = null;
    /** Tracks all in-flight fetch Promises so flush() can await them. */
    this.inFlight = /* @__PURE__ */ new Set();
    var _a, _b, _c, _d;
    this.ingestUrl = opts.ingestUrl;
    this.apiKey = opts.apiKey;
    this.timeoutMs = (_a = opts.timeoutMs) != null ? _a : DEFAULT_TIMEOUT_MS;
    this.batchSize = (_b = opts.batchSize) != null ? _b : DEFAULT_BATCH_SIZE;
    this.onError = (_c = opts.onError) != null ? _c : ((err, payloads) => {
      console.warn(
        `[PromptTracer] Failed to deliver ${payloads.length} trace(s):`,
        err.message
      );
    });
    const intervalMs = (_d = opts.flushIntervalMs) != null ? _d : DEFAULT_FLUSH_MS;
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this._drainBuffer();
      }
    }, intervalMs);
    if (typeof this.flushTimer === "object" && typeof this.flushTimer.unref === "function") {
      this.flushTimer.unref();
    }
  }
  // ── Public API ─────────────────────────────────────────────────────────────
  /**
   * Accepts a payload and schedules delivery non-blocking via the microtask
   * queue. The caller returns immediately; the POST happens asynchronously.
   */
  send(payload) {
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
  async flush() {
    if (this.buffer.length > 0) {
      this._drainBuffer();
    }
    if (this.inFlight.size > 0) {
      await Promise.allSettled([...this.inFlight]);
    }
  }
  /**
   * Stops the periodic flush timer and flushes remaining payloads.
   * Call when the Tracer instance is being torn down.
   */
  async destroy() {
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
  _drainBuffer() {
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
  async _sendWithRetry(batch, attempt) {
    try {
      await this._post(batch);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRY_ATTEMPTS) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
        return this._sendWithRetry(batch, attempt + 1);
      }
      this.onError(error, batch);
    }
  }
  /**
   * Performs the raw HTTP POST with an AbortController timeout.
   * Throws on network failure or non-2xx status.
   */
  async _post(batch) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }
    let response;
    try {
      response = await fetch(this.ingestUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ traces: batch }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      if (response.status >= 500) {
        throw new Error(`Ingest endpoint returned ${response.status}`);
      }
      console.warn(
        `[PromptTracer] Ingest rejected batch (${response.status}). Discarding ${batch.length} trace(s).`
      );
    }
  }
  // ── Helpers ──────────────────────────────────────────────────────────────────
};
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/utils/cost.ts
var MODEL_PRICES = {
  // ── OpenAI ──────────────────────────────────────────────────────────────
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-4-turbo": { inputPer1M: 10, outputPer1M: 30 },
  "gpt-4": { inputPer1M: 30, outputPer1M: 60 },
  "gpt-3.5-turbo": { inputPer1M: 0.5, outputPer1M: 1.5 },
  "o1": { inputPer1M: 15, outputPer1M: 60 },
  "o1-mini": { inputPer1M: 3, outputPer1M: 12 },
  "o3-mini": { inputPer1M: 1.1, outputPer1M: 4.4 },
  // ── Anthropic ───────────────────────────────────────────────────────────
  "claude-opus-4": { inputPer1M: 15, outputPer1M: 75 },
  "claude-sonnet-4": { inputPer1M: 3, outputPer1M: 15 },
  "claude-haiku-4": { inputPer1M: 0.8, outputPer1M: 4 },
  "claude-3-5-sonnet": { inputPer1M: 3, outputPer1M: 15 },
  "claude-3-5-haiku": { inputPer1M: 0.8, outputPer1M: 4 },
  "claude-3-opus": { inputPer1M: 15, outputPer1M: 75 },
  // ── Google ──────────────────────────────────────────────────────────────
  "gemini-1.5-pro": { inputPer1M: 3.5, outputPer1M: 10.5 },
  "gemini-1.5-flash": { inputPer1M: 0.35, outputPer1M: 1.05 },
  "gemini-2.0-flash": { inputPer1M: 0.1, outputPer1M: 0.4 }
};
var UNKNOWN_PRICE = { inputPer1M: 0, outputPer1M: 0 };
function resolvePrice(model) {
  const normalised = model.toLowerCase().trim();
  if (normalised in MODEL_PRICES) return MODEL_PRICES[normalised];
  for (const key of Object.keys(MODEL_PRICES)) {
    if (normalised.startsWith(key)) return MODEL_PRICES[key];
  }
  return UNKNOWN_PRICE;
}
function calcCostUsd({ model, tokensIn, tokensOut }) {
  const price = resolvePrice(model);
  const inputCost = tokensIn / 1e6 * price.inputPer1M;
  const outputCost = tokensOut / 1e6 * price.outputPer1M;
  return Math.round((inputCost + outputCost) * 1e8) / 1e8;
}
function formatCostUsd(usd) {
  if (usd === 0) return "$0.00";
  if (usd < 1e-4) return `$${usd.toFixed(8).replace(/0+$/, "")}`;
  if (usd < 0.01) return `$${usd.toFixed(6).replace(/0+$/, "")}`;
  return `$${usd.toFixed(4)}`;
}

// src/core/tracer.ts
var SDK_VERSION = "0.2.0";
var ANOMALY_LATENCY_MS = 1e4;
var ANOMALY_TOKEN_THRESHOLD = 5e4;
var DEFAULT_TIMEOUT_MS2 = 5e3;
function uuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
var Tracer = class {
  constructor(opts, dispatcher) {
    this.stepCounter = 0;
    var _a, _b, _c, _d, _e;
    this.sessionId = (_a = opts.sessionId) != null ? _a : uuid();
    this.metadata = (_b = opts.metadata) != null ? _b : {};
    this.enabled = (_c = opts.enabled) != null ? _c : true;
    this.apiKey = opts.apiKey;
    this.timeoutMs = (_d = opts.timeoutMs) != null ? _d : DEFAULT_TIMEOUT_MS2;
    const raw = (_e = opts.samplingRate) != null ? _e : 1;
    this.samplingRate = Math.min(1, Math.max(0.01, raw));
    const parsed = new URL(opts.ingestUrl);
    this.resolveBaseUrl = `${parsed.protocol}//${parsed.host}`;
    this.dispatcher = dispatcher != null ? dispatcher : new Dispatcher({
      ingestUrl: opts.ingestUrl,
      apiKey: opts.apiKey,
      timeoutMs: opts.timeoutMs,
      onError: opts.onError ? (err, payloads) => payloads.forEach((p) => opts.onError(err, p)) : void 0
    });
  }
  captureAsync(raw) {
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
  async getPrompt(name) {
    if (!name || name.trim().length === 0) {
      throw new Error("[PromptTracer] getPrompt: name must be a non-empty string.");
    }
    const url = `${this.resolveBaseUrl}/api/prompts/resolve?name=${encodeURIComponent(name)}`;
    const headers = {};
    if (this.apiKey) headers["x-api-key"] = this.apiKey;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
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
    const data = await response.json();
    return data;
  }
  get nextStepIndex() {
    return this.stepCounter + 1;
  }
  async flush() {
    await this.dispatcher.flush();
  }
  _isAnomaly(raw) {
    var _a, _b;
    if (raw.error) return true;
    if (raw.latencyMs > ANOMALY_LATENCY_MS) return true;
    const totalTokens = ((_a = raw.tokensIn) != null ? _a : 0) + ((_b = raw.tokensOut) != null ? _b : 0);
    if (totalTokens > ANOMALY_TOKEN_THRESHOLD) return true;
    return false;
  }
  _enrich(raw) {
    var _a, _b;
    this.stepCounter += 1;
    const estimatedCostUsd = calcCostUsd({
      model: raw.model,
      tokensIn: (_a = raw.tokensIn) != null ? _a : 0,
      tokensOut: (_b = raw.tokensOut) != null ? _b : 0
    });
    return __spreadValues(__spreadProps(__spreadValues({
      callId: uuid(),
      sessionId: this.sessionId,
      stepIndex: this.stepCounter,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    }, raw), {
      estimatedCostUsd,
      sdkVersion: SDK_VERSION
    }), Object.keys(this.metadata).length > 0 ? { metadata: this.metadata } : {});
  }
};

// src/wrappers/openai.ts
function wrapOpenAI(client, tracer) {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "chat") {
        return new Proxy(target.chat, {
          get(chatTarget, chatProp, chatReceiver) {
            if (chatProp === "completions") {
              return new Proxy(chatTarget.completions, {
                get(compTarget, compProp, compReceiver) {
                  if (compProp === "create") {
                    return _makeCreateInterceptor(compTarget, tracer);
                  }
                  return Reflect.get(compTarget, compProp, compReceiver);
                }
              });
            }
            return Reflect.get(chatTarget, chatProp, chatReceiver);
          }
        });
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}
function _makeCreateInterceptor(compTarget, tracer) {
  async function create(params) {
    var _a, _b, _c, _d, _e;
    const startMs = Date.now();
    if (params.stream === true) {
      let stream;
      try {
        stream = await compTarget.create(params);
      } catch (err) {
        tracer.captureAsync({
          prompt: params.messages,
          response: "",
          model: params.model,
          tokensIn: void 0,
          tokensOut: void 0,
          latencyMs: Date.now() - startMs,
          isStream: true,
          error: err instanceof Error ? err.message : String(err)
        });
        throw err;
      }
      return _wrapStream(stream, params, startMs, tracer);
    }
    let result;
    try {
      result = await compTarget.create(params);
    } catch (err) {
      tracer.captureAsync({
        prompt: params.messages,
        response: "",
        model: params.model,
        tokensIn: void 0,
        tokensOut: void 0,
        latencyMs: Date.now() - startMs,
        isStream: false,
        error: err instanceof Error ? err.message : String(err)
      });
      throw err;
    }
    const latencyMs = Date.now() - startMs;
    tracer.captureAsync({
      prompt: params.messages,
      response: (_c = (_b = (_a = result.choices[0]) == null ? void 0 : _a.message) == null ? void 0 : _b.content) != null ? _c : "",
      model: params.model,
      tokensIn: (_d = result.usage) == null ? void 0 : _d.prompt_tokens,
      tokensOut: (_e = result.usage) == null ? void 0 : _e.completion_tokens,
      latencyMs,
      isStream: false
    });
    return result;
  }
  return create;
}
function _wrapStream(stream, params, startMs, tracer) {
  return __asyncGenerator(this, null, function* () {
    var _a, _b, _c, _d;
    let fullContent = "";
    let chunkCount = 0;
    let promptTokens;
    let caughtError;
    try {
      try {
        for (var iter = __forAwait(stream), more, temp, error; more = !(temp = yield new __await(iter.next())).done; more = false) {
          const chunk = temp.value;
          if (((_a = chunk.usage) == null ? void 0 : _a.prompt_tokens) !== void 0) {
            promptTokens = chunk.usage.prompt_tokens;
          }
          const delta = (_d = (_c = (_b = chunk.choices[0]) == null ? void 0 : _b.delta) == null ? void 0 : _c.content) != null ? _d : "";
          fullContent += delta;
          chunkCount += 1;
          yield chunk;
        }
      } catch (temp) {
        error = [temp];
      } finally {
        try {
          more && (temp = iter.return) && (yield new __await(temp.call(iter)));
        } finally {
          if (error)
            throw error[0];
        }
      }
    } catch (err) {
      caughtError = err instanceof Error ? err : new Error(String(err));
      throw caughtError;
    } finally {
      const latencyMs = Date.now() - startMs;
      tracer.captureAsync(__spreadValues({
        prompt: params.messages,
        response: fullContent,
        model: params.model,
        tokensIn: promptTokens,
        tokensOut: chunkCount,
        latencyMs,
        isStream: true
      }, caughtError ? { error: caughtError.message } : {}));
    }
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Dispatcher,
  Tracer,
  calcCostUsd,
  formatCostUsd,
  wrapOpenAI
});
