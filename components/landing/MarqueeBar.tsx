"use client";
import { motion } from "framer-motion";

const ITEMS = [
  "OpenAI",
  "Anthropic",
  "Groq",
  "LangChain",
  "AutoGPT",
  "CrewAI",
  "Mistral",
  "Ollama",
  "LlamaIndex",
  "GPT-4o",
  "Claude Sonnet",
  "Gemini Pro",
];

function MarqueeTrack() {
  return (
    <motion.div
      className="flex items-center gap-12 shrink-0"
      animate={{ x: ["0%", "-50%"] }}
      transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
    >
      {[...ITEMS, ...ITEMS].map((item, i) => (
        <span
          key={i}
          className="font-mono text-[13px] text-[#71717a] whitespace-nowrap"
        >
          {item}
        </span>
      ))}
    </motion.div>
  );
}

export function MarqueeBar() {
  return (
    <div className="relative border-y border-white/[0.04] py-4 overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-[#080808] to-transparent z-10" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-[#080808] to-transparent z-10" />
      <div className="flex overflow-hidden">
        <MarqueeTrack />
      </div>
    </div>
  );
}
