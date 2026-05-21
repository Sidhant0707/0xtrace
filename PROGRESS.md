# 0xtrace — Build Progress

## Architecture Overview

User's AI Agent
│
▼
[@prompt-tracer/sdk] ← Proxy intercepts every LLM call
│ captureAsync() — non-blocking, microtask queue
▼
[POST /api/ingest] ← Next.js App Router route
│ lpush → never writes directly to Postgres
▼
[Upstash Redis] ← Queue buffer, absorbs infinite loops
│ lrange/ltrim — batched drain
▼
[GET /api/cron/drain-queue] ← Runs every minute (Vercel Cron)
│ diff-only logic, bulk insert
▼
[Supabase Postgres] ← llm_calls + prompt_snapshots

## Three Core Architectural Constraints

### 1. Proxy Interception (No monkey-patching)

- File: `packages/sdk/src/wrappers/openai.ts`
- Uses nested JavaScript `Proxy` objects to intercept `chat.completions.create`
- Handles both standard responses and async streams
- `captureAsync()` fires via `Promise.resolve().then()` — zero latency added to user's agent
- Original OpenAI types and streaming fully preserved

### 2. Ingest Buffer (No DDOS)

- File: `app/api/ingest/route.ts`
- Never writes directly to Postgres
- Every incoming trace payload is pushed to Upstash Redis via `lpush`
- Returns `{"ok":true}` in under 5ms regardless of DB load
- Absorbs infinite agent loops without cold-start chaining

### 3. Diff-Only Storage (No JSONB explosion)

- Files: `lib/diff.ts`, `app/api/cron/drain-queue/route.ts`
- Step 1 of each session: stores full `messages` array as `full_snapshot`
- Steps 2–N: stores only `{added, removed, tokenDelta}` diff
- Frontend reconstructs full context window by replaying diffs (like git log)
- TTL function `prune_old_snapshots()` nulls `full_snapshot` after 7 days
- Estimated storage reduction: ~85–90% on multi-step RAG agents

## Completed

### SDK Package (`packages/sdk/`)

| File                     | Status  | Description                                                                                        |
| ------------------------ | ------- | -------------------------------------------------------------------------------------------------- |
| `src/core/types.ts`      | ✅ Done | `ChatMessage`, `RawCapturePayload`, `TracePayload`, `TracerOptions`, `IDispatcher`                 |
| `src/core/tracer.ts`     | ✅ Done | Session management, step counter, UUID generation, `captureAsync()`                                |
| `src/core/dispatcher.ts` | ✅ Done | In-memory micro-batch (10 items / 2s), exponential backoff retry (3x), `flush()` / `destroy()`     |
| `src/wrappers/openai.ts` | ✅ Done | Nested Proxy — intercepts `chat.completions.create`, handles streams, fires telemetry non-blocking |
| `src/utils/cost.ts`      | ✅ Done | USD cost estimation per model                                                                      |
| `src/utils/diff.ts`      | ✅ Done | Token diff utilities                                                                               |

### Next.js App (`app/`)

| File                                | Status  | Description                                                                         |
| ----------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| `app/api/ingest/route.ts`           | ✅ Done | POST handler — validates payload, pushes to Redis queue, returns in <5ms            |
| `app/api/cron/drain-queue/route.ts` | ✅ Done | Drain cron — pops 100 items, bulk inserts `llm_calls`, diff-only `prompt_snapshots` |

### Infrastructure

| File              | Status  | Description                                                       |
| ----------------- | ------- | ----------------------------------------------------------------- |
| `lib/supabase.ts` | ✅ Done | Admin Supabase client (service role, server-only)                 |
| `lib/diff.ts`     | ✅ Done | `computeMessageDiff()` + `replayDiffs()`                          |
| `vercel.json`     | ✅ Done | Cron schedule — every minute                                      |
| Supabase Schema   | ✅ Done | `llm_calls` + `prompt_snapshots` + TTL pruning function + indexes |
| `.env.local`      | ✅ Done | Upstash + Supabase + CRON_SECRET keys                             |
| `.gitignore`      | ✅ Safe | `.env*` pattern covers all env files                              |

## Database Schema

### `llm_calls`

Stores one row per LLM call. Prompt content intentionally excluded.
call_id, session_id, step_index, model,
tokens_in, tokens_out, latency_ms, estimated_cost_usd,
is_stream, response, sdk_version, metadata, timestamp

### `prompt_snapshots`

Diff-only storage. One row per LLM call, linked via `call_id`.
call_id, session_id, step_index,
full_snapshot (JSONB — step 1 only),
diff_from_previous (JSONB — steps 2–N only)

## Environment Variables

UPSTASH_REDIS_REST_URL — Upstash dashboard → REST API
UPSTASH_REDIS_REST_TOKEN — Upstash dashboard → REST API
NEXT_PUBLIC_SUPABASE_URL — Supabase → Project Settings → API
SUPABASE_SERVICE_ROLE_KEY — Supabase → Project Settings → API
CRON_SECRET — Any long random string you generate

## What's Next (Phase 2 — Frontend Dashboard)

1. **Sessions list page** — `app/dashboard/page.tsx`
   - Table of agent runs grouped by `session_id`
   - Columns: session ID, total steps, total cost, total tokens, avg latency, timestamp

2. **Session detail page** — `app/dashboard/[sessionId]/page.tsx`
   - Timeline of all LLM calls in the session
   - Per-step: model, latency, tokens, cost

3. **Prompt diff viewer** — `app/dashboard/[sessionId]/[callId]/page.tsx`
   - Side-by-side diff view using `replayDiffs()`
   - Green = added messages, red = removed messages
   - Context bloat chart: tokens per step as a bar chart

4. **Cost anomaly feed**
   - Flags sessions where cost/tokens spike unexpectedly between steps
   - The "Hacker News demo" feature

5. **Replay engine**
   - Re-fire any captured prompt against any model
   - A/B compare outputs

## Testing the Full Pipeline Locally

```bash
# 1. Start dev server
cd ~/Desktop/0xtrace && npm run dev

# 2. Push a test trace to the ingest endpoint
curl -X POST http://localhost:3000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"traces":[{"callId":"test-1","sessionId":"sess-1","model":"gpt-4o","prompt":[{"role":"user","content":"hello"}],"response":"hi","tokensIn":10,"tokensOut":5,"latencyMs":300,"isStream":false,"stepIndex":1,"timestamp":"2026-01-01T00:00:00Z","estimatedCostUsd":0.001,"sdkVersion":"0.1.0"}]}'

# 3. Verify it landed in Upstash (check console.upstash.com → trace:queue)

# 4. Trigger the drain cron manually
curl -H "Authorization: Bearer your-random-secret-here" \
  http://localhost:3000/api/cron/drain-queue

# 5. Check Supabase table editor — llm_calls and prompt_snapshots should have rows
```
