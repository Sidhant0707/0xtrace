// app/dashboard/settings/webhooks/page.tsx

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveProject } from "@/lib/project-context";
import { WebhookManager } from "./WebhookManager";

export const metadata: Metadata = { title: "Webhooks" };

async function getWebhooks(projectId: string) {
  const { data } = await supabaseAdmin
    .from("webhook_configs")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

async function getDeliveries(projectId: string) {
  const { data } = await supabaseAdmin
    .from("webhook_deliveries")
    .select(
      "webhook_configs!inner(project_id), id, webhook_id, trigger_type, status, response_code, response_body, delivered_at, created_at",
    )
    .eq("webhook_configs.project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
return (data ?? []).map(({ webhook_configs: _wc, ...rest }) => rest);
}

export default async function WebhooksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const project = await getActiveProject();
  if (!project) redirect("/onboarding");

  const [webhooks, deliveries] = await Promise.all([
    getWebhooks(project.id),
    getDeliveries(project.id),
  ]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="m-0 text-white text-2xl font-medium leading-tight tracking-[-0.02em]">
          Webhooks
        </h1>
        <p className="mt-1.5 text-[#71717a] text-sm m-0">
          {project.name} · Real-time anomaly alerts for Slack, Discord, or any
          HTTP endpoint
        </p>
      </div>

      <WebhookManager
        webhooks={webhooks as Parameters<typeof WebhookManager>[0]["webhooks"]}
        deliveries={
          deliveries as Parameters<typeof WebhookManager>[0]["deliveries"]
        }
      />
    </div>
  );
}
