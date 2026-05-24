// scripts/test-ratelimit.ts
// Verifies the sliding window rate limiter on /api/ingest.
//
// Usage:
//   npx tsx scripts/test-ratelimit.ts
//
// Expected output:
//   Requests 1–100  → 200 OK  (queued: 1)
//   Request  101    → 429 Too Many Requests
//   Request  102+   → 429 Too Many Requests
//
// The script fires requests sequentially (not concurrently) so the
// window counter increments predictably. Concurrent bursts would also
// 429 correctly but make the pass/fail boundary harder to assert.

import { config } from "dotenv";
config({ path: ".env.local" });

const INGEST_URL  = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/ingest`
  : "http://localhost:3000/api/ingest";

const API_KEY     = process.env.TEST_INGEST_API_KEY ?? process.env.INGEST_API_KEY ?? "";
const TOTAL_REQS  = 105;

if (!API_KEY) {
  console.error("❌  Set TEST_INGEST_API_KEY or INGEST_API_KEY in .env.local");
  process.exit(1);
}

function makeTrace(i: number) {
  return {
    traces: [
      {
        callId:           `ratelimit-test-${i}-${Date.now()}`,
        sessionId:        "ratelimit-smoke-test",
        stepIndex:        i,
        timestamp:        new Date().toISOString(),
        model:            "gpt-4o-mini",
        prompt:           [{ role: "user", content: `ping ${i}` }],
        response:         "pong",
        tokensIn:         10,
        tokensOut:        2,
        latencyMs:        50,
        isStream:         false,
        estimatedCostUsd: 0.000001,
        sdkVersion:       "test",
      },
    ],
  };
}

async function run() {
  let passed = 0;
  let firstRejected: number | null = null;

  for (let i = 1; i <= TOTAL_REQS; i++) {
    const res = await fetch(INGEST_URL, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key":    API_KEY,
      },
      body: JSON.stringify(makeTrace(i)),
    });

    const json = await res.json() as Record<string, unknown>;

    if (res.status === 200) {
      passed++;
      if (i <= 5 || i % 20 === 0) {
        console.log(`  ✓  [${i}]  200 OK  — remaining: ${json.remaining}`);
      }
    } else if (res.status === 429) {
      if (firstRejected === null) firstRejected = i;
      console.log(
        `  ✗  [${i}]  429 Rate Limited  — resetAt: ${json.resetAt}`
      );
      if (i > (firstRejected ?? 0) + 2) {
        console.log("  … (further 429s omitted)");
        break;
      }
    } else {
      console.error(`  ?  [${i}]  Unexpected ${res.status}:`, json);
    }
  }

  console.log("\n── Results ──────────────────────────────────────────");
  console.log(`  Passed:          ${passed} / 100 expected`);
  console.log(`  First rejected:  request #${firstRejected} (expected 101)`);

  const ok = passed === 100 && firstRejected === 101;
  if (ok) {
    console.log("\n  ✅  Rate limiter working correctly.\n");
  } else {
    console.error(
      `\n  ❌  Unexpected behaviour. Check UPSTASH_REDIS_REST_URL and that` +
      `\n      the @upstash/ratelimit package is installed.\n`
    );
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});