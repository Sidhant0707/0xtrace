// app/dashboard/actions.ts
"use server";

import { cookies }        from "next/headers";
import { redirect }       from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient }   from "@/lib/supabase-server";

const PROJECT_COOKIE_NAME = "oxtr_project";

export async function switchActiveProject(projectId: string) {
  const supabase = await createClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single();

  if (error || !project) {
    throw new Error("Project not found or access denied");
  }

  const cookieStore = await cookies();
  cookieStore.set(PROJECT_COOKIE_NAME, projectId, {
    path:     "/",
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   60 * 60 * 24 * 365,
  });

  revalidatePath("/dashboard", "layout");
}

export async function clearActiveProject(): Promise<void> {
  // ── Sign out of Supabase (invalidates the session) ──────────────────────
  const supabase = await createClient();
  await supabase.auth.signOut();

  // ── Clear the active project cookie ─────────────────────────────────────
  const cookieStore = await cookies();
  cookieStore.delete(PROJECT_COOKIE_NAME);

  redirect("/login");
}