// app/dashboard/actions.ts
// ============================================================================
// Server Actions for Dashboard
// ============================================================================
// These actions handle project switching and management.
// They must be "use server" to run on the server with access to cookies.

"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";

const PROJECT_COOKIE_NAME = "oxtr_project";

/**
 * Switch the active project.
 * Validates that the user owns the project before setting the cookie.
 * 
 * @param projectId - The UUID of the project to switch to
 * @throws Error if project doesn't exist or user doesn't own it
 */
export async function switchActiveProject(projectId: string) {
  const supabase = await createClient();

  // ── Validate project ownership via RLS ───────────────────────────────────
  const { data: project, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single();

  if (error || !project) {
    throw new Error("Project not found or access denied");
  }

  // ── Set the active project cookie ────────────────────────────────────────
  const cookieStore = await cookies();
  cookieStore.set(PROJECT_COOKIE_NAME, projectId, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  // ── Revalidate all dashboard pages ───────────────────────────────────────
  // This forces Next.js to re-fetch data with the new project context
  revalidatePath("/dashboard", "layout");
}

/**
 * Clear the active project cookie and redirect to onboarding.
 * Used when deleting a project or logging out.
 */
export async function clearActiveProject() {
  const cookieStore = await cookies();
  cookieStore.delete(PROJECT_COOKIE_NAME);
  
  // Revalidate to clear any cached data
  revalidatePath("/dashboard", "layout");
}