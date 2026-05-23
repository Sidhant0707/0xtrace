// app/onboarding/actions.ts
//
// Server actions for the onboarding flow.
//
// Key generation design:
//   - Format:  0xt_live_[48 hex chars]   (e.g. 0xt_live_a1b2c3d4...)
//   - Storage: SHA-256 hash stored in key_hash column — plaintext NEVER persisted
//   - Prefix:  first 12 chars of the key stored for UI display (0xt_live_a1b2...)
//   - The plaintext key is returned ONCE to the caller and never logged

"use server";

import { createClient }   from "@/lib/supabase-server";
import { redirect }       from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateProjectResult {
  ok:        true;
  plainKey:  string;   // shown once — never stored
  projectId: string;
  keyPrefix: string;   // safe to store / display forever
}

export interface CreateProjectError {
  ok:    false;
  error: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Generates a cryptographically secure API key and its SHA-256 hash.
 * Uses the Web Crypto API — available in Node 18+, Edge runtime, and browsers.
 */
async function generateApiKey(): Promise<{
  plainKey: string;
  keyHash:  string;
  keyPrefix: string;
}> {
  // 24 random bytes → 48 hex chars → readable key
  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
  const randomHex   = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const plainKey  = `0xt_live_${randomHex}`;

  // SHA-256 hash for storage
  const encoded   = new TextEncoder().encode(plainKey);
  const hashBuf   = await crypto.subtle.digest("SHA-256", encoded);
  const keyHash   = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // First 16 chars of the full key — safe to show in settings UI later
  const keyPrefix = plainKey.slice(0, 16) + "…";

  return { plainKey, keyHash, keyPrefix };
}

// ── Server action ─────────────────────────────────────────────────────────────

/**
 * Creates the user's first project and generates an API key for it.
 * Called from the onboarding form's server action.
 *
 * On success: returns the plaintext key (shown once) + project/key metadata.
 * On failure: returns an error message safe to display in the UI.
 */
export async function createProjectWithKey(
  formData: FormData
): Promise<CreateProjectResult | CreateProjectError> {
  const projectName = (formData.get("projectName") as string | null)?.trim();

  if (!projectName || projectName.length < 2) {
    return { ok: false, error: "Project name must be at least 2 characters." };
  }
  if (projectName.length > 64) {
    return { ok: false, error: "Project name must be 64 characters or fewer." };
  }

  const supabase = await createClient();

  // ── Verify the session ─────────────────────────────────────────────────────
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  // ── Create the project row ─────────────────────────────────────────────────
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({ name: projectName, user_id: user.id })
    .select("id")
    .single();

  if (projectError || !project) {
    console.error("[onboarding] project insert failed:", projectError?.message);
    return { ok: false, error: "Failed to create project. Please try again." };
  }

  // ── Generate and store the API key ─────────────────────────────────────────
  const { plainKey, keyHash, keyPrefix } = await generateApiKey();

  const { error: keyError } = await supabase
    .from("api_keys")
    .insert({
      project_id: project.id,
      key_hash:   keyHash,
      key_prefix: keyPrefix,
      name:       "Default key",
    });

  if (keyError) {
    console.error("[onboarding] api_key insert failed:", keyError.message);
    // Roll back the project row so the user doesn't end up with a keyless project
    await supabase.from("projects").delete().eq("id", project.id);
    return { ok: false, error: "Failed to generate API key. Please try again." };
  }

  return {
    ok:        true,
    plainKey,
    projectId: project.id,
    keyPrefix,
  };
}