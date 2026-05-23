// app/auth/callback/route.ts
//
// Handles the OAuth redirect from Supabase after GitHub login.
//
// Routing logic:
//   - New user (no projects yet) → /onboarding  (create first project)
//   - Returning user             → /dashboard   (straight to their data)

import { createClient } from "../../../lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();

  // ── Exchange the OAuth code for a session ──────────────────────────────
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error("[auth/callback] exchange failed:", exchangeError.message);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // ── Check if this user already has a project ───────────────────────────
  // If not, it's their first login → send to onboarding.
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id")
    .limit(1);

  if (projectsError) {
    // Non-fatal: default to dashboard, they can create a project from settings.
    console.warn("[auth/callback] project check failed:", projectsError.message);
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  const isNewUser = !projects || projects.length === 0;

  return NextResponse.redirect(
    `${origin}${isNewUser ? "/onboarding" : "/dashboard"}`
  );
}