// app/dashboard/settings/actions.ts
//
// Server actions for the settings page.
//
//   generateNewKey()  — creates a new API key for the active project
//   revokeKey()       — sets is_active = false on a specific key
//   deleteProject()   — deletes the project (cascades to keys + traces via FK)
//                       then routes the user to their next project or /onboarding

"use server";

import { cookies }                from "next/headers";
import { redirect }               from "next/navigation";
import { createClient }           from "@/lib/supabase-server";
import { supabaseAdmin }          from "@/lib/supabase";
import { getActiveProjectId, getUserProjects, ACTIVE_PROJECT_COOKIE } from "@/lib/project-context";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GenerateKeyResult {
  ok:        true;
  plainKey:  string;
  keyPrefix: string;
  keyId:     string;
}

export interface ActionError {
  ok:    false;
  error: string;
}

// ── Key generation helper (shared with onboarding/actions.ts) ─────────────────

async function generateApiKey(): Promise<{
  plainKey:  string;
  keyHash:   string;
  keyPrefix: string;
}> {
  const randomBytes = crypto.getRandomValues(new Uint8Array(24));
  const randomHex   = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const plainKey = `0xt_live_${randomHex}`;

  const encoded  = new TextEncoder().encode(plainKey);
  const hashBuf  = await crypto.subtle.digest("SHA-256", encoded);
  const keyHash  = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const keyPrefix = plainKey.slice(0, 16) + "…";

  return { plainKey, keyHash, keyPrefix };
}

// ── generateNewKey ────────────────────────────────────────────────────────────

/**
 * Generates a new API key for the currently active project.
 * Returns the plaintext key once — it is never stored or logged.
 */
export async function generateNewKey(
  keyName: string
): Promise<GenerateKeyResult | ActionError> {
  const supabase  = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/onboarding");

  const trimmedName = keyName.trim() || "New key";
  if (trimmedName.length > 64) {
    return { ok: false, error: "Key name must be 64 characters or fewer." };
  }

  const { plainKey, keyHash, keyPrefix } = await generateApiKey();

  const { data: newKey, error: insertError } = await supabaseAdmin
    .from("api_keys")
    .insert({
      project_id: projectId,
      key_hash:   keyHash,
      key_prefix: keyPrefix,
      name:       trimmedName,
      is_active:  true,
    })
    .select("id")
    .single();

  if (insertError || !newKey) {
    console.error("[settings] generateNewKey failed:", insertError?.message);
    return { ok: false, error: "Failed to generate key. Please try again." };
  }

  return { ok: true, plainKey, keyPrefix, keyId: newKey.id as string };
}

// ── revokeKey ─────────────────────────────────────────────────────────────────

/**
 * Marks a key as inactive. The ingest endpoint rejects inactive keys.
 * Validates ownership by joining through projects (prevents cross-user revoke).
 */
export async function revokeKey(keyId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/onboarding");

  // Validate this key belongs to the active project before revoking
  const { data: existing } = await supabaseAdmin
    .from("api_keys")
    .select("id")
    .eq("id", keyId)
    .eq("project_id", projectId)
    .single();

  if (!existing) {
    return { ok: false, error: "Key not found or access denied." };
  }

  const { error } = await supabaseAdmin
    .from("api_keys")
    .update({ is_active: false })
    .eq("id", keyId);

  if (error) {
    console.error("[settings] revokeKey failed:", error.message);
    return { ok: false, error: "Failed to revoke key. Please try again." };
  }

  return { ok: true };
}

// ── deleteProject ─────────────────────────────────────────────────────────────

/**
 * Permanently deletes the active project and all its data.
 * FK cascades handle: api_keys, llm_calls, prompt_snapshots.
 *
 * Post-delete routing:
 *   - User has other projects → switch cookie to the next one, /dashboard
 *   - No projects left        → clear cookie, /onboarding
 */
export async function deleteProject(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");

  const projectId = await getActiveProjectId();
  if (!projectId) redirect("/onboarding");

  // Delete — RLS on projects ensures only the owner can delete their own row
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId);

  if (error) {
    console.error("[settings] deleteProject failed:", error.message);
    return { ok: false, error: "Failed to delete project. Please try again." };
  }

  // ── Update active project cookie ──────────────────────────────────────────
  const cookieStore  = await cookies();
  const remaining    = await getUserProjects(); // re-fetch after delete

  if (remaining.length > 0) {
    // Switch to the first remaining project
    cookieStore.set(ACTIVE_PROJECT_COOKIE, remaining[0].id, {
      httpOnly: true,
      sameSite: "lax",
      secure:   process.env.NODE_ENV === "production",
      maxAge:   60 * 60 * 24 * 30,
      path:     "/",
    });
    redirect("/dashboard");
  } else {
    // No projects left — send to onboarding
    cookieStore.delete(ACTIVE_PROJECT_COOKIE);
    redirect("/onboarding");
  }
}