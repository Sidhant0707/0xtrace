// app/dashboard/settings/webhooks/actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { redirect }       from "next/navigation";
import { createClient }   from "@/lib/supabase-server";
import { supabaseAdmin }  from "@/lib/supabase";
import { getActiveProject } from "@/lib/project-context";
import type { WebhookTrigger, WebhookProvider } from "@/lib/webhooks";

export async function createWebhook(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const project = await getActiveProject();
  if (!project) redirect("/onboarding");

  const name     = formData.get("name") as string;
  const url      = formData.get("url")  as string;
  const provider = formData.get("provider") as WebhookProvider;
  const triggers = formData.getAll("triggers") as WebhookTrigger[];

  if (!name || !url || !provider || triggers.length === 0) return;

  await supabaseAdmin.from("webhook_configs").insert({
    project_id: project.id,
    name,
    url,
    provider,
    triggers,
  });

  revalidatePath("/dashboard/settings/webhooks");
}

export async function deleteWebhook(webhookId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabaseAdmin
    .from("webhook_configs")
    .delete()
    .eq("id", webhookId);

  revalidatePath("/dashboard/settings/webhooks");
}

export async function toggleWebhook(
  webhookId: string,
  isActive:  boolean,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabaseAdmin
    .from("webhook_configs")
    .update({ is_active: isActive })
    .eq("id", webhookId);

  revalidatePath("/dashboard/settings/webhooks");
}