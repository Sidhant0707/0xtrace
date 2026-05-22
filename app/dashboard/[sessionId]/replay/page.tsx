import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { replayDiffs, type MessageDiff } from "@/lib/diff";
import type { SearchParams } from "@/types/next";
import { ReplayPlayground } from "@/components/dashboard/ReplayPlayground";
import type { ChatMessage } from "@/packages/sdk/src/core/types";

export const metadata: Metadata = { title: "Replay Engine" };

interface PageProps {
  params: Promise<{ sessionId: string }>;
  searchParams: SearchParams;
}

export default async function ReplayPage({ params, searchParams }: PageProps) {
  const { sessionId } = await params;
  const sp = await searchParams;
  const stepIndex = typeof sp.step === "string" ? parseInt(sp.step, 10) : 1;

  // ── 1. Fetch all snapshots up to the requested step ───────────────────────
  const { data: snapshots, error } = await supabaseAdmin
    .from("prompt_snapshots")
    .select("step_index, full_snapshot, diff_from_previous")
    .eq("session_id", sessionId)
    .lte("step_index", stepIndex)
    .order("step_index", { ascending: true });

  if (error || !snapshots || snapshots.length === 0) {
    notFound();
  }

  // ── 2. Reconstruct the full messages array using diffs ────────────────────
  const step1 = snapshots.find((s) => s.step_index === 1);
  if (!step1?.full_snapshot) {
    notFound();
  }

  const diffs = snapshots
    .filter((s) => s.step_index > 1 && s.diff_from_previous)
    .map((s) => s.diff_from_previous as unknown as MessageDiff);

  const initialMessages = replayDiffs(step1.full_snapshot as ChatMessage[], diffs);

  // ── 3. Fetch original call metadata ───────────────────────────────────────
  const { data: callMeta } = await supabaseAdmin
    .from("llm_calls")
    .select("model")
    .eq("session_id", sessionId)
    .eq("step_index", stepIndex)
    .single();

  const defaultModel = callMeta?.model || "gpt-4o";
  
  // Hardcoded standard routing — matches our Replay API switch logic
  const availableModels = [
    "gpt-4o",
    "gpt-4o-mini",
    "llama-3.1-8b-instant",
    "llama-3.1-70b-versatile",
    "mixtral-8x7b-32768",
    "gemma2-9b-it"
  ];

  if (!availableModels.includes(defaultModel)) {
    availableModels.push(defaultModel);
  }

  const truncatedId = sessionId.length > 20 ? `${sessionId.slice(0, 16)}…` : sessionId;

  return (
    <div>
      {/* ── Breadcrumbs ── */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-[#52525b] text-[13px] mb-2">
          <Link href="/dashboard" className="hover:text-[#a1a1aa] no-underline transition-colors">
            Sessions
          </Link>
          <span aria-hidden="true">›</span>
          <Link href={`/dashboard/${encodeURIComponent(sessionId)}`} className="hover:text-[#a1a1aa] no-underline transition-colors">
            {truncatedId}
          </Link>
          <span aria-hidden="true">›</span>
          <Link href={`/dashboard/${encodeURIComponent(sessionId)}/diff?step=${stepIndex}`} className="hover:text-[#a1a1aa] no-underline transition-colors">
            Step {stepIndex}
          </Link>
          <span aria-hidden="true">›</span>
          <span className="text-[#a1a1aa]">Replay</span>
        </div>
        <h1 className="m-0 text-white text-2xl font-medium leading-tight tracking-[-0.02em]">
          Replay Engine
        </h1>
        <p className="mt-1.5 text-[#71717a] text-sm m-0">
          Edit the historical prompt and run it against different models to compare outputs.
        </p>
      </div>

      {/* ── Client Sandbox ── */}
      <ReplayPlayground
        initialMessages={initialMessages}
        defaultModel={defaultModel}
        availableModels={availableModels}
      />
    </div>
  );
}