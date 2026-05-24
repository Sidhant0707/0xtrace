"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { FaGithub } from "react-icons/fa6";
import { createClient } from "@/lib/supabase-browser";

// ── Fade-in animation config ──────────────────────────────────────────────────

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: {
    duration: 0.5,
    delay,
    ease: [0.21, 0.47, 0.32, 0.98] as [number, number, number, number],
  },
});

// ── Feature list ──────────────────────────────────────────────────────────────

const FEATURES = [
  "Proxy-based capture — zero latency added",
  "Keyframe + delta prompt storage (85% smaller)",
  "Token explosion & cost spike detection",
  "Step-by-step diff viewer and replay engine",
] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (oauthError) throw oauthError;
      // Loading stays true — user is being redirected to GitHub
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex">
      {/* ── Subtle background grid ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 opacity-[0.025] bg-[linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] bg-[length:48px_48px]" />
        <div className="absolute top-0 left-0 right-0 h-[500px] bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-[#3b82f6]/8 via-transparent to-transparent" />
      </div>

      {/* ── LEFT: Product context ── */}
      <div className="hidden lg:flex lg:w-[55%] flex-col justify-between p-16 border-r border-[#1f1f1f] relative z-10">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 no-underline w-fit">
          <div className="w-8 h-8 bg-white rounded flex items-center justify-center font-mono font-semibold text-[13px] text-black">
            0x
          </div>
          <span className="font-mono text-white text-[15px] font-semibold">
            0xtrace
          </span>
        </Link>

        {/* Hero copy */}
        <motion.div {...fadeUp(0.1)} className="max-w-[460px]">
          <p className="font-mono text-[11px] text-[#3b82f6] uppercase tracking-[3px] mb-5">
            AI Observability
          </p>
          <h1 className="m-0 text-white text-[38px] font-semibold leading-[1.15] tracking-[-0.03em] mb-6">
            Stop guessing why
            <br />
            <span className="text-[#52525b]">your agent failed.</span>
          </h1>
          <p className="m-0 text-[#71717a] text-[15px] leading-[1.8] mb-10">
            Intercept every LLM call, visualize the exact prompt delta at each
            step, and catch cost explosions before they hit your bill.
          </p>

          {/* Feature list */}
          <div className="flex flex-col gap-3.5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f}
                {...fadeUp(0.3 + i * 0.08)}
                className="flex items-center gap-3"
              >
                <span className="flex-none w-1.5 h-1.5 rounded-full bg-[#3b82f6]" />
                <span className="text-[#a1a1aa] text-[13px]">{f}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Bottom meta */}
        <motion.div {...fadeUp(0.7)} className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />
          <span className="font-mono text-[11px] text-[#52525b] uppercase tracking-wider">
            MIT licensed · open source · self-hostable
          </span>
        </motion.div>
      </div>

      {/* ── RIGHT: Auth card ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10">
        {/* Mobile logo */}
        <motion.div {...fadeUp(0)} className="lg:hidden mb-12">
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <div className="w-8 h-8 bg-white rounded flex items-center justify-center font-mono font-semibold text-[13px] text-black">
              0x
            </div>
            <span className="font-mono text-white text-[15px] font-semibold">
              0xtrace
            </span>
          </Link>
        </motion.div>

        <motion.div {...fadeUp(0.15)} className="w-full max-w-[380px]">
          {/* Card */}
          <div className="bg-[#111] border border-[#1f1f1f] rounded-xl p-8">
            {/* Header */}
            <div className="mb-8">
              <h2 className="m-0 text-white text-[20px] font-semibold tracking-[-0.02em]">
                Sign in to 0xtrace
              </h2>
              <p className="mt-2 mb-0 text-[#71717a] text-[13px]">
                Developer observability for LLM applications.
              </p>
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-5 px-4 py-3 bg-[#1f0a0a] border border-[#4a1111] rounded-lg text-[#f43f5e] text-[13px]"
              >
                {error}
              </motion.div>
            )}

            {/* GitHub button */}
            <button
              type="button"
              onClick={handleSignIn}
              disabled={loading}
              className={[
                "w-full h-11 rounded-lg",
                "flex items-center justify-center gap-3",
                "text-[14px] font-semibold",
                "transition-all duration-150 active:scale-[0.98]",
                loading
                  ? "bg-[#1e3a5f] border border-[#1e3a8a] text-[#60a5fa] cursor-not-allowed"
                  : "bg-[#3b82f6] text-white hover:bg-[#2563eb] shadow-[0_0_20px_rgba(59,130,246,0.2)]",
              ].join(" ")}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FaGithub className="w-4 h-4" />
              )}
              {loading ? "Redirecting to GitHub…" : "Continue with GitHub"}
            </button>

            {/* Divider */}
            <div className="my-6 flex items-center gap-3">
              <div className="flex-1 h-px bg-[#1f1f1f]" />
              <span className="text-[#3f3f46] text-[11px] font-mono uppercase tracking-wider">
                what you get
              </span>
              <div className="flex-1 h-px bg-[#1f1f1f]" />
            </div>

            {/* Mini feature list for mobile */}
            <div className="flex flex-col gap-2.5">
              {FEATURES.map((f) => (
                <div key={f} className="flex items-start gap-2.5">
                  <span className="flex-none mt-[5px] w-1 h-1 rounded-full bg-[#3b82f6]" />
                  <span className="text-[#52525b] text-[12px] leading-relaxed">
                    {f}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer note */}
          <p className="mt-5 text-center font-mono text-[11px] text-[#3f3f46]">
            Your traces are private and isolated to your account.
            <br />
            We never train on your data.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
