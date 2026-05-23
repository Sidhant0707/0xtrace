// app/dashboard/actions.ts
//
// Server actions for the dashboard shell.
// These are called from client components (ProjectSwitcher)
// and need to be in a separate "use server" file.

"use server";

import { cookies }                from "next/headers";
import { createClient }           from "@/lib/supabase-server";
import { ACTIVE_PROJECT_COOKIE }  from "@/lib/project-context";
import { redirect }               from "next/navigation";

/**
 * Sets the active project cookie to the given project ID.
 * Validates that the project belongs to the current user before setting.
 */
export async function switchActiveProject(projectId: string): Promise<void> {
  const supabase = await createClient();

  // Verify the user owns this project (RLS handles the ownership check)
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single();

  if (error || !data) {
    // Silently ignore invalid project IDs — don't throw into client
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_PROJECT_COOKIE, projectId, {
    httpOnly: true,
    sameSite: "lax",
    secure:   process.env.NODE_ENV === "production",
    // 30 days
    maxAge:   60 * 60 * 24 * 30,
    path:     "/",
  });
}

/**
 * Clears the active project cookie (used on logout).
 */
export async function clearActiveProject(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_PROJECT_COOKIE);
  redirect("/login");
}