// app/dashboard/layout.tsx
//
// Root layout shell for the entire dashboard.
// Renders the fixed sidebar and the scrollable main content area.
// Every page under /dashboard inherits this shell automatically via
// Next.js App Router nested layout convention.
//
// Architecture decisions:
//   - Sidebar is a pure Server Component (no interactivity needed at this level).
//   - Active nav state is derived from the current pathname via a thin
//     "use client" NavLink wrapper — no prop-drilling, no context.
//   - The anomaly badge count will be fetched server-side and passed as a prop
//     once the anomalies query is wired up. For now it reads from a server
//     fetch so the shell never causes a client bundle penalty.

import type { Metadata } from "next";
import { SidebarNav } from "@/components/dashboard/SidebarNav";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DashboardLayoutProps {
  children: React.ReactNode;
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: {
    template: "%s · 0xtrace",
    default: "0xtrace · AI Observability",
  },
  description:
    "Intercept, visualize, diff, and cost-analyze every LLM call your agent makes.",
};

// ── Server component: fetch anomaly count ─────────────────────────────────────

async function getAnomalyCount(): Promise<number> {
  // Imported inline to keep this file free of client-only imports.
  // Using dynamic import so the Supabase admin client is never bundled
  // into any client chunk.
  const { supabaseAdmin } = await import("@/lib/supabase");

  const { count, error } = await supabaseAdmin
    .from("llm_calls")
    .select("id", { count: "exact", head: true })
    .eq("metadata->>anomaly", "true");

  if (error) {
    console.warn("[layout] anomaly count query failed:", error.message);
    return 0;
  }

  return count ?? 0;
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const anomalyCount = await getAnomalyCount();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#a1a1aa]">
      {/* ── Sidebar ── */}
      <SidebarNav anomalyCount={anomalyCount} />

      {/* ── Main content area ── */}
      {/*
        ml-[240px] offsets the fixed sidebar width.
        min-h-screen ensures very short pages don't collapse the bg.
        overflow-x-hidden prevents horizontal scroll caused by table overflow
        on narrow viewports — each page's own table handles its scroll.
      */}
      <main className="ml-[240px] min-h-screen overflow-x-hidden">
        <div className="max-w-[1400px] p-9">{children}</div>
      </main>
    </div>
  );
}
