// components/landing/Footer.tsx
import Link from "next/link";
import { EXTERNAL_LINKS, INTERNAL_LINKS, externalLinkProps } from "@/lib/links";

const PRODUCT_LINKS = [
  { label: "Dashboard", href: INTERNAL_LINKS.DASHBOARD },
  { label: "Docs", href: INTERNAL_LINKS.DOCS },
  { label: "Changelog", ...externalLinkProps(EXTERNAL_LINKS.GITHUB_CHANGELOG) },
] as const;

const OSS_LINKS = [
  { label: "GitHub", ...externalLinkProps(EXTERNAL_LINKS.GITHUB_REPO) },
  { label: "npm", ...externalLinkProps(EXTERNAL_LINKS.NPM_PACKAGE) },
  { label: "MIT License", ...externalLinkProps(EXTERNAL_LINKS.MIT_LICENSE) },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-white/[0.04] py-10 sm:py-12 px-4 sm:px-6">
      <div className="max-w-[1100px] mx-auto flex flex-col gap-8 sm:gap-10 md:gap-12">
        {/* Top row: logo + link columns */}
        <div className="flex flex-col sm:flex-row gap-8 sm:gap-0 sm:justify-between">
          {/* Brand */}
          <div>
            <div className="flex items-center">
              <span className="font-mono text-[15px] font-bold text-white">
                0x
              </span>
              <span className="font-mono text-[15px] font-normal text-[#a1a1aa]">
                trace
              </span>
            </div>
            <p className="mt-2 mb-3 font-mono text-[13px] text-[#71717a]">
              AI observability for agents that ship.
            </p>
            <span className="font-mono text-[11px] text-[#60a5fa] bg-[#3b82f6]/10 border border-[#3b82f6]/20 px-2 py-1 rounded">
              SDK v1.1.1
            </span>
          </div>

          {/* Link columns — tighter gap on mobile */}
          <div className="flex gap-8 sm:gap-12 md:gap-16">
            <div className="space-y-3 sm:space-y-4">
              <div className="font-mono text-[11px] text-[#e4e4e7] uppercase tracking-[2px]">
                Product
              </div>
              {PRODUCT_LINKS.map((link) => {
                const { label, href, ...rest } = link;
                return (
                  <div key={label}>
                    <Link
                      href={href}
                      {...rest}
                      className="text-[14px] text-[#71717a] hover:text-[#e4e4e7] no-underline transition-colors duration-150"
                    >
                      {label}
                    </Link>
                  </div>
                );
              })}
            </div>

            <div className="space-y-3 sm:space-y-4">
              <div className="font-mono text-[11px] text-[#e4e4e7] uppercase tracking-[2px]">
                Open Source
              </div>
              {OSS_LINKS.map((link) => {
                const { label, href, ...rest } = link;
                return (
                  <div key={label}>
                    <Link
                      href={href}
                      {...rest}
                      className="text-[14px] text-[#71717a] hover:text-[#e4e4e7] no-underline transition-colors duration-150"
                    >
                      {label}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom row: copyright — left on mobile, right on desktop */}
        <div className="pt-6 border-t border-white/[0.04] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0">
          <div className="text-[13px] text-[#71717a]">© 2026 0xtrace</div>
          <div className="flex items-center gap-4">
            <div className="font-mono text-[12px] text-[#52525b]">
              Made with TypeScript
            </div>
            <div className="font-mono text-[12px] text-[#52525b]">
              Built in public
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
