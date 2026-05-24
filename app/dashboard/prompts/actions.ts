// app/dashboard/prompts/actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { redirect }       from "next/navigation";
import { createClient }   from "@/lib/supabase-server";
import { supabaseAdmin }  from "@/lib/supabase";
import { getActiveProject } from "@/lib/project-context";

export async function createPrompt(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const project = await getActiveProject();
  if (!project) redirect("/onboarding");

  const name        = (formData.get("name")        as string).trim();
  const description = (formData.get("description") as string | null)?.trim() ?? null;

  if (!name) return;

  await supabaseAdmin.from("prompts").insert({
    project_id: project.id,
    name,
    description,
  });

  revalidatePath("/dashboard/prompts");
}

export async function deletePrompt(promptId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabaseAdmin.from("prompts").delete().eq("id", promptId);

  revalidatePath("/dashboard/prompts");
}

export async function createVersion(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const promptId = formData.get("prompt_id") as string;
  const version  = (formData.get("version")  as string).trim();
  const content  = (formData.get("content")  as string).trim();
  const model    = (formData.get("model")    as string | null)?.trim() ?? null;

  if (!promptId || !version || !content) return;

  await supabaseAdmin.from("prompt_versions").insert({
    prompt_id: promptId,
    version,
    content,
    model,
  });

  revalidatePath(`/dashboard/prompts/${promptId}`);
}

export async function deployVersion(
  promptId:  string,
  versionId: string,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabaseAdmin
    .from("prompt_versions")
    .update({ is_deployed: false })
    .eq("prompt_id", promptId);

  await supabaseAdmin
    .from("prompt_versions")
    .update({ is_deployed: true })
    .eq("id", versionId);

  revalidatePath(`/dashboard/prompts/${promptId}`);
}

export async function deleteVersion(
  promptId:  string,
  versionId: string,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabaseAdmin.from("prompt_versions").delete().eq("id", versionId);

  revalidatePath(`/dashboard/prompts/${promptId}`);
}