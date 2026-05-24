// app/dashboard/prompts/[promptId]/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveProject } from "@/lib/project-context";
import { VersionManager } from "./VersionManager";

export const metadata: Metadata = { title: "Prompt Versions" };

async function getPromptWithVersions(promptId: string, projectId: string) {
  const { data } = await supabaseAdmin
    .from("prompts")
    .select(
      "id, name, description, health_score, prompt_versions(id, version, content, model, is_deployed, created_at)",
    )
    .eq("id", projectId ? promptId : promptId)
    .eq("project_id", projectId)
    .order("created_at", {
      referencedTable: "prompt_versions",
      ascending: false,
    })
    .single();
  return data;
}

export default async function PromptDetailPage({
  params,
}: {
  params: Promise<{ promptId: string }>;
}) {
  const { promptId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const project = await getActiveProject();
  if (!project) redirect("/onboarding");

  const prompt = await getPromptWithVersions(promptId, project.id);
  if (!prompt) notFound();

  const sdkSnippet = `const content = await tracer.getPrompt("${prompt.name}");`;

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/dashboard/prompts"
          className="text-[#52525b] text-sm hover:text-[#71717a] transition-colors"
        >
          ← Prompt Registry
        </Link>
        <h1 className="mt-2 m-0 text-white text-2xl font-medium leading-tight tracking-[-0.02em]">
          {prompt.name}
        </h1>
        {prompt.description && (
          <p className="mt-1.5 text-[#71717a] text-sm m-0">
            {prompt.description}
          </p>
        )}
      </div>

      <div className="mb-6 bg-[#111] border border-[#1f1f1f] rounded-lg px-4 md:px-6 py-4">
        <p className="text-[#a1a1aa] text-[11px] uppercase tracking-[0.05em] mb-2">
          SDK Usage
        </p>
        <pre className="text-[12px] text-emerald-400 overflow-x-auto">
          {sdkSnippet}
        </pre>
      </div>

      <VersionManager
        promptId={prompt.id}
        versions={
          prompt.prompt_versions as Parameters<
            typeof VersionManager
          >[0]["versions"]
        }
      />
    </div>
  );
}
