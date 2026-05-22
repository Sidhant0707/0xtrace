"use client";
import { useState, ReactNode } from "react";
import {
  Copy,
  Check,
  Layers,
  GitCompare,
  TrendingUp,
  RotateCcw,
} from "lucide-react";
import { motion } from "framer-motion";
import { FadeIn } from "./FadeIn";

const CODE_LINES = [
  {
    tokens: ["import ", "OpenAI ", "from ", '"openai"', ";"],
    colors: ["tok-c1", "tok-c2", "tok-c1", "tok-c3", "tok-c1"],
  },
  {
    tokens: [
      "import ",
      "{ Tracer, wrapOpenAI } ",
      "from ",
      '"@prompt-tracer/sdk"',
      ";",
    ],
    colors: ["tok-c1", "tok-c2", "tok-c1", "tok-c3", "tok-c1"],
  },
  { tokens: [""], colors: ["tok-c1"] },
  {
    tokens: ["const ", "tracer ", "= new ", "Tracer", "({"],
    colors: ["tok-c1", "tok-c4", "tok-c1", "tok-c2", "tok-c3"],
  },
  {
    tokens: ["  ingestUrl: ", '"https://app.com/api/ingest"', ","],
    colors: ["tok-c3", "tok-c1", "tok-c3"],
  },
  {
    tokens: ["  sessionId: ", "crypto", ".", "randomUUID", "(),"],
    colors: ["tok-c3", "tok-c2", "tok-c3", "tok-c2", "tok-c3"],
  },
  { tokens: ["});"], colors: ["tok-c3"] },
  { tokens: [""], colors: ["tok-c1"] },
  {
    tokens: ["const ", "ai ", "= ", "wrapOpenAI", "(openai, tracer);"],
    colors: ["tok-c1", "tok-c4", "tok-c1", "tok-c2", "tok-c3"],
  },
  { tokens: [""], colors: ["tok-c1"] },
  {
    tokens: ["// Every call is now traced. Nothing else changes."],
    colors: ["tok-c5"],
  },
  {
    tokens: [
      "const ",
      "res ",
      "= await ",
      "ai.chat.completions.",
      "create",
      "({",
    ],
    colors: ["tok-c1", "tok-c4", "tok-c1", "tok-c3", "tok-c2", "tok-c3"],
  },
  {
    tokens: ["  model: ", '"gpt-4o"', ","],
    colors: ["tok-c3", "tok-c1", "tok-c3"],
  },
  { tokens: ["  messages,"], colors: ["tok-c3"] },
  { tokens: ["});"], colors: ["tok-c3"] },
];

interface Card {
  category: string;
  title: string;
  desc: string;
  icon: ReactNode;
  wide?: boolean;
  soon?: boolean;
}

const RAW_CODE = `import OpenAI from "openai";
import { Tracer, wrapOpenAI } from "@prompt-tracer/sdk";

const tracer = new Tracer({
  ingestUrl: "https://app.com/api/ingest",
  sessionId: crypto.randomUUID(),
});

const ai = wrapOpenAI(new OpenAI(), tracer);

// Every call is now traced. Nothing else changes.
const res = await ai.chat.completions.create({
  model: "gpt-4o",
  messages,
});`;

export function CodeSection() {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(RAW_CODE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="py-[120px] px-6">
      <div className="max-w-[1120px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
        <FadeIn direction="left">
          <div>
            <p className="m-0 font-mono text-[12px] text-[#60a5fa] uppercase tracking-[3px]">
              Integration
            </p>
            <h2 className="m-0 mt-4 text-[clamp(28px,3.5vw,44px)] font-semibold text-white leading-[1.1] tracking-[-0.03em]">
              Drop-in.
              <br />
              Non-blocking.
              <br />
              <span className="text-[#71717a]">Zero latency added.</span>
            </h2>
            <p className="mt-5 mb-0 text-[16px] text-[#a1a1aa] leading-[1.8]">
              JavaScript Proxy objects intercept calls — no monkey-patching.
              Telemetry fires on the microtask queue after your code continues.
              Your agent never slows down.
            </p>
            <div className="mt-8 space-y-4">
              {[
                "Works with streaming responses",
                "Handles infinite agent loops safely",
                "Automatic retry with exponential backoff",
                "Full TypeScript types preserved",
              ].map((item) => (
                <motion.div
                  key={item}
                  whileHover={{ x: 4 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-3 text-[14px] text-[#a1a1aa] cursor-default"
                >
                  <span className="text-[#60a5fa] font-mono">→</span>
                  {item}
                </motion.div>
              ))}
            </div>
          </div>
        </FadeIn>

        <FadeIn direction="right" delay={0.1}>
          <div className="rounded-xl overflow-hidden border border-white/[0.06] bg-[#0d0d0d]/80 backdrop-blur-sm shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2a2a2a]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#2a2a2a]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#2a2a2a]" />
              </div>
              <span className="font-mono text-[11px] text-[#71717a]">
                tracer.ts
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 font-mono text-[11px] text-[#71717a] hover:text-[#e4e4e7] transition-colors duration-150 cursor-pointer bg-transparent border-none p-0"
              >
                {copied ? (
                  <Check size={12} className="text-[#10b981]" />
                ) : (
                  <Copy size={12} />
                )}
                {copied ? (
                  <span className="text-[#10b981]">Copied</span>
                ) : (
                  "Copy"
                )}
              </button>
            </div>
            <pre className="m-0 p-5 overflow-x-auto leading-[1.8]">
              <code>
                {CODE_LINES.map((line, li) => (
                  <div key={li} className="font-mono text-[13px]">
                    {line.tokens.map((token, ti) => (
                      <span key={ti} className={line.colors[ti] || "tok-c1"}>
                        {token}
                      </span>
                    ))}
                  </div>
                ))}
              </code>
            </pre>
          </div>
        </FadeIn>
      </div>
      <style jsx>{`
        .tok-c1 {
          color: #71717a;
        } /* Keywords/syntax */
        .tok-c2 {
          color: #e4e4e7;
        } /* Classes/Variables */
        .tok-c3 {
          color: #a1a1aa;
        } /* Strings/Punctuation */
        .tok-c4 {
          color: #60a5fa;
        } /* Const/Let/Special */
        .tok-c5 {
          color: #52525b;
        } /* Comments */
      `}</style>
    </section>
  );
}

const CARDS = [
  {
    category: "INTERCEPT",
    title: "Proxy-based capture",
    desc: "Native JavaScript Proxy wraps your LLM client. No monkey-patching. Original types fully preserved. Streaming works identically.",
    icon: <Layers size={18} className="text-[#60a5fa]" />,
    wide: true,
  },
  {
    category: "VISIBILITY",
    title: "Context diff viewer",
    desc: "See exactly which messages were added or removed at every step. Stored as diffs — 85% storage reduction.",
    icon: <GitCompare size={18} className="text-[#60a5fa]" />,
  },
  {
    category: "DETECTION",
    title: "Cost anomaly engine",
    desc: "Automatic classification of normal, spike, and error steps. Flagged the moment context growth exceeds your session baseline.",
    icon: <TrendingUp size={18} className="text-[#60a5fa]" />,
  },
  {
    category: "REPLAY",
    title: "Prompt replay engine",
    desc: "Re-fire any captured prompt against any model. A/B compare outputs. Optimize without re-running your entire agent.",
    icon: <RotateCcw size={18} className="text-[#71717a]" />,
    soon: true,
  },
];

interface BentoCardProps {
  card: Card;
  index: number;
}

function BentoCardComponent({ card, index }: BentoCardProps) {
  return (
    <FadeIn delay={index * 0.08} direction="up">
      <motion.div
        whileHover={{ borderColor: "rgba(96, 165, 250, 0.3)", y: -2 }}
        transition={{ duration: 0.2 }}
        className={[
          "relative rounded-xl border p-7 h-full bg-[#0d0d0d]/80 backdrop-blur-sm border-white/[0.05] group",
          card.wide ? "md:col-span-2" : "",
        ].join(" ")}
      >
        {card.soon && (
          <div className="absolute top-5 right-5 font-mono text-[10px] text-[#60a5fa] bg-[#3b82f6]/10 border border-[#3b82f6]/20 px-2 py-0.5 rounded">
            SOON
          </div>
        )}
        <div className="flex items-center gap-3 mb-5">
          {card.icon}
          <span className="font-mono text-[11px] text-[#60a5fa] uppercase tracking-[2.5px]">
            {card.category}
          </span>
        </div>
        <h3
          className={[
            "m-0 mb-3 text-[18px] font-semibold leading-tight transition-colors",
            card.soon ? "text-[#a1a1aa] group-hover:text-white" : "text-white",
          ].join(" ")}
        >
          {card.title}
        </h3>
        <p
          className={[
            "m-0 text-[14px] leading-[1.75] transition-colors",
            card.soon
              ? "text-[#71717a] group-hover:text-[#a1a1aa]"
              : "text-[#a1a1aa]",
          ].join(" ")}
        >
          {card.desc}
        </p>
      </motion.div>
    </FadeIn>
  );
}

export function BentoFeatures() {
  return (
    <section className="py-[120px] px-6 border-y border-white/[0.04]">
      <div className="max-w-[1000px] mx-auto">
        <FadeIn direction="up">
          <div className="text-center mb-14">
            <p className="m-0 font-mono text-[12px] text-[#60a5fa] uppercase tracking-[3px]">
              Features
            </p>
            <h2 className="m-0 mt-4 text-[clamp(28px,3.5vw,44px)] font-semibold text-white leading-[1.1] tracking-[-0.03em]">
              Everything you need
              <br />
              <span className="text-[#71717a]">to stop flying blind.</span>
            </h2>
          </div>
        </FadeIn>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <BentoCardComponent card={CARDS[0]} index={0} />
          </div>
          <BentoCardComponent card={CARDS[1]} index={1} />
          <BentoCardComponent card={CARDS[2]} index={2} />
          <div className="md:col-span-2">
            <BentoCardComponent card={CARDS[3]} index={3} />
          </div>
        </div>
      </div>
    </section>
  );
}
