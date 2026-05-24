import Link from "next/link";

export function CTABanner() {
  return (
    <section className="py-16 sm:py-[120px] px-4 sm:px-6">
      <div className="max-w-[1100px] mx-auto text-center">
        <h2 className="m-0 text-[clamp(30px,5vw,56px)] font-semibold text-white leading-[1.05] tracking-[-0.04em]">
          Start tracing
          <br />
          in 5 minutes.
        </h2>
        <p className="mt-4 mb-0 text-[15px] sm:text-[16px] text-[#52525b]">
          Free. Open source. No credit card required.
        </p>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mt-8">
          <Link
            href="/login"
            className={[
              "h-11 px-6 rounded-lg no-underline",
              "bg-white text-[#0a0a0a]",
              "text-[14px] font-semibold",
              "inline-flex items-center justify-center",
              "hover:bg-[#e5e5e5] active:scale-[0.98]",
              "transition-all duration-150",
            ].join(" ")}
          >
            Get Early Access
          </Link>
          <Link
            href="https://github.com/Sidhant0707/0xtrace"
            target="_blank"
            rel="noopener noreferrer"
            className={[
              "h-11 px-6 rounded-lg no-underline",
              "border border-[#1f1f1f]",
              "text-[14px] text-[#a1a1aa]",
              "inline-flex items-center justify-center gap-2",
              "hover:border-[#3f3f46] hover:text-white",
              "transition-all duration-150",
            ].join(" ")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            View on GitHub
          </Link>
        </div>

        <p className="mt-6 mb-0 font-mono text-[11px] text-[#3f3f46]">
          MIT licensed · self-hostable · your data never leaves your
          infrastructure
        </p>
      </div>
    </section>
  );
}
