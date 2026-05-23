// app/docs/page.tsx
//
// Public documentation page — no auth required.
// Single long page covering everything a developer needs to go from
// zero to first trace in under 5 minutes.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Docs · 0xtrace",
  description:
    "Everything you need to integrate 0xtrace into your LLM application.",
};

// ── Sub-components ────────────────────────────────────────────────────────────

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="block text-[#71717a] text-[13px] hover:text-[#a1a1aa] transition-colors no-underline py-1"
    >
      {label}
    </a>
  );
}

function SectionHeading({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="m-0 mt-14 mb-4 text-white text-[20px] font-semibold tracking-[-0.02em] scroll-mt-24 border-b border-[#1f1f1f] pb-3"
    >
      {children}
    </h2>
  );
}

function SubHeading({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h3
      id={id}
      className="m-0 mt-8 mb-3 text-white text-[15px] font-medium scroll-mt-24"
    >
      {children}
    </h3>
  );
}

function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  return (
    <div className="my-4 rounded-lg overflow-hidden border border-[#1f1f1f]">
      <div className="flex items-center justify-between px-4 py-2 bg-[#0a0a0a] border-b border-[#1f1f1f]">
        <span className="font-mono text-[11px] text-[#52525b]">{lang}</span>
      </div>
      <pre className="m-0 p-4 bg-[#080808] overflow-x-auto">
        <code className="font-mono text-[13px] text-[#e4e4e7] leading-[1.8]">
          {code}
        </code>
      </pre>
    </div>
  );
}

function Callout({
  type = "info",
  children,
}: {
  type?: "info" | "warning" | "tip";
  children: React.ReactNode;
}) {
  const styles = {
    info: {
      border: "border-[#1e3a8a]",
      bg: "bg-[#0f1e3a]",
      text: "text-[#60a5fa]",
      label: "Info",
    },
    warning: {
      border: "border-[#451a03]",
      bg: "bg-[#2d1a00]",
      text: "text-[#f59e0b]",
      label: "Note",
    },
    tip: {
      border: "border-[#064e3b]",
      bg: "bg-[#052e16]",
      text: "text-[#10b981]",
      label: "Tip",
    },
  }[type];

  return (
    <div
      className={`my-4 px-4 py-3 rounded-lg border ${styles.border} ${styles.bg}`}
    >
      <span
        className={`font-mono text-[11px] font-medium uppercase tracking-wider ${styles.text}`}
      >
        {styles.label} —{" "}
      </span>
      <span className="text-[#a1a1aa] text-[13px]">{children}</span>
    </div>
  );
}

function PropRow({
  name,
  type,
  required,
  description,
}: {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}) {
  return (
    <tr className="border-b border-[#1f1f1f] last:border-0">
      <td className="py-3 pr-4 font-mono text-[12px] text-[#60a5fa] whitespace-nowrap align-top">
        {name}
      </td>
      <td className="py-3 pr-4 font-mono text-[11px] text-[#a1a1aa] whitespace-nowrap align-top">
        {type}
      </td>
      <td className="py-3 pr-4 align-top">
        {required ? (
          <span className="text-[10px] font-mono text-[#f43f5e]">required</span>
        ) : (
          <span className="text-[10px] font-mono text-[#52525b]">optional</span>
        )}
      </td>
      <td className="py-3 text-[13px] text-[#71717a] align-top">
        {description}
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[#080808] text-[#a1a1aa]">
      {/* ── Top nav ── */}
      <header className="sticky top-0 z-20 h-[58px] bg-[#080808]/90 backdrop-blur-xl border-b border-[#1f1f1f] flex items-center px-6 justify-between">
        <Link
          href="/"
          className="font-mono text-[15px] font-semibold text-white no-underline"
        >
          0x<span className="font-normal text-[#a1a1aa]">trace</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="https://github.com/Sidhant0707/0xtrace"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#71717a] text-[13px] hover:text-white transition-colors no-underline"
          >
            GitHub
          </Link>
          <Link
            href="/dashboard"
            className="h-8 px-4 bg-[#3b82f6] text-white text-[13px] font-medium rounded-md inline-flex items-center no-underline hover:bg-[#2563eb] transition-colors"
          >
            Dashboard →
          </Link>
        </div>
      </header>

      <div className="max-w-[1100px] mx-auto px-6 flex gap-12 py-12">
        {/* ── Left sidebar: TOC ── */}
        <aside className="w-[200px] flex-none hidden lg:block">
          <div className="sticky top-[82px]">
            <p className="text-[11px] font-mono text-[#52525b] uppercase tracking-wider mb-3">
              On this page
            </p>
            <nav className="flex flex-col">
              <NavLink href="#quickstart" label="Quickstart" />
              <NavLink href="#installation" label="Installation" />
              <NavLink href="#sdk-reference" label="SDK Reference" />
              <NavLink href="#tracer-options" label="Tracer Options" />
              <NavLink href="#dashboard" label="Dashboard Guide" />
              <NavLink href="#self-hosting" label="Self-Hosting" />
              <NavLink href="#architecture" label="Architecture" />
              <NavLink href="#faq" label="FAQ" />
            </nav>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0">
          {/* Header */}
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#3b82f6]/20 bg-[#3b82f6]/10 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
              <span className="font-mono text-[12px] text-[#3b82f6]">
                SDK v1.0.4
              </span>
            </div>
            <h1 className="m-0 text-white text-[32px] font-semibold tracking-[-0.03em]">
              0xtrace Documentation
            </h1>
            <p className="mt-3 mb-0 text-[#71717a] text-[16px] leading-relaxed max-w-[600px]">
              AI observability for LLM applications. Intercept every call,
              visualize prompt deltas, and kill context bloat before it kills
              your budget.
            </p>
          </div>

          {/* ── QUICKSTART ── */}
          <SectionHeading id="quickstart">Quickstart</SectionHeading>
          <p className="text-[14px] leading-relaxed mb-4">
            Get your first trace into the dashboard in under 5 minutes.
          </p>

          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { n: "1", label: "Install the SDK" },
              { n: "2", label: "Wrap your client" },
              { n: "3", label: "See your traces" },
            ].map(({ n, label }) => (
              <div
                key={n}
                className="bg-[#111] border border-[#1f1f1f] rounded-lg p-4"
              >
                <div className="font-mono text-[11px] text-[#3b82f6] mb-2">
                  {n}
                </div>
                <div className="text-white text-[13px] font-medium">
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* ── INSTALLATION ── */}
          <SectionHeading id="installation">Installation</SectionHeading>

          <CodeBlock lang="bash" code="npm install 0xtrace" />

          <p className="text-[14px] leading-relaxed">
            The SDK works with any OpenAI-compatible provider — OpenAI, Groq,
            Together AI, Mistral, and any service that exposes the{" "}
            <code className="font-mono text-[12px] text-[#60a5fa] bg-[#0f1e3a] px-1.5 py-0.5 rounded">
              chat.completions.create
            </code>{" "}
            interface.
          </p>

          <SubHeading id="basic-setup">Basic Setup</SubHeading>

          <CodeBlock
            lang="typescript"
            code={`import OpenAI from "openai";
import { Tracer, wrapOpenAI } from "0xtrace";

const tracer = new Tracer({
  ingestUrl: "https://your-app.vercel.app/api/ingest",
  apiKey:    process.env.INGEST_API_KEY,
  sessionId: crypto.randomUUID(), // groups calls into one agent run
});

const client = wrapOpenAI(new OpenAI(), tracer);

// Use exactly like the original client — nothing else changes
const response = await client.chat.completions.create({
  model:    "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
});`}
          />

          <SubHeading id="with-groq">With Groq</SubHeading>

          <CodeBlock
            lang="typescript"
            code={`import OpenAI from "openai";
import { Tracer, wrapOpenAI } from "0xtrace";

const tracer = new Tracer({
  ingestUrl: "https://your-app.vercel.app/api/ingest",
  apiKey:    process.env.INGEST_API_KEY,
  sessionId: crypto.randomUUID(),
});

// Pass Groq as an OpenAI-compatible client
const client = wrapOpenAI(
  new OpenAI({
    apiKey:  process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  }),
  tracer,
);`}
          />

          <Callout type="tip">
            The ingest URL and API key are found in your project Settings page.
            Set them as environment variables — never hardcode them.
          </Callout>

          {/* ── SDK REFERENCE ── */}
          <SectionHeading id="sdk-reference">SDK Reference</SectionHeading>

          <SubHeading id="tracer-options">Tracer Options</SubHeading>
          <p className="text-[14px] leading-relaxed mb-4">
            Pass these options when constructing a{" "}
            <code className="font-mono text-[12px] text-[#60a5fa] bg-[#0f1e3a] px-1.5 py-0.5 rounded">
              Tracer
            </code>{" "}
            instance.
          </p>

          <div className="rounded-lg border border-[#1f1f1f] overflow-hidden mb-6">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[#1f1f1f] bg-[#0a0a0a]">
                  {["Option", "Type", "", "Description"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-[11px] font-mono text-[#52525b] uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f1f1f] px-4">
                <PropRow
                  name="ingestUrl"
                  type="string"
                  required
                  description="Full URL of your /api/ingest endpoint."
                />
                <PropRow
                  name="apiKey"
                  type="string"
                  required
                  description="Your project API key from the Settings page."
                />
                <PropRow
                  name="sessionId"
                  type="string"
                  description="Groups multiple calls into one agent session. Auto-generated if omitted."
                />
                <PropRow
                  name="metadata"
                  type="Record<string, string>"
                  description="Arbitrary key/value pairs attached to every trace (e.g. userId, environment)."
                />
                <PropRow
                  name="enabled"
                  type="boolean"
                  description="Set false to disable telemetry entirely, e.g. in unit tests. Default: true."
                />
                <PropRow
                  name="timeoutMs"
                  type="number"
                  description="Max ms to wait for the ingest POST before aborting. Default: 5000."
                />
                <PropRow
                  name="onError"
                  type="(err, payload) => void"
                  description="Called when ingest fails after all retries. Defaults to console.warn."
                />
              </tbody>
            </table>
          </div>

          <SubHeading id="wrapOpenAI">wrapOpenAI(client, tracer)</SubHeading>
          <p className="text-[14px] leading-relaxed">
            Wraps an OpenAI client instance with a transparent telemetry proxy.
            Returns a drop-in replacement — same types, same streaming
            behaviour, zero added latency. Works with both standard and
            streaming responses.
          </p>

          <CodeBlock
            lang="typescript"
            code={`import OpenAI from "openai";
import { Tracer, wrapOpenAI } from "0xtrace";

const tracer = new Tracer({ ingestUrl: "...", apiKey: "..." });
const ai     = wrapOpenAI(new OpenAI(), tracer);

// Streaming works identically
const stream = await ai.chat.completions.create({
  model:    "gpt-4o",
  messages,
  stream:   true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`}
          />

          <SubHeading id="flush">tracer.flush()</SubHeading>
          <p className="text-[14px] leading-relaxed">
            Waits for all buffered and in-flight payloads to be delivered. Call
            this before process exit or at the end of integration tests to
            ensure no traces are dropped.
          </p>

          <CodeBlock
            lang="typescript"
            code={`// In tests
afterAll(async () => {
  await tracer.flush();
});

// On process exit
process.on("SIGTERM", async () => {
  await tracer.flush();
  process.exit(0);
});`}
          />

          <Callout type="warning">
            In serverless environments (Vercel, AWS Lambda) the process may be
            frozen before flush completes. The SDK batches and retries
            automatically, so most traces will arrive — but calling flush()
            before returning from a long-running route is good practice.
          </Callout>

          {/* ── DASHBOARD GUIDE ── */}
          <SectionHeading id="dashboard">Dashboard Guide</SectionHeading>

          {[
            {
              name: "Sessions",
              desc: "Every agent run grouped by session ID. Each row shows the model, number of steps, total token usage, cost, average latency, and anomaly status. Click a row to open the session detail.",
            },
            {
              name: "Explorer",
              desc: "Raw call browser — one row per LLM call, not per session. Filter by model, status, or session ID prefix. Sort by any column. Use this to find a specific call when you know its rough timestamp.",
            },
            {
              name: "Diff X-Ray",
              desc: "Step-by-step prompt delta visualizer. Green lines were added to the context, red lines were removed. The metadata panel shows tokens, cost, latency, and context window usage for that specific call.",
            },
            {
              name: "Cost Analysis",
              desc: "14-day spend chart, model breakdown table (cost, tokens, calls, avg latency per model), top 10 sessions by cost, and a latency distribution histogram.",
            },
            {
              name: "Anomalies",
              desc: "Auto-detected and SDK-flagged issues. Four detection types: token explosion (context grew >2.5× session avg), high latency (>5s), session cost spike (>5× account avg), and explicit SDK flags.",
            },
            {
              name: "Replay Engine",
              desc: "Re-fire any captured prompt against any model. Edit the messages, switch the model, and compare outputs side by side. Useful for prompt optimization without re-running your entire agent.",
            },
            {
              name: "Settings",
              desc: "Manage API keys for the active project — generate new keys, revoke compromised ones. The ingest URL and a code snippet are shown here for easy copy-paste into your environment variables.",
            },
          ].map(({ name, desc }) => (
            <div key={name} className="mb-5 pl-4 border-l-2 border-[#1f1f1f]">
              <div className="text-white text-[14px] font-medium mb-1">
                {name}
              </div>
              <p className="m-0 text-[#71717a] text-[13px] leading-relaxed">
                {desc}
              </p>
            </div>
          ))}

          {/* ── SELF-HOSTING ── */}
          <SectionHeading id="self-hosting">Self-Hosting</SectionHeading>
          <p className="text-[14px] leading-relaxed mb-4">
            0xtrace is MIT-licensed and fully self-hostable. You need a Supabase
            project, an Upstash Redis database, and a Vercel account (free tier
            works).
          </p>

          <SubHeading id="env-vars">Environment Variables</SubHeading>

          <CodeBlock
            lang="bash"
            code={`# .env.local
NEXT_PUBLIC_SUPABASE_URL=         # Supabase → Project Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Supabase → Project Settings → API
SUPABASE_SERVICE_ROLE_KEY=        # Supabase → Project Settings → API (secret)
UPSTASH_REDIS_REST_URL=           # Upstash → database → REST API
UPSTASH_REDIS_REST_TOKEN=         # Upstash → database → REST API
CRON_SECRET=                      # Any long random string you generate
NEXT_PUBLIC_APP_URL=              # Your deployment URL, e.g. https://0xtrace-mu.vercel.app
OPENAI_API_KEY=                   # Required for Replay Engine → OpenAI models
GROQ_API_KEY=                     # Required for Replay Engine → Groq models`}
          />

          <SubHeading id="database-setup">Database Setup</SubHeading>
          <p className="text-[14px] leading-relaxed mb-3">
            Run the migrations in your Supabase SQL Editor. The schema creates:
          </p>

          <div className="space-y-2 mb-4">
            {[
              {
                table: "profiles",
                desc: "Auto-created on GitHub OAuth signup via trigger",
              },
              {
                table: "projects",
                desc: "Workspace isolation boundary, one per developer team",
              },
              { table: "api_keys", desc: "Hashed keys scoped to a project" },
              {
                table: "llm_calls",
                desc: "One row per LLM call with full metrics",
              },
              {
                table: "prompt_snapshots",
                desc: "Keyframe + delta storage for prompt arrays",
              },
            ].map(({ table, desc }) => (
              <div key={table} className="flex items-start gap-3 text-[13px]">
                <code className="font-mono text-[#60a5fa] text-[12px] flex-none mt-0.5">
                  {table}
                </code>
                <span className="text-[#71717a]">{desc}</span>
              </div>
            ))}
          </div>

          <Callout type="info">
            Row Level Security is enabled on all tables. Users can only access
            rows where their auth.uid() matches the user_id on the projects
            table. The ingestion pipeline uses the service role key to bypass
            RLS after validating the API key.
          </Callout>

          <SubHeading id="cron">Cron Setup</SubHeading>
          <p className="text-[14px] leading-relaxed mb-3">
            The drain-queue route runs every minute. On Vercel Hobby, cron jobs
            are limited to daily — use{" "}
            <a
              href="https://cron-job.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#3b82f6] hover:text-[#60a5fa] no-underline"
            >
              cron-job.org
            </a>{" "}
            (free) to call it every minute instead.
          </p>

          <CodeBlock
            lang="bash"
            code={`# cron-job.org configuration
URL:      https://your-app.vercel.app/api/cron/drain-queue
Schedule: Every 1 minute
Header:   Authorization: Bearer YOUR_CRON_SECRET`}
          />

          {/* ── ARCHITECTURE ── */}
          <SectionHeading id="architecture">Architecture</SectionHeading>

          <CodeBlock
            lang="text"
            code={`Your AI App
  └── wrapOpenAI(client, tracer)
        │  Proxy intercepts chat.completions.create
        │  Telemetry fires in microtask — <2ms overhead
        ▼
  POST /api/ingest
        │  Validates API key (SHA-256 hash lookup)
        │  Resolves project_id from key
        │  Pushes trace to Redis queue
        ▼
  Upstash Redis (trace:queue)
        │  Absorbs burst traffic & infinite agent loops
        │  Never blocks the caller
        ▼
  GET /api/cron/drain-queue  (runs every minute)
        │  Pops up to 100 traces atomically
        │  Step 1 → stores full prompt snapshot
        │  Step 2+ → stores JSON diff only (~85% storage reduction)
        │  Inserts into llm_calls + prompt_snapshots
        ▼
  Supabase PostgreSQL
        │  All rows scoped to project_id
        │  RLS enforces tenant isolation
        ▼
  Dashboard
        └── Scoped to active project via oxtr_project cookie`}
          />

          <SubHeading id="diff-storage">Keyframe + Delta Storage</SubHeading>
          <p className="text-[14px] leading-relaxed">
            Most observability tools store the full prompt array on every step.
            For a 10-step agent, that&apos;s 10 copies of an ever-growing JSON
            blob. 0xtrace uses a keyframe + delta model instead:
          </p>

          <div className="my-4 grid grid-cols-2 gap-3">
            <div className="bg-[#1f0a0a] border border-[#4a1111] rounded-lg p-4">
              <div className="text-[#f43f5e] text-[12px] font-mono uppercase tracking-wider mb-2">
                Without 0xtrace
              </div>
              <div className="text-[#a1a1aa] text-[13px] leading-relaxed">
                Step 1: 500 tokens stored
                <br />
                Step 2: 2,800 tokens stored
                <br />
                Step 3: 12,400 tokens stored
                <br />
                Step 4: 34,000 tokens stored
                <br />
                Step 5: 84,200 tokens stored
                <br />
                <span className="text-[#f43f5e]">
                  Total: ~134k tokens in DB
                </span>
              </div>
            </div>
            <div className="bg-[#052e16] border border-[#064e3b] rounded-lg p-4">
              <div className="text-[#10b981] text-[12px] font-mono uppercase tracking-wider mb-2">
                With 0xtrace
              </div>
              <div className="text-[#a1a1aa] text-[13px] leading-relaxed">
                Step 1: 500 tokens stored (keyframe)
                <br />
                Step 2: ~40 tokens stored (delta)
                <br />
                Step 3: ~60 tokens stored (delta)
                <br />
                Step 4: ~80 tokens stored (delta)
                <br />
                Step 5: ~90 tokens stored (delta)
                <br />
                <span className="text-[#10b981]">Total: ~770 tokens in DB</span>
              </div>
            </div>
          </div>

          {/* ── FAQ ── */}
          <SectionHeading id="faq">FAQ</SectionHeading>

          {[
            {
              q: "Does the SDK add latency to my LLM calls?",
              a: "No. Telemetry fires in a microtask (Promise.resolve().then()) after your code continues. The measured overhead is under 2ms even on high-frequency loops.",
            },
            {
              q: "What happens if the ingest endpoint is down?",
              a: "The SDK retries up to 3 times with exponential backoff (200ms → 400ms → 800ms). If all retries fail, the onError callback fires and your application continues normally. Your agent is never blocked.",
            },
            {
              q: "What happens if my agent loops infinitely?",
              a: "The Redis queue absorbs the traffic. The cron drains 100 traces per minute regardless of how many arrive. Your Supabase database is never hit directly from user traffic.",
            },
            {
              q: "Is my prompt data stored in plaintext?",
              a: "Prompt arrays are stored in Supabase under your own project's service role key. API keys are SHA-256 hashed before storage — the plaintext is shown once and never persisted. You control the database.",
            },
            {
              q: "Can I use this with Anthropic / Gemini / other providers?",
              a: "Any provider that exposes an OpenAI-compatible API (chat.completions.create) works out of the box. Native Anthropic SDK support is on the roadmap.",
            },
            {
              q: "How do I group calls from one agent run together?",
              a: "Pass a sessionId when constructing the Tracer. All calls from that instance are grouped under the same session in the dashboard. Use crypto.randomUUID() per agent invocation.",
            },
          ].map(({ q, a }) => (
            <div key={q} className="mb-6 pl-4 border-l-2 border-[#1f1f1f]">
              <div className="text-white text-[14px] font-medium mb-1.5">
                {q}
              </div>
              <p className="m-0 text-[#71717a] text-[13px] leading-relaxed">
                {a}
              </p>
            </div>
          ))}

          {/* ── Footer ── */}
          <div className="mt-16 pt-8 border-t border-[#1f1f1f] flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="font-mono text-white text-[14px]">
                0x<span className="text-[#a1a1aa]">trace</span>
              </div>
              <div className="text-[#52525b] text-[12px] mt-1">
                MIT licensed · open source
              </div>
            </div>
            <div className="flex items-center gap-6 text-[13px]">
              <a
                href="https://github.com/Sidhant0707/0xtrace"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#71717a] hover:text-white transition-colors no-underline"
              >
                GitHub
              </a>
              <a
                href="mailto:buildwithsidhant@gmail.com"
                className="text-[#71717a] hover:text-white transition-colors no-underline"
              >
                Contact
              </a>
              <Link
                href="/dashboard"
                className="text-[#3b82f6] hover:text-[#60a5fa] transition-colors no-underline"
              >
                Dashboard →
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
