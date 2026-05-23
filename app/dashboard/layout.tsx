// app/dashboard/layout.tsx
//
// Root layout shell for the entire dashboard.
//
// v2 additions:
//   - Fetches the user's projects and active project server-side
//   - Redirects unauthenticated users to /login
//   - Redirects users with no projects to /onboarding
//   - Passes project data to SidebarNav for the project switcher

import type { Metadata }          from "next";
import { redirect }               from "next/navigation";
import { createClient }           from "@/lib/supabase-server";
import { getUserProjects, getActiveProject } from "@/lib/project-context";
import { SidebarNav }             from "@/components/dashboard/SidebarNav";

export interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const metadata: Metadata = {
  title: {
    template: "%s · 0xtrace",
    default:  "0xtrace · AI Observability",
  },
  description:
    "Intercept, visualize, diff, and cost-analyze every LLM call your agent makes.",
};

// ── Anomaly count ─────────────────────────────────────────────────────────────

async function getAnomalyCount(projectId: string): Promise<number> {
  const { supabaseAdmin } = await import("@/lib/supabase");

  const { count, error } = await supabaseAdmin
    .from("llm_calls")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("metadata->>anomaly", "true");

  if (error) {
    console.warn("[layout] anomaly count query failed:", error.message);
    return 0;
  }

  return count ?? 0;
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  // ── Auth guard ─────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Project guard ──────────────────────────────────────────────────────────
  const [projects, activeProject] = await Promise.all([
    getUserProjects(),
    getActiveProject(),
  ]);

  if (projects.length === 0 || !activeProject) {
    redirect("/onboarding");
  }

  const anomalyCount = await getAnomalyCount(activeProject.id);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#a1a1aa]">
      <SidebarNav
        anomalyCount={anomalyCount}
        projects={projects}
        activeProject={activeProject}
      />
      <main className="ml-[240px] min-h-screen overflow-x-hidden">
        <div className="max-w-[1400px] p-9">{children}</div>
      </main>
    </div>
  );
}