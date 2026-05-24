// lib/api-key.ts

import { supabaseAdmin } from "@/lib/supabase";

async function hashApiKey(plainKey: string): Promise<string> {
  const encoded = new TextEncoder().encode(plainKey);
  const hashBuf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function resolveProjectId(plainKey: string): Promise<string | null> {
  const keyHash = await hashApiKey(plainKey);

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select("project_id, is_active")
    .eq("key_hash", keyHash)
    .single();

  if (error || !data || data.is_active === false) return null;

  supabaseAdmin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("key_hash", keyHash)
    .then(() => {});

  return data.project_id as string;
}