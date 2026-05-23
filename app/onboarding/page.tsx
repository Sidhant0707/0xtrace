// app/onboarding/page.tsx
//
// New-user onboarding — reached automatically from /auth/callback
// when no project exists yet.
//
// This is a Server Component. Auth is verified server-side before render.
// The interactive form is split into OnboardingForm (client component).

import type { Metadata }   from "next";
import { redirect }        from "next/navigation";
import { createClient }    from "@/lib/supabase-server";
import { OnboardingForm }  from "./OnboardingForm";

export const metadata: Metadata = { title: "Set up your workspace · 0xtrace" };

export default async function OnboardingPage() {
  const supabase = await createClient();

  // ── Guard: must be authenticated ──────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Guard: skip onboarding if they already have a project ─────────────────
  // Handles the case where someone navigates here directly after setup.
  const { data: existing } = await supabase
    .from("projects")
    .select("id")
    .limit(1);

  if (existing && existing.length > 0) {
    redirect("/dashboard");
  }

  // ── Extract a friendly display name from OAuth metadata ───────────────────
  const displayName: string =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.preferred_username as string | undefined) ??
    user.email ??
    "there";

  const firstName = displayName.split(" ")[0];

  return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center px-4">
      {/* Subtle background grid — matches the landing page */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 opacity-[0.02] bg-[linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] bg-[length:48px_48px]" />
        <div className="absolute top-0 left-0 right-0 h-[600px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#3b82f6]/10 via-transparent to-transparent" />
      </div>

      <div className="relative z-10 w-full max-w-[480px]">
        {/* Logo */}
        <div className="mb-10 text-center">
          <span className="font-mono text-[15px] font-semibold text-white">0x</span>
          <span className="font-mono text-[15px] font-normal text-[#a1a1aa]">trace</span>
        </div>

        {/* Card */}
        <div className="bg-[#111] border border-[#1f1f1f] rounded-xl p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="m-0 text-white text-[22px] font-semibold tracking-[-0.02em]">
              Welcome, {firstName} 👋
            </h1>
            <p className="mt-2 mb-0 text-[#71717a] text-[14px] leading-relaxed">
              Create your first project to start ingesting traces.
              This takes about 30 seconds.
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
                <div className={[
                  "w-6 h-6 rounded-full flex items-center justify-center",
                  "text-[11px] font-mono font-medium flex-none",
                  i === 0
                    ? "bg-[#3b82f6] text-white"
                    : "bg-[#1a1a1a] border border-[#262626] text-[#52525b]",
                ].join(" ")}>
                  {n}
                </div>
                <span className={[
                  "text-[12px] truncate",
                  i === 0 ? "text-[#a1a1aa]" : "text-[#3f3f46]",
                ].join(" ")}>
                  {label}
                </span>
                {i < 2 && (
                  <div className="flex-1 h-px bg-[#1f1f1f] ml-1" />
                )}
              </div>
            ))}
          </div>

          {/* The interactive form */}
          <OnboardingForm />
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center font-mono text-[11px] text-[#3f3f46]">
          You can create more projects and rotate keys from Settings.
        </p>
      </div>
    </div>
  );
}