// app/dashboard/prompts/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveProject } from "@/lib/project-context";
import { createPrompt, deletePrompt } from "./actions";

export const metadata: Metadata = { title: "Prompt Registry" };

interface PromptRow {
  id: string;
  name: string;
  description: string | null;
  health_score: number;
  created_at: string;
  prompt_versions: { version: string; is_deployed: boolean }[];
}

async function getPrompts(projectId: string): Promise<PromptRow[]> {
  const { data } = await supabaseAdmin
    .from("prompts")
    .select(
      "id, name, description, health_score, created_at, prompt_versions(version, is_deployed)",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return (data ?? []) as PromptRow[];
}

function HealthBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
      : score >= 50
        ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
        : "text-red-400 bg-red-500/10 border-red-500/20";

  return (
    <span
      className={`text-[11px] px-2 py-0.5 rounded border font-medium ${color}`}
    >
      {score.toFixed(0)}
    </span>
  );
}

export default async function PromptsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const project = await getActiveProject();
  if (!project) redirect("/onboarding");

  const prompts = await getPrompts(project.id);

  return (
    <div>
      <div className="mb-8">
        <h1 className="m-0 text-white text-2xl font-medium leading-tight tracking-[-0.02em]">
          Prompt Registry
        </h1>
        <p className="mt-1.5 text-[#71717a] text-sm m-0">
          {project.name} · Version and deploy prompts. Fetch them at runtime via
          the SDK.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <section className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden">
          <div className="px-4 md:px-6 py-4 border-b border-[#1f1f1f] bg-[#0a0a0a] flex items-center justify-between">
            <h2 className="text-white text-[14px] font-medium m-0">
              Prompts
              <span className="ml-2 text-[#52525b] font-normal">
                ({prompts.length})
              </span>
            </h2>
          </div>

          {prompts.length === 0 ? (
            <div className="px-6 py-12 text-center text-[#52525b] text-sm">
              No prompts yet. Create one to get started.
            </div>
          ) : (
            <div className="divide-y divide-[#1f1f1f]">
              {prompts.map((p) => {
                const deployed = p.prompt_versions.find((v) => v.is_deployed);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-4 px-4 md:px-6 py-4 hover:bg-[#0a0a0a] transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/dashboard/prompts/${p.id}`}
                          className="text-white text-sm font-medium hover:text-[#a1a1aa] transition-colors"
                        >
                          {p.name}
                        </Link>
                        {deployed && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1f1f1f] text-[#71717a]">
                            v{deployed.version}
                          </span>
                        )}
                      </div>
                      {p.description && (
                        <p className="text-[#52525b] text-[12px] mt-0.5 truncate">
                          {p.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <HealthBadge score={p.health_score} />
                      <form action={deletePrompt.bind(null, p.id)}>
                        <button
                          type="submit"
                          className="text-[11px] text-[#52525b] hover:text-red-400 transition-colors"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden h-fit">
          <div className="px-4 md:px-6 py-4 border-b border-[#1f1f1f] bg-[#0a0a0a]">
            <h2 className="text-white text-[14px] font-medium m-0">
              New Prompt
            </h2>
          </div>
          <form action={createPrompt} className="px-4 md:px-6 py-5 space-y-4">
            <div>
              <label className="block text-[#a1a1aa] text-[11px] uppercase tracking-[0.05em] mb-1.5">
                Name
              </label>
              <input
                name="name"
                required
                placeholder="e.g. customer_support_agent"
                className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded px-3 py-2 text-white text-sm placeholder-[#3f3f46] focus:outline-none focus:border-[#3f3f46]"
              />
            </div>
            <div>
              <label className="block text-[#a1a1aa] text-[11px] uppercase tracking-[0.05em] mb-1.5">
                Description
              </label>
              <input
                name="description"
                placeholder="Optional"
                className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded px-3 py-2 text-white text-sm placeholder-[#3f3f46] focus:outline-none focus:border-[#3f3f46]"
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2 bg-white text-black text-sm font-medium rounded hover:bg-[#e5e5e5] transition-colors"
            >
              Create Prompt
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
