// app/api/prompts/resolve/route.ts

import { resolveProjectId } from "@/lib/api-key";
import { supabaseAdmin }    from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rawKey = req.headers.get("x-api-key");
  if (!rawKey) {
    return NextResponse.json({ error: "Missing x-api-key header" }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json({ error: "Missing ?name query param" }, { status: 400 });
  }

  const projectId = await resolveProjectId(rawKey);
  if (!projectId) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("prompts")
    .select("id, name, prompt_versions!inner(content, model, version)")
    .eq("project_id", projectId)
    .eq("name", name)
    .eq("prompt_versions.is_deployed", true)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Prompt not found or no deployed version" },
      { status: 404 }
    );
  }

  const versions = data.prompt_versions as { content: string; model: string | null; version: string }[];

  return NextResponse.json({
    name:    data.name,
    version: versions[0].version,
    content: versions[0].content,
    model:   versions[0].model,
  });
}