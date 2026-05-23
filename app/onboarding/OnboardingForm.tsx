// app/onboarding/OnboardingForm.tsx
//
// "use client" — owns the two-step state machine:
//
//   Step 1 (NAMING)   → user types a project name and submits
//   Step 2 (KEY_READY) → server returned the plaintext key; user copies it
//
// The server action runs in step 1. Its result is held in React state so the
// plaintext key is only ever in memory on the client — never in a URL or cookie.

"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { createProjectWithKey } from "./actions";
import type { CreateProjectResult } from "./actions";

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "NAMING" | "KEY_READY";

// ── Component ─────────────────────────────────────────────────────────────────

export function OnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("NAMING");
  const [result, setResult] = useState<CreateProjectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Step 1: submit project name ──────────────────────────────────────────
  async function handleSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const res = await createProjectWithKey(formData);

      if (!res.ok) {
        setError(res.error);
        return;
      }

      setResult(res);
      setStep("KEY_READY");
    });
  }

  // ── Copy the key to clipboard ────────────────────────────────────────────
  async function handleCopy() {
    if (!result?.plainKey) return;
    await navigator.clipboard.writeText(result.plainKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // ── Navigate to dashboard ────────────────────────────────────────────────
  function handleGoToDashboard() {
    router.push("/dashboard");
  }

  // ── Render: Step 1 ───────────────────────────────────────────────────────
  if (step === "NAMING") {
    return (
      <form action={handleSubmit} className="space-y-5">
        {/* Project name input */}
        <div>
          <label
            htmlFor="projectName"
            className="block text-[#a1a1aa] text-[12px] uppercase tracking-[0.05em] mb-2"
          >
            Project Name
          </label>
          <input
            ref={inputRef}
            id="projectName"
            name="projectName"
            type="text"
            required
            autoFocus
            minLength={2}
            maxLength={64}
            placeholder="my-agent-app"
            className={[
              "w-full h-11 bg-[#0a0a0a] border border-[#262626] rounded-lg",
              "px-4 text-[14px] text-white font-mono placeholder:text-[#3f3f46]",
              "outline-none transition-colors duration-[120ms]",
              "focus:border-[#3b82f6]",
              error ? "border-[#f43f5e]" : "",
            ].join(" ")}
          />
          <p className="mt-2 text-[#52525b] text-[12px]">
            You can rename this later. Lowercase letters, numbers, and hyphens
            work best.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-3 bg-[#1f0a0a] border border-[#4a1111] rounded-lg text-[#f43f5e] text-[13px]">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending}
          className={[
            "w-full h-11 rounded-lg text-[14px] font-semibold",
            "inline-flex items-center justify-center gap-2",
            "transition-all duration-150",
            isPending
              ? "bg-[#1e3a5f] border border-[#1e3a8a] text-[#60a5fa] cursor-not-allowed"
              : "bg-[#3b82f6] text-white hover:bg-[#2563eb] active:scale-[0.98]",
          ].join(" ")}
        >
          {isPending ? (
            <>
              <span className="w-4 h-4 border-2 border-[#60a5fa] border-t-transparent rounded-full animate-spin" />
              Creating project…
            </>
          ) : (
            "Create Project →"
          )}
        </button>
      </form>
    );
  }

  // ── Render: Step 2 (key reveal) ──────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Success banner */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#052e16] border border-[#064e3b] rounded-lg">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#10b981"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span className="text-[#10b981] text-[13px]">
          Project{" "}
          <strong className="font-medium">
            {result?.keyPrefix?.replace("…", "").replace("0xt_live_", "")}
          </strong>{" "}
          created successfully.
        </span>
      </div>

      {/* Key reveal */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[#a1a1aa] text-[12px] uppercase tracking-[0.05em]">
            Your API Key
          </label>
          <span className="text-[#f59e0b] text-[11px] font-mono">
            ⚠ Shown once — copy now
          </span>
        </div>

        <div className="flex gap-2">
          <div
            className={[
              "flex-1 h-11 bg-[#0a0a0a] border border-[#262626] rounded-lg",
              "px-4 flex items-center font-mono text-[13px] text-[#e4e4e7]",
              "overflow-x-auto whitespace-nowrap",
            ].join(" ")}
          >
            {result?.plainKey}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className={[
              "h-11 px-4 rounded-lg border text-[13px] font-medium",
              "flex-none inline-flex items-center gap-2",
              "transition-all duration-150",
              copied
                ? "bg-[#052e16] border-[#064e3b] text-[#10b981]"
                : "bg-[#1a1a1a] border-[#333] text-[#a1a1aa] hover:border-[#555] hover:text-white",
            ].join(" ")}
          >
            {copied ? (
              <>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>

        <p className="mt-3 text-[#52525b] text-[12px] leading-relaxed">
          Store this key in your environment variables as{" "}
          <code className="font-mono text-[#71717a] bg-[#1a1a1a] px-1.5 py-0.5 rounded">
            INGEST_API_KEY
          </code>
          . It cannot be recovered after you leave this page.
        </p>
      </div>

      {/* Quick SDK snippet */}
      {/* Quick SDK snippet */}
<div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg overflow-hidden">
  <div className="px-4 py-2.5 border-b border-[#1f1f1f] flex items-center gap-2">
    <span className="w-2 h-2 rounded-full bg-[#3f3f46]" />
    <span className="w-2 h-2 rounded-full bg-[#3f3f46]" />
    <span className="w-2 h-2 rounded-full bg-[#3f3f46]" />
    <span className="ml-2 font-mono text-[11px] text-[#71717a]">terminal</span>
  </div>
  <pre className="p-4 text-[12px] font-mono leading-[1.8] overflow-x-auto">
    <span className="text-[#52525b]">$</span>
    <span className="text-[#e4e4e7]"> npm install @0xtrace/sdk</span>
  </pre>
</div>

<div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg overflow-hidden">
  <div className="px-4 py-2.5 border-b border-[#1f1f1f] flex items-center gap-2">
    <span className="w-2 h-2 rounded-full bg-[#3f3f46]" />
    <span className="w-2 h-2 rounded-full bg-[#3f3f46]" />
    <span className="w-2 h-2 rounded-full bg-[#3f3f46]" />
    <span className="ml-2 font-mono text-[11px] text-[#71717a]">tracer.ts</span>
  </div>
  <pre className="p-4 text-[12px] font-mono leading-[1.8] overflow-x-auto">
    <span className="text-[#71717a]">import </span>
    <span className="text-[#e4e4e7]">{"{ Tracer }"}</span>
    <span className="text-[#71717a]"> from </span>
    <span className="text-[#a1a1aa]">{'"@0xtrace/sdk"'}</span>
    {"\n\n"}
    <span className="text-[#71717a]">const </span>
    <span className="text-[#60a5fa]">tracer</span>
    <span className="text-[#71717a]"> = new </span>
    <span className="text-[#e4e4e7]">Tracer</span>
    <span className="text-[#71717a]">{"({"}</span>
    {"\n"}
    <span className="text-[#71717a]">{"  "}ingestUrl: </span>
    <span className="text-[#a1a1aa]">{`"${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/ingest"`}</span>
    <span className="text-[#71717a]">,</span>
    {"\n"}
    <span className="text-[#71717a]">{"  "}apiKey: </span>
    <span className="text-[#a1a1aa]">process.env.INGEST_API_KEY</span>
    <span className="text-[#71717a]">,</span>
    {"\n"}
    <span className="text-[#71717a]">{"});"}</span>
  </pre>
</div>

      {/* Go to dashboard */}
      <button
        type="button"
        onClick={handleGoToDashboard}
        className={[
          "w-full h-11 rounded-lg text-[14px] font-semibold",
          "inline-flex items-center justify-center gap-2",
          "bg-[#111] border border-[#333] text-[#e4e4e7]",
          "hover:border-[#555] hover:text-white transition-all duration-150",
          "active:scale-[0.98]",
        ].join(" ")}
      >
        Go to Dashboard →
      </button>
    </div>
  );
}
