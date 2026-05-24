// lib/db.ts

import { supabaseAdmin } from "@/lib/supabase";

const CHUNK_SIZE = 50;

// Supabase (PostgREST) serialises every row field as a query parameter.
// A single .insert() of 500 rows with 15 columns = 7,500 parameters —
// well within the 65,535 PostgreSQL limit today, but a single infinite
// agent loop can push thousands of traces in one drain cycle.
// Chunking at 50 rows keeps parameter counts safely bounded regardless
// of payload size or future schema additions.

export async function chunkedInsert<T extends object>(
  table: string,
  rows:  T[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);

    const { error } = await supabaseAdmin.from(table).insert(chunk);

    if (error) {
      throw new Error(
        `[chunkedInsert] table="${table}" chunk=${Math.floor(i / CHUNK_SIZE)} — ${error.message}`
      );
    }
  }
}