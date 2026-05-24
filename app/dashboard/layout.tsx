// app/dashboard/layout.tsx

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { getUserProjects, getActiveProject } from "@/lib/project-context";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const metadata: Metadata = {
  title: {
    template: "%s · 0xtrace",
    default: "0xtrace · AI Observability",
  },
  description:
    "Intercept, visualize, diff, and cost-analyze every LLM call your agent makes.",
};

async function getAnomalyCount(projectId: string): Promise<number> {
  const { supabaseAdmin } = await import("@/lib/supabase");
  const { count, error } = await supabaseAdmin
    .from("llm_calls")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("metadata->>anomaly", "true");

  if (error) return 0;
  return count ?? 0;
}

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [projects, activeProject] = await Promise.all([
    getUserProjects(),
    getActiveProject(),
  ]);

  if (projects.length === 0 || !activeProject) redirect("/onboarding");

  const anomalyCount = await getAnomalyCount(activeProject.id);

  return (
    <DashboardShell
      anomalyCount={anomalyCount}
      projects={projects}
      activeProject={activeProject}
    >
      {children}
    </DashboardShell>
  );
}
