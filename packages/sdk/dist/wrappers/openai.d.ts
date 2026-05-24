import OpenAI from "openai";
import type { Tracer } from "../core/tracer";
export declare function wrapOpenAI(client: OpenAI, tracer: Tracer): OpenAI;
