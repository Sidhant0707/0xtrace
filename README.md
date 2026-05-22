# 0xtrace

![0xtrace Dashboard Preview](./public/0xtrace-dashboard-preview.png)
A high-performance observability and telemetry dashboard for LLM applications.

0xtrace is engineered to solve a specific, expensive problem in AI engineering: **context window bloat**. It provides an asynchronous ingestion pipeline and a strict visualization layer to monitor latency, token usage, and prompt drift in production environments.

## The Problem

When building complex LLM agents, context windows silently expand as system prompts grow and tool outputs inject massive JSON payloads. This leads to exponential cost increases and degraded inference latency. Developers often cannot see exactly _what_ was added to the context array between Step 4 and Step 5 of an agent loop.

## The Solution

0xtrace intercepts and logs every LLM call asynchronously, storing full prompt structures in a Relational Database. The dashboard features a **Diff X-Ray Visualizer** that calculates and renders the exact JSON deltas between steps, exposing rogue context injections instantly.

## Core Architecture

- **Asynchronous Telemetry:** LLM calls are pushed to a Redis queue to ensure zero latency overhead on the main application thread.
- **The Drain Pipeline:** A secure CRON route batches and flushes trace data from Redis into a highly normalized Supabase PostgreSQL schema.
- **Storage Optimization Engine:** Prevents database bloat by storing the initial prompt array as a full snapshot, and subsequent steps as strict JSON Patch deltas (`JsonDiffDelta`).
- **The Replay Visualizer:** A strictly typed React Server Component (RSC) split-screen interface displaying an execution timeline and a syntax-highlighted context diff.

## Tech Stack

- **Framework:** Next.js (App Router, React Server Components)
- **Database:** Supabase (PostgreSQL)
- **Language:** Strict TypeScript (Zero `any` policies)
- **Styling:** Tailwind CSS (Dark-mode, developer-focused aesthetic)

## Quick Start

### 1. Clone the repository

```bash
git clone [https://github.com/Sidhant0707/0xtrace.git](https://github.com/Sidhant0707/0xtrace.git)
cd 0xtrace
npm install
2. Environment Variables
Create a .env.local file in the root directory.
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token
3. Initialize the Database
Run the provided SQL migrations in your Supabase SQL Editor to generate the llm_calls and prompt_snapshots tables.

4. Start the Application
npm run dev
Contact & Author
Sidhant Kumar

Email: buildwithsidhant@gmail.com

LinkedIn: linkedin.com/in/sidhant07
```
