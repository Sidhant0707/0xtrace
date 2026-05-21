// scripts/test-agent.ts
// Run with: npx tsx scripts/test-agent.ts

import OpenAI from "openai";
import Groq   from "groq-sdk";
import { Tracer } from "../packages/sdk/src/core/tracer";
import { wrapOpenAI } from "../packages/sdk/src/wrappers/openai";

const groq   = new Groq({ apiKey: process.env.GROQ_API_KEY });
const tracer = new Tracer({
  ingestUrl: "http://localhost:3000/api/ingest",
  apiKey:    process.env.INGEST_API_KEY,
  sessionId: `test-${Date.now()}`,
});

const ai = wrapOpenAI(groq as unknown as OpenAI, tracer);

const messages: OpenAI.ChatCompletionMessageParam[] = [
  { role: "system", content: "You are a concise assistant." },
  { role: "user",   content: "What is a binary search tree?" },
];

for (let step = 1; step <= 5; step++) {
  console.log(`\n── Step ${step} ──`);

  const result = await ai.chat.completions.create({
    model:    "llama-3.1-8b-instant",
    messages,
  });

  const reply = result.choices[0].message.content ?? "";
  console.log("Response:", reply.slice(0, 80) + "...");

  // Add the assistant reply + next user message to grow the context
  messages.push({ role: "assistant", content: reply });
  messages.push({ role: "user", content: `Now explain step ${step + 1} in more depth.` });
}

await tracer.flush();
console.log("\n✅ Done — drain the queue to see all 5 steps in the dashboard");