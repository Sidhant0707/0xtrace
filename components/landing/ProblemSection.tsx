"use client";
import { useRef } from "react";
import { useInView, motion } from "framer-motion";
import { FadeIn } from "./FadeIn";

interface StatBlockProps {
  number: string | number;
  label: string;
  detail: string;
  opacity: string;
  punchline?: string;
  delay: number;
}

function StatBlock({
  number,
  label,
  detail,
  opacity,
  punchline,
  delay,
}: StatBlockProps) {
  return (
    <FadeIn delay={delay} direction="up">
      <div className="py-10 border-b border-white/[0.04] last:border-0">
        <div
          className={`font-mono text-[52px] font-semibold leading-none ${opacity}`}
        >
          {number}
        </div>
        <div className="mt-3 text-[14px] text-[#a1a1aa]">{label}</div>
        <div className="mt-2 font-mono text-[12px] text-[#71717a]">
          {detail}
        </div>
        {punchline && (
          <div className="mt-4 text-[15px] font-medium text-[#60a5fa]">
            {punchline}
          </div>
        )}
      </div>
    </FadeIn>
  );
}

export function ProblemSection() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="relative py-[120px] px-6 overflow-hidden" ref={ref}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 1.2, delay: 0.2 }}
        aria-hidden="true"
        className="pointer-events-none absolute right-[-4%] top-1/2 -translate-y-1/2 font-mono font-semibold text-[#0f0f0f]"
        style={{
          fontSize: "clamp(120px, 18vw, 240px)",
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        39×
      </motion.div>

      <div className="relative z-10 max-w-[1120px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
        <FadeIn direction="left">
          <div>
            <p className="m-0 font-mono text-[12px] text-[#60a5fa] uppercase tracking-[3px]">
              The Problem
            </p>
            <h2 className="m-0 mt-4 text-[clamp(30px,3.5vw,44px)] font-semibold text-white leading-[1.1] tracking-[-0.03em]">
              Your agent doesn&apos;t
              <br />
              know it&apos;s bleeding.
            </h2>
            <p className="mt-5 mb-0 text-[16px] text-[#a1a1aa] leading-[1.8] max-w-[380px]">
              Every step in a multi-step agent re-sends the entire conversation
              history. By step 10, you&apos;re paying 39× what you paid on step
              1. No alert fires. No log appears.
            </p>

            <div className="mt-10">
              <div className="font-mono text-[11px] text-[#60a5fa] uppercase tracking-[2px] mb-3">
                Token accumulation · 10 steps
              </div>
              <div className="space-y-2">
                {[
                  { step: 1, tokens: 500, pct: 0.6 },
                  { step: 3, tokens: 2_800, pct: 3.3 },
                  { step: 5, tokens: 12_400, pct: 14.8 },
                  { step: 7, tokens: 34_000, pct: 40.5 },
                  { step: 10, tokens: 84_200, pct: 100 },
                ].map(({ step, tokens, pct }, i) => (
                  <div key={step} className="flex items-center gap-3">
                    <span className="font-mono text-[11px] text-[#71717a] w-8 text-right shrink-0">
                      {step}
                    </span>
                    <div className="flex-1 h-1.5 bg-[#111] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={inView ? { width: `${pct}%` } : { width: 0 }}
                        transition={{
                          duration: 0.8,
                          delay: 0.3 + i * 0.1,
                          ease: "easeOut",
                        }}
                        className="h-full rounded-full"
                        style={{
                          backgroundColor:
                            pct > 60
                              ? "#f43f5e"
                              : pct > 20
                                ? "#f59e0b"
                                : "#3b82f6",
                        }}
                      />
                    </div>
                    <span className="font-mono text-[11px] text-[#a1a1aa] w-14 shrink-0">
                      {tokens >= 1000
                        ? `${(tokens / 1000).toFixed(0)}k`
                        : tokens}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </FadeIn>

        <div>
          <StatBlock
            number="16,700%"
            label="context growth"
            detail="Step 1: 500 tokens → Step 10: 84,000 tokens"
            opacity="text-white"
            delay={0.1}
          />
          <StatBlock
            number="39×"
            label="cost multiplier"
            detail="$0.004 per call → $0.158 per call in 9 steps"
            opacity="text-[#e4e4e7]"
            delay={0.2}
          />
          <StatBlock
            number="0"
            label="visibility"
            detail="No logs. No diffs. No way to know."
            opacity="text-[#f43f5e]"
            punchline="Until now."
            delay={0.3}
          />
        </div>
      </div>
    </section>
  );
}
