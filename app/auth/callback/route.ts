// app/auth/callback/route.ts
import { createClient } from "../../../lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  // ── Use NEXT_PUBLIC_APP_URL as the canonical origin ────────────────────
  // Avoids internal Vercel URL mismatches that break cookie domain scoping.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!code) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  const supabase = await createClient();

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error("[auth/callback] exchange failed:", exchangeError.message);
    return NextResponse.redirect(`${appUrl}/login?error=auth_failed`);
  }

  // ── Check if this user already has a project ───────────────────────────
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id")
    .limit(1);

  if (projectsError) {
    console.warn("[auth/callback] project check failed:", projectsError.message);
    return NextResponse.redirect(`${appUrl}/dashboard`);
  }

  const isNewUser = !projects || projects.length === 0;

  return NextResponse.redirect(
    `${appUrl}${isNewUser ? "/onboarding" : "/dashboard"}`
  );
}