// app/dashboard/settings/DeleteProjectButton.tsx
//
// "use client" — delete project with a two-step confirmation.
// Uses a server action that handles cascade deletion + cookie cleanup.

"use client";

import { useState, useTransition } from "react";
import { deleteProject } from "./actions";

export function DeleteProjectButton({ projectName }: { projectName: string }) {
  const [step, setStep] = useState<"idle" | "confirm" | "deleting">("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDelete() {
    setStep("deleting");
    setError(null);
    startTransition(async () => {
      const result = await deleteProject();
      // deleteProject redirects on success, so we only reach here on error
      if (!result.ok) {
        setError(result.error ?? "Deletion failed.");
        setStep("idle");
      }
    });
  }

  if (step === "idle") {
    return (
      <button
        type="button"
        onClick={() => setStep("confirm")}
        className="h-8 px-4 bg-[#1f0a0a] border border-[#4a1111] rounded text-[#f43f5e] text-[12px] hover:bg-[#2a0e0e] transition-colors"
      >
        Delete project
      </button>
    );
  }

  if (step === "confirm") {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[#f43f5e] text-[13px]">
          Delete <strong>{projectName}</strong> and all its traces? This cannot
          be undone.
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDelete}
            className="h-8 px-4 bg-[#f43f5e] rounded text-white text-[12px] font-medium hover:bg-[#e11d48] transition-colors"
          >
            Yes, delete everything
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("idle");
              setError(null);
            }}
            className="h-8 px-3 bg-[#1a1a1a] border border-[#262626] rounded text-[#a1a1aa] text-[12px] hover:border-[#555] transition-colors"
          >
            Cancel
          </button>
        </div>
        {error && <p className="w-full text-[#f43f5e] text-[12px]">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="w-4 h-4 border-2 border-[#f43f5e] border-t-transparent rounded-full animate-spin" />
      <span className="text-[#f43f5e] text-[13px]">Deleting project…</span>
    </div>
  );
}
