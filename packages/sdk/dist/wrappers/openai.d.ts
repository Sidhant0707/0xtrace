import OpenAI from "openai";
import type { Tracer } from "../core/tracer";
/**
 * Wraps an OpenAI client with a transparent telemetry layer.
 *
 * @param client  The original `new OpenAI(...)` instance.
 * @param tracer  A configured `Tracer` instance (owns the session + dispatch).
 * @returns       A Proxy of the client — drop-in replacement, same types.
 *
 * @example
 * import OpenAI from "openai";
 * import { Tracer, wrapOpenAI } from "@prompt-tracer/sdk";
 *
 * const openai  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 * const tracer  = new Tracer({ ingestUrl: "https://your-app.com/api/ingest" });
 * const ai      = wrapOpenAI(openai, tracer);
 *
 * // Use exactly like the original client — streaming, tools, everything works.
 * const res = await ai.chat.completions.create({ model: "gpt-4o", messages });
 */
export declare function wrapOpenAI(client: OpenAI, tracer: Tracer): OpenAI;
