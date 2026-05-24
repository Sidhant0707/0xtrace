// components/dashboard/ProjectSwitcher.tsx
//
// "use client" — dropdown to switch between the user's projects.
// Calls a server action to update the active project cookie,
// then triggers a full page reload so all server queries re-run
// with the new project context.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/project-context";

// ── Server action (defined inline — kept next to its only consumer) ──────────
// We import it from a dedicated actions file to keep the component file clean.
import { switchActiveProject } from "@/app/dashboard/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProjectSwitcherProps {
  projects: Project[];
  activeProject: Project | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProjectSwitcher({
  projects,
  activeProject,
}: ProjectSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSelect(project: Project) {
    if (project.id === activeProject?.id) {
      setOpen(false);
      return;
    }
    setOpen(false);
    startTransition(async () => {
      await switchActiveProject(project.id);
      // Hard refresh so every server component re-runs with new project context
      router.refresh();
    });
  }

  if (projects.length === 0) return null;

  return (
    <div className="relative px-3 mb-1">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className={[
          "w-full h-9 px-3 rounded-md border",
          "flex items-center gap-2 text-left",
          "transition-colors duration-[120ms]",
          open
            ? "bg-[#1a1a1a] border-[#333] text-white"
            : "bg-transparent border-[#1f1f1f] text-[#a1a1aa] hover:bg-[#1a1a1a] hover:border-[#333] hover:text-white",
        ].join(" ")}
      >
        {/* Colour dot */}
        <span
          className="flex-none w-2 h-2 rounded-full bg-[#3b82f6]"
          aria-hidden="true"
        />

        {/* Project name */}
        <span className="flex-1 min-w-0 truncate text-[13px] font-medium">
          {isPending ? "Switching…" : (activeProject?.name ?? "Select project")}
        </span>

        {/* Chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`flex-none text-[#52525b] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div
            className={[
              "absolute left-3 right-3 top-[calc(100%+4px)] z-20",
              "bg-[#111] border border-[#262626] rounded-lg",
              "shadow-[0_8px_32px_rgba(0,0,0,0.5)]",
              "overflow-hidden",
            ].join(" ")}
          >
            {/* Project list */}
            <div className="py-1">
              {projects.map((project) => {
                const isActive = project.id === activeProject?.id;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => handleSelect(project)}
                    className={[
                      "w-full h-9 px-3 text-left",
                      "flex items-center gap-2.5 text-[13px]",
                      "transition-colors duration-[80ms]",
                      isActive
                        ? "text-white bg-[#1a1a1a]"
                        : "text-[#a1a1aa] hover:bg-[#161616] hover:text-white",
                    ].join(" ")}
                  >
                    {/* Active checkmark */}
                    <span className="flex-none w-4 flex items-center justify-center">
                      {isActive && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 truncate">{project.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Footer: new project link */}
            <div className="border-t border-[#1f1f1f] py-1">
              <a
                href="/onboarding?new=true"
                className={[
                  "w-full h-9 px-3",
                  "flex items-center gap-2.5 text-[13px] text-[#52525b]",
                  "hover:text-[#a1a1aa] hover:bg-[#161616]",
                  "transition-colors duration-[80ms] no-underline",
                ].join(" ")}
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
                  className="flex-none ml-[2px]"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New project
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
