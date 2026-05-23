// lib/project-context.ts
// ============================================================================
// Project Context Utility (v2)
// ============================================================================
// Retrieves the active project from cookie with fallback to first project.
// Cookie is a UX preference only — RLS enforces actual data ownership.
//
// Resolution order:
//   1. Cookie `oxtr_project` — if valid and owned by the user
//   2. First project in user's list — fallback for first login
//   3. null — user has no projects → redirect to /onboarding

import { cookies }      from "next/headers";
import { redirect }     from "next/navigation";
import { createClient } from "@/lib/supabase-server";

// ── Constants ─────────────────────────────────────────────────────────────────

export const ACTIVE_PROJECT_COOKIE = "oxtr_project";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Project {
  id:         string;
  name:       string;
  created_at: string;
  updated_at: string;
  user_id:    string;
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
    .select("id, name, created_at, updated_at, user_id")
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
 *   1. Cookie `oxtr_project` — validated via RLS
 *   2. First project in user's list — first login fallback
 *   3. null — user has no projects
 */
export async function getActiveProject(): Promise<Project | null> {
  const supabase    = await createClient();
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value;

  // ── Try the cookied project first ─────────────────────────────────────────
  if (cookieValue) {
    const { data } = await supabase
      .from("projects")
      .select("id, name, created_at, updated_at, user_id")
      .eq("id", cookieValue)
      .single();

    // RLS returns null if project doesn't belong to this user
    if (data) return data as Project;
  }

  // ── Fall back to the first project ────────────────────────────────────────
  // Handles first login where the cookie was never set.
  const projects = await getUserProjects();
  return projects[0] ?? null;
}

/**
 * Returns only the active project's ID — used in data queries.
 * Redirects to /onboarding if the user has no projects.
 */
export async function getActiveProjectId(): Promise<string> {
  const project = await getActiveProject();

  if (!project) {
    redirect("/onboarding");
  }

  return project.id;
}