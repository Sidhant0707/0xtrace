// app/onboarding/page.tsx
//
// Onboarding — two modes:
//
//   1. First-time user (/onboarding)
//      No projects exist → show "Welcome" flow
//
//   2. Adding a new project (/onboarding?new=true)
//      User already has projects → bypass the redirect guard
//      Header copy changes to "New project" instead of "Welcome"

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { OnboardingForm } from "./OnboardingForm";

export const metadata: Metadata = { title: "Set up your workspace · 0xtrace" };

interface PageProps {
  searchParams: Promise<{ new?: string }>;
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const supabase = await createClient();

  // ── Auth guard ─────────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Determine mode ─────────────────────────────────────────────────────────
  const sp = await searchParams;
  const isAddingNew = sp.new === "true";

  // ── Project guard ──────────────────────────────────────────────────────────
  // Only redirect if user is NOT explicitly adding a new project.
  if (!isAddingNew) {
    const { data: existing } = await supabase
      .from("projects")
      .select("id")
      .limit(1);

    if (existing && existing.length > 0) {
      redirect("/dashboard");
    }
  }

  // ── Display name ───────────────────────────────────────────────────────────
  const displayName: string =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.preferred_username as string | undefined) ??
    user.email ??
    "there";

  const firstName = displayName.split(" ")[0];

  // ── Copy varies by mode ────────────────────────────────────────────────────
  const heading = isAddingNew ? "New project" : `Welcome, ${firstName} 👋`;

  const subheading = isAddingNew
    ? "Create a new project and generate an API key."
    : "Create your first project to start ingesting traces. This takes about 30 seconds.";

  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center px-4">
      {/* Background grid */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 opacity-[0.02] bg-[linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] bg-[length:48px_48px]" />
        <div className="absolute top-0 left-0 right-0 h-[600px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#3b82f6]/10 via-transparent to-transparent" />
      </div>

      <div className="relative z-10 w-full max-w-[480px]">
        {/* Logo */}
        <div className="mb-10 text-center">
          <span className="font-mono text-[15px] font-semibold text-white">
            0x
          </span>
          <span className="font-mono text-[15px] font-normal text-[#a1a1aa]">
            trace
          </span>
        </div>

        {/* Card */}
        <div className="bg-[#111] border border-[#1f1f1f] rounded-xl p-8">
          {/* Header */}
          <div className="mb-8">
            {/* Back link — only shown when adding a new project */}
            {isAddingNew && (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-[#52525b] text-[12px] hover:text-[#a1a1aa] transition-colors no-underline mb-4"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
                Back to dashboard
              </Link>
            )}
            <h1 className="m-0 text-white text-[22px] font-semibold tracking-[-0.02em]">
              {heading}
            </h1>
            <p className="mt-2 mb-0 text-[#71717a] text-[14px] leading-relaxed">
              {subheading}
            </p>
          </div>

          {/* Steps indicator */}
          <div className="flex items-center gap-3 mb-8">
            {[
              { label: "Name project", n: "1" },
              { label: "Copy API key", n: "2" },
              { label: "Start tracing", n: "3" },
            ].map(({ label, n }, i) => (
              <div key={n} className="flex items-center gap-2 flex-1">
                <div
                  className={[
                    "w-6 h-6 rounded-full flex items-center justify-center",
                    "text-[11px] font-mono font-medium flex-none",
                    i === 0
                      ? "bg-[#3b82f6] text-white"
                      : "bg-[#1a1a1a] border border-[#262626] text-[#52525b]",
                  ].join(" ")}
                >
                  {n}
                </div>
                <span
                  className={[
                    "text-[12px] truncate",
                    i === 0 ? "text-[#a1a1aa]" : "text-[#3f3f46]",
                  ].join(" ")}
                >
                  {label}
                </span>
                {i < 2 && <div className="flex-1 h-px bg-[#1f1f1f] ml-1" />}
              </div>
            ))}
          </div>

          {/* Form */}
          <OnboardingForm />
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center font-mono text-[11px] text-[#3f3f46]">
          {isAddingNew
            ? "Each project has its own isolated traces and API keys."
            : "You can create more projects and rotate keys from Settings."}
        </p>
      </div>
    </div>
  );
}
