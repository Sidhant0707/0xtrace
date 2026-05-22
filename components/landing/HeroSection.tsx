"use client";
import {
  motion,
  useMotionValue,
  useSpring,
  AnimatePresence,
} from "framer-motion";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, AlertTriangle, CheckCircle2, Zap } from "lucide-react";
import { FaGithub } from "react-icons/fa";

interface TraceRow {
  id: string;
  session: string;
  model: string;
  steps: number;
  cost: string;
  ms: number;
  status: "ok" | "anomaly";
}

const FEED_ROWS: TraceRow[] = [
  {
    id: "1",
    session: "sess-a3f1",
    model: "gpt-4o",
    steps: 3,
    cost: "$0.005",
    ms: 820,
    status: "ok",
  },
  {
    id: "2",
    session: "sess-b2c4",
    model: "gpt-4o-mini",
    steps: 5,
    cost: "$0.012",
    ms: 640,
    status: "ok",
  },
  {
    id: "3",
    session: "sess-9e4d",
    model: "gpt-4o",
    steps: 12,
    cost: "$2.10",
    ms: 2100,
    status: "anomaly",
  },
  {
    id: "4",
    session: "sess-f7a2",
    model: "claude-3-5",
    steps: 4,
    cost: "$0.031",
    ms: 910,
    status: "ok",
  },
  {
    id: "5",
    session: "sess-c1e9",
    model: "gpt-4o",
    steps: 8,
    cost: "$0.089",
    ms: 1340,
    status: "ok",
  },
];

const WORDS_LINE1 = ["Intercept.", "Visualize.", "Fix."];
const WORDS_LINE2 = ["Before your agent", "breaks production."];

function StaggerWord({ word, delay }: { word: string; delay: number }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 32, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.7, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      className="inline-block mr-[0.25em]"
    >
      {word}
    </motion.span>
  );
}

function CostCounter() {
  const raw = useMotionValue(0);
  const smooth = useSpring(raw, { stiffness: 60, damping: 20 });
  const [display, setDisplay] = useState("0.000");

  useEffect(() => {
    const target = 2.847;
    raw.set(target);
    return smooth.on("change", (v) => setDisplay(v.toFixed(3)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Colored the total cost to emerald so it pops
  return (
    <span className="font-mono text-[28px] font-semibold text-[#10b981] tabular-nums">
      ${display}
    </span>
  );
}

const BAR_DEFS = [
  { h: 8, color: "#3f3f46" },
  { h: 18, color: "#52525b" },
  { h: 34, color: "#71717a" },
  { h: 62, color: "#a1a1aa" },
  { h: 100, color: "#3b82f6" }, // Highlight the final jump in Blue
];

function MiniChart() {
  return (
    <div className="flex items-end gap-1 h-10">
      {BAR_DEFS.map((bar, i) => (
        <motion.div
          key={i}
          initial={{ height: 0 }}
          animate={{ height: `${bar.h}%` }}
          transition={{ duration: 0.5, delay: 0.8 + i * 0.1, ease: "easeOut" }}
          className="flex-1 rounded-t-[2px]"
          style={{ backgroundColor: bar.color, minHeight: 2 }}
        />
      ))}
    </div>
  );
}

export function HeroSection() {
  const [visibleRows, setVisibleRows] = useState<TraceRow[]>([]);
  const [rowIndex, setRowIndex] = useState(0);

  useEffect(() => {
    if (rowIndex >= FEED_ROWS.length) return;
    const timer = setTimeout(
      () => {
        setVisibleRows((prev) => [...prev, FEED_ROWS[rowIndex]]);
        setRowIndex((i) => i + 1);
      },
      1200 + rowIndex * 700,
    );
    return () => clearTimeout(timer);
  }, [rowIndex]);

  return (
    <section className="relative min-h-screen flex items-center pt-[58px] px-6 overflow-hidden">
      {/* ── NEW: Added a subtle blue radial glow to break up the flat black ── */}

      <div className="relative z-10 max-w-[1120px] w-full mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center py-20">
        <div>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 mb-8 px-3 py-1.5 rounded-full border border-[#3b82f6]/20 bg-[#3b82f6]/10"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-pulse" />
            <span className="font-mono text-[12px] text-[#3b82f6]">
              Open beta · v0.1.0
            </span>
          </motion.div>

          <h1 className="m-0 leading-[1.0] tracking-[-0.04em]">
            <div className="text-[clamp(44px,5.5vw,72px)] font-semibold text-white overflow-hidden">
              {WORDS_LINE1.map((w, i) => (
                <StaggerWord key={w} word={w} delay={0.1 + i * 0.12} />
              ))}
            </div>

            <div className="text-[clamp(44px,5.5vw,72px)] font-semibold overflow-hidden">
              <StaggerWord word={WORDS_LINE2[0]} delay={0.46} />
            </div>
            {/* Brightened from #3f3f46 to #71717a */}
            <div className="text-[clamp(44px,5.5vw,72px)] font-semibold text-[#71717a] overflow-hidden">
              <StaggerWord word={WORDS_LINE2[1]} delay={0.56} />
            </div>
          </h1>

          {/* Brightened from #52525b to #a1a1aa */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.72 }}
            className="mt-6 mb-0 text-[17px] text-[#a1a1aa] leading-[1.75] max-w-[440px]"
          >
            Open-source AI observability. Every token, every dollar, every
            context diff — visible in real time.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mt-8"
          >
            <Link
              href="/login"
              // Changed to Blue Primary CTA
              className="group inline-flex items-center gap-2 h-11 px-6 rounded-lg bg-[#3b82f6] text-white text-[14px] font-semibold no-underline hover:bg-[#2563eb] active:scale-[0.97] transition-all duration-150 shadow-[0_0_20px_rgba(59,130,246,0.3)]"
            >
              Get Early Access
              <ArrowRight
                size={14}
                className="group-hover:translate-x-0.5 transition-transform duration-150"
              />
            </Link>
            <Link
              href="https://github.com/Sidhant0707/0xtrace"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 h-11 px-5 rounded-lg border border-white/[0.1] text-[14px] text-[#a1a1aa] no-underline hover:text-white hover:border-white/[0.2] transition-all duration-150"
            >
              <FaGithub size={15} />
              View on GitHub
            </Link>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 1.1 }}
            // Brightened from #2a2a2a to #71717a
            className="mt-6 mb-0 font-mono text-[12px] text-[#71717a]"
          >
            MIT licensed · self-hostable · TypeScript
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 32 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            duration: 0.8,
            delay: 0.4,
            ease: [0.21, 0.47, 0.32, 0.98],
          }}
          className="flex flex-col gap-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-5 border border-white/[0.08] bg-[#0d0d0d] shadow-lg">
              {/* Bumped text size, made it blue to pop */}
              <div className="font-mono text-[11px] text-[#3b82f6] uppercase tracking-[2px] mb-3">
                Session cost
              </div>
              <CostCounter />
              <div className="mt-1 font-mono text-[12px] text-[#71717a]">
                across 12 steps
              </div>
            </div>

            <div className="rounded-xl p-5 border border-white/[0.08] bg-[#0d0d0d] shadow-lg">
              <div className="font-mono text-[11px] text-[#3b82f6] uppercase tracking-[2px] mb-3">
                Context growth
              </div>
              <MiniChart />
              <div className="mt-2 font-mono text-[12px] text-[#71717a]">
                500 → 84k tokens
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.08] overflow-hidden bg-[#0d0d0d] shadow-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-[#3b82f6]" />
                <span className="font-mono text-[12px] text-[#e4e4e7]">
                  Live traces
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                <span className="font-mono text-[11px] text-rose-500">
                  LIVE
                </span>
              </div>
            </div>

            <div className="px-4 py-2 min-h-[140px]">
              <AnimatePresence>
                {visibleRows.map((row) => (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0, y: -8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0"
                  >
                    <div className="flex items-center gap-2.5">
                      {row.status === "ok" ? (
                        <CheckCircle2 size={14} className="text-[#10b981]" />
                      ) : (
                        <AlertTriangle size={14} className="text-[#f59e0b]" />
                      )}
                      <span className="font-mono text-[13px] text-[#e4e4e7]">
                        {row.session}
                      </span>
                      <span className="font-mono text-[11px] text-[#a1a1aa] bg-[#1a1a1a] px-1.5 rounded border border-[#262626]">
                        {row.model}
                      </span>
                      {row.status === "anomaly" && (
                        <span className="font-mono text-[10px] text-[#f59e0b] bg-[#2d1a00] border border-[#451a03] px-1.5 py-0.5 rounded">
                          anomaly
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[12px] text-[#71717a]">
                        {row.steps} steps
                      </span>
                      <span
                        className={`font-mono text-[12px] ${row.status === "anomaly" ? "text-[#f59e0b]" : "text-[#10b981]"}`}
                      >
                        {row.cost}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {visibleRows.length === 0 && (
                <div className="flex items-center gap-2 py-3">
                  <span className="w-1 h-1 rounded-full bg-[#3b82f6] animate-pulse" />
                  <span className="font-mono text-[12px] text-[#a1a1aa]">
                    Waiting for traces...
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.04] bg-[#080808]">
              <span className="font-mono text-[11px] text-[#71717a]">
                847 calls intercepted
              </span>
              <span className="font-mono text-[11px] text-[#71717a]">
                3 anomalies flagged
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
