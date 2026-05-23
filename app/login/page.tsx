"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { Activity, Zap, BarChart3, Loader2 } from "lucide-react";
import { FaGithub } from "react-icons/fa6";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  duration: number;
}

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 100 };
  const springX = useSpring(mouseX, springConfig);
  const springY = useSpring(mouseY, springConfig);

  const rotateX = useTransform(springY, [-500, 500], [5, -5]);
  const rotateY = useTransform(springX, [-500, 500], [-5, 5]);
  const translateX = useTransform(springX, [-500, 500], [-20, 20]);
  const translateY = useTransform(springY, [-500, 500], [-20, 20]);

  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => {
      setParticles(
        Array.from({ length: 50 }, (_, i) => ({
          id: i,
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          size: Math.random() * 3 + 1,
          opacity: Math.random() * 0.5 + 0.2,
          duration: 3 + Math.random() * 4,
        })),
      );
    });

    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      mouseX.set(e.clientX - innerWidth / 2);
      mouseY.set(e.clientY - innerHeight / 2);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [mouseX, mouseY]);

  async function handleGitHubSignIn() {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

      // User will be redirected to GitHub, don't stop loading
    } catch (err) {
      console.error("Sign in error:", err);
      setError("Failed to sign in with GitHub. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col md:flex-row overflow-hidden relative">
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .perspective-grid {
            background-size: 50px 50px;
            background-image: 
              linear-gradient(to right, rgba(16, 185, 129, 0.05) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(16, 185, 129, 0.05) 1px, transparent 1px);
            transform-style: preserve-3d;
            mask-image: radial-gradient(ellipse at center, black 20%, transparent 70%);
          }
          
          @keyframes shimmer {
            0% { background-position: -1000px 0; }
            100% { background-position: 1000px 0; }
          }
          
          .shimmer {
            background: linear-gradient(
              90deg,
              transparent,
              rgba(16, 185, 129, 0.1),
              transparent
            );
            background-size: 1000px 100%;
            animation: shimmer 3s infinite;
          }

          .magnetic-btn {
            transition: transform 0.2s ease-out;
          }

          .magnetic-btn:hover {
            transform: scale(1.02);
          }
        `,
        }}
      />

      {/* Particle Background */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            className="absolute rounded-full bg-emerald-500"
            style={{
              left: particle.x,
              top: particle.y,
              width: particle.size,
              height: particle.size,
              opacity: particle.opacity,
            }}
            animate={{
              y: [0, -40, 0],
              x: [0, 30, 0],
              opacity: [
                particle.opacity,
                particle.opacity * 0.3,
                particle.opacity,
              ],
            }}
            transition={{
              duration: particle.duration,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Perspective Grid */}
      <motion.div
        className="absolute inset-0 z-0 pointer-events-none perspective-grid"
        style={{
          rotateX,
          rotateY,
          x: translateX,
          y: translateY,
          scale: 1.2,
        }}
      />

      {/* Left Column (Hero Section) */}
      <div className="hidden md:flex md:w-1/2 lg:w-3/5 p-12 lg:p-24 flex-col justify-between relative z-10 border-r border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-emerald-900/40 via-transparent to-transparent pointer-events-none" />

        <motion.div
          style={{
            x: useTransform(springX, [-500, 500], [-30, 30]),
            y: useTransform(springY, [-500, 500], [-30, 30]),
          }}
          className="absolute top-1/4 -left-20 w-96 h-96 bg-emerald-500/20 rounded-full blur-[120px] pointer-events-none"
        />

        <div className="relative z-10">
          <Link href="/" className="flex items-center gap-3 mb-16 group w-fit">
            <motion.div
              className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center text-zinc-950 font-bold text-xl shadow-[0_0_20px_rgba(16,185,129,0.5)]"
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              0x
            </motion.div>
            <span className="text-2xl font-bold tracking-tight text-white">
              0xtrace
            </span>
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            style={{
              x: useTransform(springX, [-500, 500], [-10, 10]),
              y: useTransform(springY, [-500, 500], [-10, 10]),
            }}
            className="max-w-xl"
          >
            <h1 className="text-5xl lg:text-6xl font-extrabold leading-[1.1] mb-8 tracking-tight">
              Ship LLM apps with{" "}
              <motion.span
                className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-green-500 inline-block"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              >
                confidence.
              </motion.span>
            </h1>
            <motion.p
              className="text-xl text-zinc-400 leading-relaxed mb-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.6 }}
            >
              Stop guessing why your agent failed. Visualize prompt deltas,
              track context bloat, and optimize costs in real-time.
            </motion.p>

            <div className="flex flex-col gap-6">
              {[
                {
                  icon: Activity,
                  text: "Context window visualization",
                  color: "text-emerald-400",
                },
                {
                  icon: Zap,
                  text: "Real-time diff tracking",
                  color: "text-yellow-400",
                },
                {
                  icon: BarChart3,
                  text: "Cost & latency analytics",
                  color: "text-blue-400",
                },
              ].map(({ icon: Icon, text, color }, index) => (
                <motion.div
                  key={text}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.8 + index * 0.1 }}
                  className="flex items-center gap-4 group cursor-pointer"
                  whileHover={{ x: 5 }}
                >
                  <motion.div
                    className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center group-hover:bg-emerald-500/20 group-hover:border-emerald-500/50 transition-colors"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                  >
                    <Icon className={`w-4 h-4 ${color}`} />
                  </motion.div>
                  <span className="font-medium text-zinc-300 group-hover:text-white transition-colors">
                    {text}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.2 }}
          className="relative z-10"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <motion.div
                className="w-2 h-2 rounded-full bg-emerald-500"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [1, 0.7, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
              <p className="text-sm text-zinc-600 font-mono uppercase tracking-widest">
                SYSTEM: <span className="text-emerald-500">ONLINE</span>
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Right Column (Auth Card) */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 lg:p-24 bg-zinc-950/80 backdrop-blur-xl relative z-10">
        <motion.div
          className="md:hidden mb-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Link href="/" className="flex items-center gap-3 group">
            <motion.div
              className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-zinc-950 font-bold text-xl shadow-[0_0_15px_rgba(16,185,129,0.5)]"
              whileHover={{ scale: 1.1, rotate: 5 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              0x
            </motion.div>
            <span className="text-xl font-bold text-white">0xtrace</span>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full max-w-[420px] relative"
        >
          <div className="absolute -inset-4 bg-gradient-to-r from-emerald-500/20 to-green-500/20 rounded-3xl blur-2xl opacity-50" />

          <div className="relative bg-zinc-900/40 rounded-2xl p-10 border border-zinc-800 backdrop-blur-sm shadow-2xl">
            <div className="mb-8 text-center">
              <motion.h2
                className="text-3xl font-bold mb-3 tracking-tight"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                Welcome to 0xtrace
              </motion.h2>
              <motion.p
                className="text-zinc-400 text-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                Sign in with GitHub to start tracking your LLM applications
              </motion.p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3"
              >
                <motion.div
                  className="w-1.5 h-1.5 rounded-full bg-red-500"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                {error}
              </motion.div>
            )}

            <motion.button
              onClick={handleGitHubSignIn}
              disabled={isLoading}
              className="magnetic-btn bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-emerald-500/50 px-6 py-4 rounded-xl flex items-center justify-center gap-4 text-sm font-bold active:scale-95 disabled:opacity-50 transition-all group relative overflow-hidden w-full"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="absolute inset-0 shimmer opacity-0 group-hover:opacity-100" />
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
              ) : (
                <FaGithub className="text-xl relative z-10 text-white" />
              )}
              <span className="relative z-10 text-base tracking-wide text-white">
                {isLoading ? "Redirecting..." : "Continue with GitHub"}
              </span>
            </motion.button>

            <motion.div
              className="mt-8 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.7 }}
            >
              <p className="text-xs text-zinc-500">
                By continuing, you agree to our{" "}
                <Link
                  href="#"
                  className="text-zinc-400 hover:text-white transition-colors underline decoration-zinc-700 underline-offset-2"
                >
                  Terms of Service
                </Link>
              </p>
            </motion.div>
          </div>
        </motion.div>

        {/* Footer info for mobile */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="md:hidden mt-12 text-center max-w-xs"
        >
          <p className="text-sm text-zinc-600">
            Track context window bloat · Visualize prompt deltas · Optimize
            costs
          </p>
        </motion.div>
      </div>
    </div>
  );
}
