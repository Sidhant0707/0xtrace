// app/dashboard/settings/page.tsx

import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveProject } from "@/lib/project-context";
import { KeyManager } from "./KeyManager";
import { DeleteProjectButton } from "./DeleteProjectButton";
import type { ApiKeyRow } from "./KeyManager";

export const metadata: Metadata = { title: "Settings" };

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getApiKeys(projectId: string): Promise<ApiKeyRow[]> {
  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, name, key_prefix, is_active, last_used_at, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[settings] keys fetch failed:", error.message);
    return [];
  }

  return (data ?? []) as ApiKeyRow[];
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden">
      <div className="px-6 py-5 border-b border-[#1f1f1f] bg-[#0a0a0a]">
        <h2 className="m-0 text-white text-[14px] font-medium">{title}</h2>
        {description && (
          <p className="mt-1 mb-0 text-[#71717a] text-[12px]">{description}</p>
        )}
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SettingsPage() {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeProject = await getActiveProject();
  if (!activeProject) redirect("/onboarding");

  const keys = await getApiKeys(activeProject.id);

  // ── Profile data from GitHub OAuth metadata ────────────────────────────────
  const avatarUrl =
    (user.user_metadata?.avatar_url as string | undefined) ?? "";
  const fullName =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "Developer";
  const githubLogin =
    (user.user_metadata?.preferred_username as string | undefined) ?? "";

  // ── Ingest URL — derived from env so it resolves correctly on every deployment
  const ingestUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/ingest`;

  return (
    <div>
      {/* ── Page header ── */}
      <div className="mb-8">
        <h1 className="m-0 text-white text-2xl font-medium leading-tight tracking-[-0.02em]">
          Settings
        </h1>
        <p className="mt-1.5 text-[#71717a] text-sm m-0">
          {activeProject.name} · API keys, integration config, and project
          management
        </p>
      </div>

      {/* grid-cols Tailwind arbitrary value replaces the inline style */}
      <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-6">
        {/* ── LEFT column ── */}
        <div className="flex flex-col gap-6">
          {/* SDK Integration */}
          <Section
            title="SDK Integration"
            description="Use these values to configure the 0xtrace SDK in your application."
          >
            <div className="space-y-4">
              {/* Ingest URL — readOnly input so the user can click-select and copy */}
              <div>
                <label
                  htmlFor="ingest-url"
                  className="block text-[#a1a1aa] text-[11px] uppercase tracking-[0.05em] mb-1.5"
                >
                  Ingest URL
                </label>
                <input
                  id="ingest-url"
                  type="text"
                  readOnly
                  value={ingestUrl}
                  className="w-full h-9 bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 font-mono text-[12px] text-[#a1a1aa] outline-none cursor-text select-all"
                />
              </div>

              {/* SDK snippet */}
              <div className="p-4 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg font-mono text-[12px] leading-[1.8]">
                <span className="text-[#71717a]">const </span>
                <span className="text-[#60a5fa]">tracer</span>
                <span className="text-[#71717a]"> = new </span>
                <span className="text-[#e4e4e7]">Tracer</span>
                <span className="text-[#71717a]">{"({"}</span>
                <br />
                <span className="text-[#71717a]">{"  "}ingestUrl: </span>
                <span className="text-[#a1a1aa]">process.env.INGEST_URL</span>
                <span className="text-[#71717a]">,</span>
                <br />
                <span className="text-[#71717a]">{"  "}apiKey: </span>
                <span className="text-[#a1a1aa]">
                  process.env.INGEST_API_KEY
                </span>
                <span className="text-[#71717a]">,</span>
                <br />
                <span className="text-[#71717a]">{"});"}</span>
              </div>
            </div>
          </Section>

          {/* API Keys */}
          <Section
            title="API Keys"
            description="Keys authenticate your SDK with the ingest endpoint. Revoked keys are rejected immediately."
          >
            <KeyManager initialKeys={keys} />
          </Section>

          {/* Danger zone — intentionally not using Section to keep its red border distinct */}
          <section className="bg-[#111] border border-[#f43f5e]/20 rounded-lg overflow-hidden">
            <div className="px-6 py-5 border-b border-[#f43f5e]/10 bg-[#0a0a0a]">
              <h2 className="m-0 text-[#f43f5e] text-[14px] font-medium">
                Danger Zone
              </h2>
              <p className="mt-1 mb-0 text-[#71717a] text-[12px]">
                Destructive actions that cannot be undone.
              </p>
            </div>
            <div className="px-6 py-5 flex items-center justify-between gap-6 flex-wrap">
              <div>
                <p className="m-0 text-[#e4e4e7] text-[13px] font-medium">
                  Delete &ldquo;{activeProject.name}&rdquo;
                </p>
                <p className="mt-1 mb-0 text-[#71717a] text-[12px]">
                  Permanently removes this project, all API keys, all traces,
                  and all snapshots.
                </p>
              </div>
              <DeleteProjectButton projectName={activeProject.name} />
            </div>
          </section>
        </div>

        {/* ── RIGHT column: Account card ── */}
        <aside className="h-fit bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[#1f1f1f] bg-[#0a0a0a]">
            <h2 className="m-0 text-white text-[14px] font-medium">Account</h2>
          </div>

          <div className="p-6 flex flex-col items-center text-center">
            {/* Avatar — next/image replaces <img>. Domain must be in next.config.ts:
                images: { remotePatterns: [{ hostname: "avatars.githubusercontent.com" }] } */}
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={`${fullName} avatar`}
                width={64}
                height={64}
                className="rounded-full border-2 border-[#262626] mb-4"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#1a1a1a] border-2 border-[#262626] mb-4 flex items-center justify-center text-[#71717a] text-lg font-mono">
                {fullName.slice(0, 2).toUpperCase()}
              </div>
            )}

            <h3 className="m-0 text-white text-[14px] font-medium">
              {fullName}
            </h3>
            {githubLogin && (
              <p className="mt-1 mb-0 text-[#71717a] text-[12px] font-mono">
                @{githubLogin}
              </p>
            )}

            <div className="w-full h-px bg-[#1f1f1f] my-5" />

            <div className="w-full space-y-2 text-[12px]">
              <div className="flex justify-between">
                <span className="text-[#71717a]">Auth provider</span>
                <span className="text-[#a1a1aa] flex items-center gap-1.5">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  GitHub
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#71717a]">Active project</span>
                <span className="text-[#10b981]">{activeProject.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#71717a]">API keys</span>
                <span className="text-[#a1a1aa]">
                  {keys.filter((k) => k.is_active).length} active
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
