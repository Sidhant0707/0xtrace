// components/dashboard/SidebarNav.tsx
//
// "use client" — active nav state via usePathname().
// v2: accepts collapsed prop + onToggleCollapse for icon-only mode.
// Collapsed: 64px wide, icons only with tooltips.
// Expanded: 240px wide, icons + labels.

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
  collapsed: boolean;
  onToggleCollapse: () => void;
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
  Webhooks: (
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
      <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
      <line x1="6" y1="1" x2="6" y2="4" />
      <line x1="10" y1="1" x2="10" y2="4" />
      <line x1="14" y1="1" x2="14" y2="4" />
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
  Collapse: (
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
      <path d="m15 18-6-6 6-6" />
    </svg>
  ),
  Expand: (
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
      <path d="m9 18 6-6-6-6" />
    </svg>
  ),
  Logout: (
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
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
} as const;

// ── Tooltip wrapper ───────────────────────────────────────────────────────────
// Only shows when sidebar is collapsed — gives icon-only mode full labels.

function Tooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative group/tooltip">
      {children}
      <div
        className={[
          "absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 z-50",
          "px-2 py-1 rounded-md bg-[#1f1f1f] border border-[#333]",
          "text-[12px] text-white whitespace-nowrap pointer-events-none",
          "opacity-0 group-hover/tooltip:opacity-100",
          "transition-opacity duration-150",
        ].join(" ")}
      >
        {label}
        {/* Arrow */}
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-[#333]" />
      </div>
    </div>
  );
}

// ── NavLink ───────────────────────────────────────────────────────────────────

function NavLink({
  item,
  isActive,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  const base = (
    <Link
      href={item.href}
      className={[
        "h-9 flex items-center rounded-md",
        "text-sm no-underline border-l-2",
        "transition-colors duration-[120ms] ease-in-out",
        "hover:bg-[#1a1a1a] hover:text-white",
        collapsed ? "justify-center px-0 w-9 mx-auto" : "gap-[10px] px-3",
        isActive
          ? "bg-[#161b27] text-white border-[#3b82f6]"
          : "text-[#a1a1aa] border-transparent",
      ].join(" ")}
    >
      <span className="flex-none" aria-hidden="true">
        {item.icon}
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 min-w-0 truncate">{item.label}</span>
          {item.badge !== undefined && item.badge > 0 && (
            <span className="ml-auto h-5 inline-flex items-center px-2 rounded text-[11px] font-medium tracking-[0.02em] border bg-[#2d1a00] text-[#f59e0b] border-[#451a03]">
              {item.badge}
            </span>
          )}
        </>
      )}
      {/* Badge dot in collapsed mode */}
      {collapsed && item.badge !== undefined && item.badge > 0 && (
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
      )}
    </Link>
  );

  if (collapsed) {
    return <Tooltip label={item.label}>{base}</Tooltip>;
  }
  return base;
}

// ── LogoutButton ──────────────────────────────────────────────────────────────

function LogoutButton({ collapsed }: { collapsed: boolean }) {
  const btn = (
    <form action={clearActiveProject}>
      <button
        type="submit"
        className={[
          "h-9 w-full flex items-center rounded-md",
          "text-sm border-l-2 border-transparent bg-transparent",
          "text-[#52525b] hover:text-[#f43f5e] hover:bg-[#1a1a1a]",
          "transition-colors duration-[120ms] cursor-pointer",
          collapsed ? "justify-center px-0 w-9 mx-auto" : "gap-[10px] px-3",
        ].join(" ")}
      >
        {Icons.Logout}
        {!collapsed && <span>Sign out</span>}
      </button>
    </form>
  );

  if (collapsed) return <Tooltip label="Sign out">{btn}</Tooltip>;
  return btn;
}

// ── SidebarNav ────────────────────────────────────────────────────────────────

export function SidebarNav({
  anomalyCount,
  projects,
  activeProject,
  collapsed,
  onToggleCollapse,
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
    {
      label: "Webhooks",
      href: "/dashboard/settings/webhooks",
      matchPrefix: "/dashboard/settings/webhooks",
      icon: Icons.Webhooks,
    },
    { label: "Docs", href: "/docs", matchPrefix: "/docs", icon: Icons.Docs },
  ];

  function isActive(item: NavItem): boolean {
    if (item.href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(item.matchPrefix);
  }

  return (
    <aside
      className={[
        "fixed left-0 top-0 bottom-0 z-20",
        "bg-[#0f0f0f] border-r border-[#1f1f1f]",
        "flex flex-col py-6",
        "transition-[width] duration-300 ease-in-out",
        "overflow-hidden",
        collapsed ? "w-[64px] px-2" : "w-[240px] px-3",
      ].join(" ")}
      aria-label="Primary navigation"
    >
      {/* ── Logo + collapse toggle ── */}
      <div
        className={[
          "flex items-center mb-5",
          collapsed ? "justify-center" : "justify-between px-3",
        ].join(" ")}
      >
        {!collapsed && (
          <div>
            <div className="font-mono text-white text-[15px] font-medium tracking-tight">
              0xtrace
            </div>
            <div className="text-[#52525b] text-[12px]">AI Observability</div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className={[
            "flex items-center justify-center rounded-md",
            "text-[#52525b] hover:text-white hover:bg-[#1a1a1a]",
            "transition-colors duration-[120ms]",
            collapsed ? "w-9 h-9" : "w-7 h-7",
          ].join(" ")}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? Icons.Expand : Icons.Collapse}
        </button>
      </div>

      {/* ── Project switcher (hidden when collapsed) ── */}
      {!collapsed && (
        <ProjectSwitcher projects={projects} activeProject={activeProject} />
      )}

      {/* Collapsed project dot */}
      {collapsed && activeProject && (
        <Tooltip label={activeProject.name}>
          <div className="w-9 h-9 mx-auto flex items-center justify-center mb-1">
            <span className="w-2 h-2 rounded-full bg-[#3b82f6]" />
          </div>
        </Tooltip>
      )}

      {/* ── Divider ── */}
      <div className="h-px bg-[#1f1f1f] my-3 mx-1" role="separator" />

      {/* ── Primary nav ── */}
      <nav className="flex flex-col gap-1" aria-label="Main">
        {primaryNav.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            isActive={isActive(item)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* ── Divider ── */}
      <div className="h-px bg-[#1f1f1f] my-3 mx-1" role="separator" />

      {/* ── Secondary nav ── */}
      <nav className="flex flex-col gap-1" aria-label="Secondary">
        {secondaryNav.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            isActive={isActive(item)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* ── Logout ── */}
      <div className="mt-auto mb-2">
        <LogoutButton collapsed={collapsed} />
      </div>

      {/* ── SDK version pill ── */}
      {!collapsed && (
        <div className="px-3">
          <div className="h-7 inline-flex items-center rounded bg-[#1a1a1a] text-[#52525b] px-[10px] font-mono text-[12px]">
            SDK v1.0.4
          </div>
        </div>
      )}
    </aside>
  );
}
