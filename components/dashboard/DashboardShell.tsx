// components/dashboard/DashboardShell.tsx
//
// "use client" — owns sidebar collapsed state.
// Stored in localStorage so preference persists across sessions.
// Passed down to SidebarNav (icon-only vs full) and adjusts main margin.

"use client";

import { useState } from "react";
import { SidebarNav } from "./SidebarNav";
import type { Project } from "@/lib/project-context";

interface DashboardShellProps {
  children:      React.ReactNode;
  anomalyCount:  number;
  projects:      Project[];
  activeProject: Project | null;
}

const STORAGE_KEY = "oxtr_sidebar";

export function DashboardShell({
  children,
  anomalyCount,
  projects,
  activeProject,
}: DashboardShellProps) {

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === "collapsed";
    }
    return false;
  });

  // ── Persist preference ────────────────────────────────────────────────────
  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, next ? "collapsed" : "expanded");
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#a1a1aa]">
      <SidebarNav
        anomalyCount={anomalyCount}
        projects={projects}
        activeProject={activeProject}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      <main
        className={
          `min-h-screen overflow-x-hidden transition-[margin] duration-300 ease-in-out ` +
          (collapsed ? "ml-16" : "ml-60")
        }
      >
        <div className="max-w-[1400px] p-9">{children}</div>
      </main>
    </div>
  );
}