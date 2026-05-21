// components/dashboard/SidebarNav.tsx
//
// "use client" because we need usePathname() to derive active nav state.
// Everything else (icons, SDK pill, logo) is pure static markup — no state,
// no effects beyond the pathname read.
//
// Props:
//   anomalyCount  — fetched server-side in layout.tsx, passed down here.
//                   Avoids a client-side fetch just for a badge number.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "../../lib/supabase-browser";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SidebarNavProps {
  anomalyCount: number;
}

interface NavItem {
  label: string;
  href: string;
  /** Matches if the current pathname starts with this prefix. */
  matchPrefix: string;
  icon: React.ReactNode;
  badge?: number;
}

// ── SVG Icons (inline, no icon lib dependency) ────────────────────────────────
// Each icon is 16×16, stroke-based, currentColor.

const Icons = {
  Sessions: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  Explorer: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  Anomalies: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  ),
  CostAnalysis: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </svg>
  ),
  Settings: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  Docs: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
} as const;

// ── NavLink ───────────────────────────────────────────────────────────────────

interface NavLinkProps {
  item: NavItem;
  isActive: boolean;
}

function NavLink({ item, isActive }: NavLinkProps) {
  return (
    <Link
      href={item.href}
      className={[
        // Base
        "h-9 flex items-center gap-[10px] px-3 rounded-md",
        "text-sm no-underline border-l-2",
        "transition-colors duration-[120ms] ease-in-out",
        // Hover (only applied when not active — active already has bg)
        "hover:bg-[#1a1a1a] hover:text-white",
        // Active vs inactive
        isActive
          ? "bg-[#161b27] text-white border-[#3b82f6]"
          : "text-[#a1a1aa] border-transparent",
      ].join(" ")}
    >
      {/* Icon — inherits color from parent */}
      <span className="flex-none" aria-hidden="true">
        {item.icon}
      </span>

      {/* Label */}
      <span className="flex-1 min-w-0 truncate">{item.label}</span>

      {/* Optional badge (e.g. anomaly count) */}
      {item.badge !== undefined && item.badge > 0 && (
        <span
          className={[
            "ml-auto h-5 inline-flex items-center px-2 rounded",
            "text-[11px] font-medium tracking-[0.02em] border",
            "bg-[#2d1a00] text-[#f59e0b] border-[#451a03]",
          ].join(" ")}
          aria-label={`${item.badge} anomalies`}
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function LogoutButton() {
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <button
      onClick={handleLogout}
      type="button"
      className={[
        "h-9 w-full flex items-center gap-[10px] px-3 rounded-md",
        "text-sm border-l-2 border-transparent bg-transparent",
        "text-[#52525b] hover:text-[#f43f5e] hover:bg-[#1a1a1a]",
        "transition-colors duration-[120ms] cursor-pointer",
      ].join(" ")}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      <span>Sign out</span>
    </button>
  );
}

// ── SidebarNav ────────────────────────────────────────────────────────────────

export function SidebarNav({ anomalyCount }: SidebarNavProps) {
  const pathname = usePathname();

  // ── Nav item definitions ───────────────────────────────────────────────────
  // Split into two groups to render the divider correctly without
  // needing to special-case index positions.

  const primaryNav: NavItem[] = [
    {
      label: "Sessions",
      href: "/dashboard",
      matchPrefix: "/dashboard",
      icon: Icons.Sessions,
    },
    {
      label: "Explorer",
      href: "/dashboard/explorer",
      matchPrefix: "/dashboard/explorer",
      icon: Icons.Explorer,
    },
    {
      label: "Anomalies",
      href: "/dashboard/anomalies",
      matchPrefix: "/dashboard/anomalies",
      icon: Icons.Anomalies,
      badge: anomalyCount,
    },
    {
      label: "Cost Analysis",
      href: "/dashboard/cost",
      matchPrefix: "/dashboard/cost",
      icon: Icons.CostAnalysis,
    },
  ];

  const secondaryNav: NavItem[] = [
    {
      label: "Settings",
      href: "/dashboard/settings",
      matchPrefix: "/dashboard/settings",
      icon: Icons.Settings,
    },
    {
      label: "Docs",
      href: "https://docs.0xtrace.dev",
      matchPrefix: "__never__",
      icon: Icons.Docs,
    },
  ];

  // ── Active state resolution ────────────────────────────────────────────────
  // Sessions is special: only active on exactly /dashboard, not on every
  // sub-route (which all start with /dashboard).

  function isActive(item: NavItem): boolean {
    if (item.href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname.startsWith(item.matchPrefix);
  }

  return (
    <aside
      className={[
        "fixed left-0 top-0 bottom-0 w-[240px] z-20",
        "bg-[#0f0f0f] border-r border-[#1f1f1f]",
        "flex flex-col py-6 px-3",
      ].join(" ")}
      aria-label="Primary navigation"
    >
      {/* ── Logo ── */}
      <div className="px-3 pb-6">
        <div className="font-mono text-white text-[15px] font-medium tracking-tight">
          0xtrace
        </div>
        <div className="mt-1 text-[#52525b] text-[12px]">AI Observability</div>
      </div>

      {/* ── Primary nav ── */}
      <nav className="flex flex-col gap-1" aria-label="Main">
        {primaryNav.map((item) => (
          <NavLink key={item.href} item={item} isActive={isActive(item)} />
        ))}
      </nav>

      {/* ── Divider ── */}
      <div className="h-px bg-[#1f1f1f] my-3 mx-3" role="separator" />

      {/* ── Secondary nav ── */}
      <nav className="flex flex-col gap-1" aria-label="Secondary">
        {secondaryNav.map((item) => (
          <NavLink key={item.href} item={item} isActive={isActive(item)} />
        ))}
      </nav>

      {/* ── Logout ── */}
      <div className="mt-auto mb-2">
        <LogoutButton />
      </div>

      {/* ── SDK version pill ── */}
      <div className="mt-auto px-3">
        <div
          className={[
            "h-7 inline-flex items-center rounded",
            "bg-[#1a1a1a] text-[#52525b]",
            "px-[10px] font-mono text-[12px]",
          ].join(" ")}
          title="SDK package version"
        >
          SDK v0.1.0
        </div>
      </div>
    </aside>
  );
}
