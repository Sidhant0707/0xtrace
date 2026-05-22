"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { FaGithub } from "react-icons/fa";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={[
        "fixed top-0 left-0 right-0 z-50 h-[58px]",
        "transition-all duration-300",
        scrolled
          ? "bg-[#080808]/80 backdrop-blur-xl border-b border-white/[0.04]"
          : "bg-transparent border-b border-transparent",
      ].join(" ")}
    >
      <div className="max-w-[1120px] mx-auto h-full px-6 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="no-underline flex items-center gap-0.5 group">
          <span className="font-mono text-[15px] font-semibold text-white tracking-tight">
            0x
          </span>
          {/* Changed from #3f3f46 to #a1a1aa for legibility */}
          <span className="font-mono text-[15px] font-normal text-[#a1a1aa] tracking-tight group-hover:text-[#e4e4e7] transition-colors duration-200">
            trace
          </span>
        </Link>

        {/* Center nav */}
        <nav className="hidden md:flex items-center gap-6">
          {[
            { label: "Docs", href: "#" },
            {
              label: "GitHub",
              href: "https://github.com/Sidhant0707/0xtrace",
              external: true,
            },
            { label: "Changelog", href: "#" },
          ].map(({ label, href, external }) => (
            <Link
              key={label}
              href={href}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              // Increased contrast from #52525b to #a1a1aa
              className="text-[14px] text-[#a1a1aa] hover:text-[#e4e4e7] no-underline transition-colors duration-150"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Right CTAs */}
        <div className="flex items-center gap-3">
          <Link
            href="https://github.com/Sidhant0707/0xtrace"
            target="_blank"
            rel="noopener noreferrer"
            // Increased contrast and bumped size slightly
            className="hidden sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-white/[0.1] text-[13px] text-[#a1a1aa] no-underline hover:text-white hover:border-white/[0.2] transition-all duration-150"
          >
            <FaGithub size={13} />
            <span>Star</span>
          </Link>
          <Link
            href="/dashboard"
            // Changed from plain white to a vibrant blue to draw the eye
            className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md bg-[#2563eb] text-white text-[13px] font-semibold no-underline hover:bg-[#0e0e0e] active:scale-[0.97] transition-all duration-150 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
          >
            Dashboard
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </motion.header>
  );
}
