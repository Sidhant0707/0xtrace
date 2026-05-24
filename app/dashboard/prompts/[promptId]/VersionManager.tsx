// app/dashboard/prompts/[promptId]/VersionManager.tsx

"use client";

import { useState, useTransition } from "react";
import { createVersion, deployVersion, deleteVersion } from "../actions";

interface VersionRow {
  id: string;
  version: string;
  content: string;
  model: string | null;
  is_deployed: boolean;
  created_at: string;
}

interface Props {
  promptId: string;
  versions: VersionRow[];
}

export function VersionManager({ promptId, versions }: Props) {
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);

  function handleDeploy(versionId: string) {
    startTransition(() => {
      deployVersion(promptId, versionId);
    });
  }

  function handleDelete(versionId: string) {
    startTransition(() => {
      deleteVersion(promptId, versionId);
    });
  }

  return (
    <div className="space-y-6">
      <section className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-[#1f1f1f] bg-[#0a0a0a]">
          <h2 className="text-white text-[14px] font-medium m-0">
            Versions
            <span className="ml-2 text-[#52525b] font-normal">
              ({versions.length})
            </span>
          </h2>
        </div>

        {versions.length === 0 ? (
          <div className="px-6 py-12 text-center text-[#52525b] text-sm">
            No versions yet. Create the first one below.
          </div>
        ) : (
          <div className="divide-y divide-[#1f1f1f]">
            {versions.map((v) => (
              <div key={v.id} className="px-4 md:px-6 py-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-white text-sm font-medium">
                      v{v.version}
                    </span>
                    {v.model && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1f1f1f] text-[#71717a]">
                        {v.model}
                      </span>
                    )}
                    {v.is_deployed && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        deployed
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() =>
                        setExpanded(expanded === v.id ? null : v.id)
                      }
                      className="text-[11px] text-[#71717a] hover:text-white transition-colors"
                    >
                      {expanded === v.id ? "Hide" : "View"}
                    </button>
                    {!v.is_deployed && (
                      <button
                        onClick={() => handleDeploy(v.id)}
                        disabled={isPending}
                        className="text-[11px] text-[#a1a1aa] hover:text-emerald-400 disabled:opacity-40 transition-colors"
                      >
                        Deploy
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(v.id)}
                      disabled={isPending || v.is_deployed}
                      className="text-[11px] text-[#52525b] hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {expanded === v.id && (
                  <pre className="mt-3 p-3 bg-[#0a0a0a] border border-[#1f1f1f] rounded text-[12px] text-[#a1a1aa] overflow-x-auto whitespace-pre-wrap break-words">
                    {v.content}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-[#1f1f1f] bg-[#0a0a0a]">
          <h2 className="text-white text-[14px] font-medium m-0">
            Add Version
          </h2>
        </div>
        <form
          action={async (formData) => {
            formData.set("prompt_id", promptId);
            startTransition(() => {
              createVersion(formData);
            });
          }}
          className="px-4 md:px-6 py-5 space-y-4"
        >
          <input type="hidden" name="prompt_id" value={promptId} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[#a1a1aa] text-[11px] uppercase tracking-[0.05em] mb-1.5">
                Version
              </label>
              <input
                name="version"
                required
                placeholder="e.g. 1.0"
                className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded px-3 py-2 text-white text-sm placeholder-[#3f3f46] focus:outline-none focus:border-[#3f3f46]"
              />
            </div>
            <div>
              <label className="block text-[#a1a1aa] text-[11px] uppercase tracking-[0.05em] mb-1.5">
                Model (optional)
              </label>
              <input
                name="model"
                placeholder="e.g. gpt-4o-mini"
                className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded px-3 py-2 text-white text-sm placeholder-[#3f3f46] focus:outline-none focus:border-[#3f3f46]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[#a1a1aa] text-[11px] uppercase tracking-[0.05em] mb-1.5">
              Prompt Content
            </label>
            <textarea
              name="content"
              required
              rows={8}
              placeholder="You are a helpful assistant..."
              className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded px-3 py-2 text-white text-sm placeholder-[#3f3f46] focus:outline-none focus:border-[#3f3f46] resize-y font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full sm:w-auto px-5 py-2 bg-white text-black text-sm font-medium rounded hover:bg-[#e5e5e5] disabled:opacity-40 transition-colors"
          >
            {isPending ? "Saving…" : "Save Version"}
          </button>
        </form>
      </section>
    </div>
  );
}
