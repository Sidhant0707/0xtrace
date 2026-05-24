"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { FaGithub } from "react-icons/fa";

const NAV_LINKS = [
  { label: "Docs", href: "/docs", external: false },
  { label: "GitHub", href: "https://github.com/Sidhant0707/0xtrace", external: true },
  { label: "Changelog", href: "/changelog", external: false },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
        className={[
          "fixed top-0 left-0 right-0 z-50 h-[58px]",
          "transition-all duration-300",
          scrolled || mobileOpen
            ? "bg-[#080808]/95 backdrop-blur-xl border-b border-white/[0.04]"
            : "bg-transparent border-b border-transparent",
        ].join(" ")}
      >
        <div className="max-w-[1120px] mx-auto h-full px-4 sm:px-6 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="no-underline flex items-center gap-0.5 group shrink-0">
            <span className="font-mono text-[15px] font-semibold text-white tracking-tight">
              0x
            </span>
            <span className="font-mono text-[15px] font-normal text-[#a1a1aa] tracking-tight group-hover:text-[#e4e4e7] transition-colors duration-200">
              trace
            </span>
          </Link>

          {/* Center nav — desktop only */}
          <nav className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map(({ label, href, external }) => (
              <Link
                key={label}
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                className="text-[14px] text-[#a1a1aa] hover:text-[#e4e4e7] no-underline transition-colors duration-150"
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Right CTAs — desktop */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="https://github.com/Sidhant0707/0xtrace"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-white/[0.1] text-[13px] text-[#a1a1aa] no-underline hover:text-white hover:border-white/[0.2] transition-all duration-150"
            >
              <FaGithub size={13} />
              <span>Star</span>
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-md bg-[#2563eb] text-white text-[13px] font-semibold no-underline hover:bg-[#1d4ed8] active:scale-[0.97] transition-all duration-150 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
            >
              Dashboard
              <ArrowRight size={13} />
            </Link>
          </div>

          {/* Mobile: Dashboard shortcut + hamburger */}
          <div className="flex md:hidden items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center h-8 px-3 rounded-md bg-[#2563eb] text-white text-[13px] font-semibold no-underline transition-all duration-150"
            >
              Dashboard
            </Link>
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="flex items-center justify-center w-9 h-9 rounded-md border border-white/[0.08] text-[#a1a1aa] hover:text-white transition-colors duration-150 bg-transparent"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile Menu Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed top-[58px] left-0 right-0 z-40 bg-[#080808]/98 backdrop-blur-xl border-b border-white/[0.06] md:hidden"
          >
            <nav className="px-4 py-4 flex flex-col gap-1">
              {NAV_LINKS.map(({ label, href, external }) => (
                <Link
                  key={label}
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-between h-12 px-3 rounded-lg text-[15px] text-[#a1a1aa] hover:text-white hover:bg-white/[0.04] no-underline transition-all duration-150"
                >
                  {label}
                  {external && (
                    <ArrowRight size={14} className="opacity-40 -rotate-45" />
                  )}
                </Link>
              ))}
              <div className="mt-2 pt-3 border-t border-white/[0.06] flex flex-col gap-2">
                <Link
                  href="https://github.com/Sidhant0707/0xtrace"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center gap-2 h-11 rounded-lg border border-white/[0.1] text-[14px] text-[#a1a1aa] hover:text-white no-underline transition-all duration-150"
                >
                  <FaGithub size={15} />
                  Star on GitHub
                </Link>
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center gap-1.5 h-11 rounded-lg bg-[#2563eb] text-white text-[14px] font-semibold no-underline hover:bg-[#1d4ed8] transition-all duration-150"
                >
                  Go to Dashboard
                  <ArrowRight size={14} />
                </Link>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}