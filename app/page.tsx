// app/page.tsx
//
// Root route — immediately redirects to /dashboard.
// Using Next.js redirect() (server-side) so there is zero
// client-side flash or layout shift. The browser never renders
// this page — it receives a 307 and goes straight to /dashboard.

import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/dashboard");
}