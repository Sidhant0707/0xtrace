"use client";
import { motion } from "framer-motion";
import {
  Zap,
  Database,
  Search,
  Shield,
  GitCommit,
  Activity,
} from "lucide-react";

const FEATURES = [
  {
    icon: <Zap size={16} />,
    category: "INTERCEPT",
    title: "Zero-Latency Proxy",
    description:
      "Intercept calls without slowing down your agent. The SDK queues telemetry to a background microtask, ensuring 0ms overhead on critical paths.",
  },
  {
    icon: <Database size={16} />,
    category: "STORAGE",
    title: "Diff-Only Postgres",
    description:
      "Stop saving 100kb JSON blobs per step. 0xtrace reconstructs context windows using diffs, slashing database storage costs by up to 85%.",
  },
  {
    icon: <Search size={16} />,
    category: "OBSERVE",
    title: "Global Explorer",
    description:
      "Search across millions of raw prompts and responses. Filter by model, session, or specific text to track down hallucinations instantly.",
  },
  {
    icon: <Activity size={16} />,
    category: "ANALYZE",
    title: "Anomaly Detection",
    description:
      "Automatically flag agent loops and runaway costs. The ingestion pipeline tracks token growth and isolates sessions that exceed normal parameters.",
  },
  {
    icon: <GitCommit size={16} />,
    category: "DEBUG",
    title: "Live Replay Engine",
    description:
      "Stop copy-pasting into playgrounds. Edit historical prompts and test them against different models (OpenAI, Anthropic, Groq) directly in the UI.",
  },
  {
    icon: <Shield size={16} />,
    category: "INFRA",
    title: "DDoS Resilient",
    description:
      "Built for scale. The API uses an Upstash Redis buffer to absorb infinite loops, while a Vercel Cron drains the queue into Supabase safely.",
  },
];

export function FeatureGrid() {
  return (
    <section className="py-16 sm:py-24 lg:py-32 px-4 sm:px-6">
      <div className="max-w-[1120px] mx-auto">
        <div className="mb-10 sm:mb-16">
          <h2 className="text-[clamp(24px,4vw,40px)] font-semibold text-white tracking-[-0.02em] mb-4">
            Engineered for agents.
          </h2>
          <p className="text-[15px] sm:text-[17px] text-[#a1a1aa] max-w-[600px] leading-[1.6]">
            Traditional observability tools break under the weight of multi-step
            RAG pipelines. We built a stack that scales.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {FEATURES.map((feature, idx) => (
            <motion.div
              key={feature.category}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="group p-6 sm:p-8 rounded-xl border border-white/[0.06] bg-[#0d0d0d] hover:bg-[#111116] hover:border-[#60a5fa]/30 transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-lg bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-[#60a5fa] mb-5 sm:mb-6 group-hover:scale-110 group-hover:bg-[#60a5fa]/10 transition-all duration-300">
                {feature.icon}
              </div>
              <div className="font-mono text-[12px] text-[#60a5fa] uppercase tracking-[2px] mb-2 sm:mb-3">
                {feature.category}
              </div>
              <h3 className="text-[15px] sm:text-[16px] font-medium text-white mb-2 sm:mb-3">
                {feature.title}
              </h3>
              <p className="text-[13px] sm:text-[14px] text-[#a1a1aa] leading-[1.6]">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
