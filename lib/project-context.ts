// lib/project-context.ts
//
// Server-side utilities for reading the active project.
//
// Architecture:
//   - Active project is stored in a cookie: `oxtr_project`
//   - All dashboard queries use the active project ID to filter data
//   - getUserProjects() relies on RLS — only returns projects the user owns
//   - getActiveProject() validates that the cookied project belongs to the user
//     before trusting it, preventing ID-spoofing attacks

import { cookies }       from "next/headers";
import { createClient }  from "@/lib/supabase-server";

// ── Constants ─────────────────────────────────────────────────────────────────

export const ACTIVE_PROJECT_COOKIE = "oxtr_project";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Project {
  id:         string;
  name:       string;
  created_at: string;
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Returns all projects owned by the currently authenticated user.
 * RLS on the projects table ensures this is always user-scoped.
 */
export async function getUserProjects(): Promise<Project[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[project-context] getUserProjects failed:", error.message);
    return [];
  }

  return (data ?? []) as Project[];
}

/**
 * Returns the active project for the current request.
 *
 * Resolution order:
 *   1. Cookie `oxtr_project` — if valid and owned by the user
 *   2. First project in the user's list — fallback if cookie is stale/missing
 *   3. null — user has no projects (should redirect to /onboarding)
 */
export async function getActiveProject(): Promise<Project | null> {
  const supabase    = await createClient();
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value;

  // ── Try the cookied project first ─────────────────────────────────────────
  if (cookieValue) {
    const { data } = await supabase
      .from("projects")
      .select("id, name, created_at")
      .eq("id", cookieValue)
      .single();

    // RLS will return null if the project doesn't belong to this user
    if (data) return data as Project;
  }

  // ── Fall back to the first project ────────────────────────────────────────
  const projects = await getUserProjects();
  return projects[0] ?? null;
}

/**
 * Returns only the active project's ID — used in data queries.
 * Returns null when the user has no projects.
 */
export async function getActiveProjectId(): Promise<string | null> {
  const project = await getActiveProject();
  return project?.id ?? null;
}