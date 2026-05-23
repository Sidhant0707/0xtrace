// components/dashboard/SidebarNav.tsx
//
// "use client" — active nav state via usePathname().
//
// v2: accepts projects + activeProject props from the layout server component,
// renders ProjectSwitcher at the top of the sidebar.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clearActiveProject } from "@/app/dashboard/actions";
import { ProjectSwitcher } from "./ProjectSwitcher";
import type { Project } from "@/lib/project-context";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SidebarNavProps {
  anomalyCount: number;
  projects: Project[];
  activeProject: Project | null;
}

interface NavItem {
  label: string;
  href: string;
  matchPrefix: string;
  icon: React.ReactNode;
  badge?: number;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

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

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  return (
    <Link
      href={item.href}
      className={[
        "h-9 flex items-center gap-[10px] px-3 rounded-md",
        "text-sm no-underline border-l-2",
        "transition-colors duration-[120ms] ease-in-out",
        "hover:bg-[#1a1a1a] hover:text-white",
        isActive
          ? "bg-[#161b27] text-white border-[#3b82f6]"
          : "text-[#a1a1aa] border-transparent",
      ].join(" ")}
    >
      <span className="flex-none" aria-hidden="true">
        {item.icon}
      </span>
      <span className="flex-1 min-w-0 truncate">{item.label}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className="ml-auto h-5 inline-flex items-center px-2 rounded text-[11px] font-medium tracking-[0.02em] border bg-[#2d1a00] text-[#f59e0b] border-[#451a03]">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

// ── LogoutButton ──────────────────────────────────────────────────────────────

function LogoutButton() {
  return (
    <form action={clearActiveProject}>
      <button
        type="submit"
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
    </form>
  );
}

// ── SidebarNav ────────────────────────────────────────────────────────────────

export function SidebarNav({
  anomalyCount,
  projects,
  activeProject,
}: SidebarNavProps) {
  const pathname = usePathname();

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
    { label: "Docs", href: "/docs", matchPrefix: "/docs", icon: Icons.Docs },
  ];

  function isActive(item: NavItem): boolean {
    if (item.href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(item.matchPrefix);
  }

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 w-[240px] z-20 bg-[#0f0f0f] border-r border-[#1f1f1f] flex flex-col py-6 px-3"
      aria-label="Primary navigation"
    >
      {/* Logo */}
      <div className="px-3 pb-5">
        <div className="font-mono text-white text-[15px] font-medium tracking-tight">
          0xtrace
        </div>
        <div className="mt-1 text-[#52525b] text-[12px]">AI Observability</div>
      </div>

      {/* Project switcher */}
      <ProjectSwitcher projects={projects} activeProject={activeProject} />

      {/* Divider */}
      <div className="h-px bg-[#1f1f1f] my-3 mx-3" role="separator" />

      {/* Primary nav */}
      <nav className="flex flex-col gap-1" aria-label="Main">
        {primaryNav.map((item) => (
          <NavLink key={item.href} item={item} isActive={isActive(item)} />
        ))}
      </nav>

      {/* Divider */}
      <div className="h-px bg-[#1f1f1f] my-3 mx-3" role="separator" />

      {/* Secondary nav */}
      <nav className="flex flex-col gap-1" aria-label="Secondary">
        {secondaryNav.map((item) => (
          <NavLink key={item.href} item={item} isActive={isActive(item)} />
        ))}
      </nav>

      {/* Logout */}
      <div className="mt-auto mb-2">
        <LogoutButton />
      </div>

      {/* SDK version pill */}
      <div className="mt-auto px-3">
        <div className="h-7 inline-flex items-center rounded bg-[#1a1a1a] text-[#52525b] px-[10px] font-mono text-[12px]">
          SDK v0.1.0
        </div>
      </div>
    </aside>
  );
}
