// components/landing/Footer.tsx - FIXED
// ============================================================================
// All placeholder href="#" links replaced with real URLs
// ============================================================================

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
    <footer className="border-t border-white/[0.04] py-12 px-6">
      <div className="max-w-[1100px] mx-auto flex flex-col md:flex-row gap-12 justify-between">
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
            SDK v1.1.0
          </span>
        </div>

        <div className="flex gap-16">
          <div className="space-y-4">
            <div className="font-mono text-[11px] text-[#e4e4e7] uppercase tracking-[2px]">
              Product
            </div>
            {PRODUCT_LINKS.map(({ label, href, target, rel }) => (
              <div key={label}>
                <Link
                  href={href}
                  target={target}
                  rel={rel}
                  className="text-[14px] text-[#71717a] hover:text-[#e4e4e7] no-underline transition-colors duration-150"
                >
                  {label}
                </Link>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="font-mono text-[11px] text-[#e4e4e7] uppercase tracking-[2px]">
              Open Source
            </div>
            {OSS_LINKS.map(({ label, href, target, rel }) => (
              <div key={label}>
                <Link
                  href={href}
                  target={target}
                  rel={rel}
                  className="text-[14px] text-[#71717a] hover:text-[#e4e4e7] no-underline transition-colors duration-150"
                >
                  {label}
                </Link>
              </div>
            ))}
          </div>
        </div>

        <div className="md:text-right space-y-2">
          <div className="text-[13px] text-[#71717a]">© 2026 0xtrace</div>
          <div className="font-mono text-[12px] text-[#52525b]">
            Made with TypeScript
          </div>
          <div className="font-mono text-[12px] text-[#52525b]">
            Built in public
          </div>
        </div>
      </div>
    </footer>
  );
}
