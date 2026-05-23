// app/dashboard/settings/KeyManager.tsx
//
// "use client" — manages the interactive parts of API key management:
//   1. Generate new key form (shows key once after creation)
//   2. Revoke key buttons with confirmation

"use client";

import { useState, useTransition } from "react";
import { generateNewKey, revokeKey } from "./actions";
import type { GenerateKeyResult } from "./actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

interface KeyManagerProps {
  initialKeys: ApiKeyRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── NewKeyReveal ──────────────────────────────────────────────────────────────
// Shown inline after a key is generated. Dismisses itself.

function NewKeyReveal({
  result,
  onDismiss,
}: {
  result: GenerateKeyResult;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(result.plainKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="mt-4 p-4 bg-[#052e16] border border-[#064e3b] rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span className="text-[#10b981] text-[13px] font-medium">
            Key generated — copy it now
          </span>
        </div>
        <span className="text-[#f59e0b] text-[11px] font-mono">
          ⚠ Shown once
        </span>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 h-10 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 flex items-center font-mono text-[12px] text-[#e4e4e7] overflow-x-auto whitespace-nowrap">
          {result.plainKey}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className={[
            "h-10 px-4 rounded-lg border text-[12px] font-medium flex-none",
            "inline-flex items-center gap-1.5 transition-all duration-150",
            copied
              ? "bg-[#052e16] border-[#064e3b] text-[#10b981]"
              : "bg-[#1a1a1a] border-[#333] text-[#a1a1aa] hover:border-[#555] hover:text-white",
          ].join(" ")}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className="mt-3 text-[#52525b] text-[12px] hover:text-[#a1a1aa] transition-colors"
      >
        I&apos;ve saved it — dismiss
      </button>
    </div>
  );
}

// ── KeyManager ────────────────────────────────────────────────────────────────

export function KeyManager({ initialKeys }: KeyManagerProps) {
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys);
  const [newKeyResult, setNewKeyResult] = useState<GenerateKeyResult | null>(
    null,
  );
  const [showNewKeyForm, setShowNewKeyForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ── Generate new key ───────────────────────────────────────────────────────
  function handleGenerateSubmit() {
    setGenerateError(null);
    startTransition(async () => {
      const result = await generateNewKey(newKeyName);
      if (!result.ok) {
        setGenerateError(result.error);
        return;
      }
      setNewKeyResult(result);
      setShowNewKeyForm(false);
      setNewKeyName("");
      // Optimistically add the new key to the list (inactive until dismissed)
      setKeys((prev) => [
        {
          id: result.keyId,
          name: newKeyName.trim() || "New key",
          key_prefix: result.keyPrefix,
          is_active: true,
          last_used_at: null,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    });
  }

  // ── Revoke key ─────────────────────────────────────────────────────────────
  function handleRevoke(keyId: string) {
    setRevokingId(keyId);
    startTransition(async () => {
      const result = await revokeKey(keyId);
      setRevokingId(null);
      setRevokeConfirmId(null);
      if (result.ok) {
        // Optimistically mark as inactive
        setKeys((prev) =>
          prev.map((k) => (k.id === keyId ? { ...k, is_active: false } : k)),
        );
      }
    });
  }

  return (
    <div>
      {/* ── Key list ── */}
      <div className="divide-y divide-[#1f1f1f]">
        {keys.length === 0 && (
          <div className="py-8 text-center text-[#52525b] text-sm">
            No API keys yet.
          </div>
        )}

        {keys.map((key) => (
          <div
            key={key.id}
            className="py-4 flex items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[#e4e4e7] text-[13px] font-medium">
                  {key.name}
                </span>
                {key.is_active ? (
                  <span className="h-5 inline-flex items-center px-2 rounded text-[11px] border bg-[#052e16] text-[#10b981] border-[#064e3b]">
                    active
                  </span>
                ) : (
                  <span className="h-5 inline-flex items-center px-2 rounded text-[11px] border bg-[#1a1a1a] text-[#52525b] border-[#262626]">
                    revoked
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-[12px] text-[#52525b]">
                <span className="font-mono">{key.key_prefix}</span>
                <span>Created {formatDate(key.created_at)}</span>
                <span>Last used: {relativeTime(key.last_used_at)}</span>
              </div>
            </div>

            {/* Revoke button — only for active keys */}
            {key.is_active && (
              <div className="flex-none">
                {revokeConfirmId === key.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[#f43f5e] text-[12px]">Revoke?</span>
                    <button
                      type="button"
                      onClick={() => handleRevoke(key.id)}
                      disabled={revokingId === key.id}
                      className="h-7 px-3 bg-[#1f0a0a] border border-[#4a1111] rounded text-[#f43f5e] text-[11px] hover:bg-[#2a0e0e] transition-colors disabled:opacity-50"
                    >
                      {revokingId === key.id ? "Revoking…" : "Yes, revoke"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRevokeConfirmId(null)}
                      className="h-7 px-3 bg-[#1a1a1a] border border-[#262626] rounded text-[#a1a1aa] text-[11px] hover:border-[#555] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRevokeConfirmId(key.id)}
                    className="h-7 px-3 bg-transparent border border-[#262626] rounded text-[#52525b] text-[11px] hover:border-[#f43f5e] hover:text-[#f43f5e] transition-colors"
                  >
                    Revoke
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── New key reveal (shown after generation) ── */}
      {newKeyResult && (
        <NewKeyReveal
          result={newKeyResult}
          onDismiss={() => setNewKeyResult(null)}
        />
      )}

      {/* ── Generate new key form ── */}
      {showNewKeyForm ? (
        <div className="mt-4 flex items-center gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. production)"
            maxLength={64}
            className="flex-1 h-9 bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 text-[13px] text-white font-mono placeholder:text-[#3f3f46] outline-none focus:border-[#3b82f6] transition-colors"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleGenerateSubmit();
            }}
            autoFocus
          />
          <button
            type="button"
            onClick={handleGenerateSubmit}
            disabled={isPending}
            className="h-9 px-4 bg-[#3b82f6] rounded-lg text-white text-[13px] font-medium hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
          >
            {isPending ? "Generating…" : "Generate"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowNewKeyForm(false);
              setGenerateError(null);
            }}
            className="h-9 px-3 bg-[#1a1a1a] border border-[#262626] rounded-lg text-[#a1a1aa] text-[13px] hover:border-[#555] transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        !newKeyResult && (
          <button
            type="button"
            onClick={() => setShowNewKeyForm(true)}
            className="mt-4 h-9 px-4 bg-transparent border border-[#333] rounded-lg text-[#a1a1aa] text-[13px] inline-flex items-center gap-2 hover:border-[#555] hover:text-white transition-colors"
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
              <path d="M12 5v14M5 12h14" />
            </svg>
            Generate new key
          </button>
        )
      )}

      {generateError && (
        <p className="mt-2 text-[#f43f5e] text-[12px]">{generateError}</p>
      )}
    </div>
  );
}
