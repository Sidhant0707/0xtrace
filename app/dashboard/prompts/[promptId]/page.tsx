// app/dashboard/prompts/[promptId]/page.tsx

import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveProject } from "@/lib/project-context";
import { VersionManager } from "./VersionManager";

export const metadata: Metadata = { title: "Prompt Versions" };

// ─── Types ───────────────────────────────────────────────────────────────────

interface PromptEventRow {
  id: string;
  event_type: "deployed" | "reverted" | "score_updated";
  version_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  prompt_versions: { version: string } | null;
}

/** Shape Supabase actually returns for joined one-to-many rows */
type RawPromptEventRow = Omit<PromptEventRow, "prompt_versions"> & {
  prompt_versions: { version: string }[] | null;
};

// ─── Event config ─────────────────────────────────────────────────────────────
// `satisfies` keeps the type narrow (no widening to `string`) while also
// enforcing exhaustiveness — TypeScript will error if event_type gains a new
// variant that isn't covered here.

const eventConfig = {
  deployed: {
    label: "Deployed",
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  reverted: {
    label: "Auto-reverted",
    dot: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  score_updated: {
    label: "Score updated",
    dot: "bg-zinc-600",
    badge: "bg-zinc-800 text-zinc-400 border-zinc-700",
  },
} satisfies Record<
  PromptEventRow["event_type"],
  { label: string; dot: string; badge: string }
>;

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function getPromptWithVersions(promptId: string, projectId: string) {
  const { data } = await supabaseAdmin
    .from("prompts")
    .select(
      "id, name, description, health_score, prompt_versions(id, version, content, model, is_deployed, created_at)",
    )
    .eq("id", promptId)
    .eq("project_id", projectId)
    .order("created_at", {
      referencedTable: "prompt_versions",
      ascending: false,
    })
    .single();
  return data;
}

async function getPromptEvents(promptId: string): Promise<PromptEventRow[]> {
  const { data } = await supabaseAdmin
    .from("prompt_events")
    .select(
      "id, event_type, version_id, metadata, created_at, prompt_versions(version)",
    )
    .eq("prompt_id", promptId)
    .order("created_at", { ascending: false })
    .limit(20);

  // Supabase returns joined rows as arrays even for to-one relations.
  // Normalise to a plain object (or null) so the rest of the code stays simple.
  return (data ?? []).map((event: RawPromptEventRow) => ({
    ...event,
    prompt_versions:
      Array.isArray(event.prompt_versions) && event.prompt_versions.length > 0
        ? event.prompt_versions[0]
        : null,
  }));
}

// ─── EventLog component ───────────────────────────────────────────────────────

function EventLog({ events }: { events: PromptEventRow[] }) {
  if (events.length === 0) return null;

  return (
    <section className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden">
      <div className="px-4 md:px-6 py-4 border-b border-[#1f1f1f] bg-[#0a0a0a]">
        <h2 className="text-white text-[14px] font-medium m-0">
          Event Log
          <span className="ml-2 text-[#52525b] font-normal">
            ({events.length})
          </span>
        </h2>
      </div>

      <div className="px-4 md:px-6 py-5">
        <ol className="relative border-l border-[#1f1f1f] space-y-0">
          {events.map((event, index) => {
            // Safe lookup — `satisfies` above guarantees every event_type is a key
            const cfg = eventConfig[event.event_type];
            const versionLabel = event.prompt_versions?.version;
            const fromVersion = event.metadata?.from_version as
              | string
              | undefined;
            const toVersion = event.metadata?.to_version as string | undefined;
            const healthScore = event.metadata?.health_score as
              | number
              | undefined;
            const isLast = index === events.length - 1;

            return (
              <li key={event.id} className={`ml-4 ${isLast ? "pb-0" : "pb-6"}`}>
                <span
                  className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border border-[#0a0a0a] ${cfg.dot}`}
                />

                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded border font-medium ${cfg.badge}`}
                  >
                    {cfg.label}
                  </span>

                  {event.event_type === "deployed" && versionLabel && (
                    <span className="text-[#a1a1aa] text-[12px]">
                      v{versionLabel}
                    </span>
                  )}

                  {event.event_type === "reverted" &&
                    fromVersion &&
                    toVersion && (
                      <span className="text-[#a1a1aa] text-[12px]">
                        v{fromVersion}
                        <span className="mx-1.5 text-[#3f3f46]">→</span>v
                        {toVersion}
                      </span>
                    )}

                  {event.event_type === "reverted" &&
                    healthScore !== undefined && (
                      <span className="text-red-400 text-[11px]">
                        score: {healthScore.toFixed(1)}
                      </span>
                    )}
                </div>

                <time className="text-[#52525b] text-[11px]">
                  {new Date(event.created_at).toLocaleString()}
                </time>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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

  const [prompt, events] = await Promise.all([
    getPromptWithVersions(promptId, project.id),
    getPromptEvents(promptId),
  ]);

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

      <div className="space-y-6">
        <VersionManager
          promptId={prompt.id}
          versions={prompt.prompt_versions}
        />

        <EventLog events={events} />
      </div>
    </div>
  );
}
