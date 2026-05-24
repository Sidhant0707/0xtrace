// lib/links.ts
// ============================================================================
// Centralized Link Constants
// ============================================================================
// Single source of truth for all external and internal links across the app.
// Update these when URLs change instead of hunting through components.

export const EXTERNAL_LINKS = {
  // GitHub
  GITHUB_REPO: "https://github.com/Sidhant0707/0xtrace",
  GITHUB_ISSUES: "https://github.com/Sidhant0707/0xtrace/issues",
  GITHUB_DISCUSSIONS: "https://github.com/Sidhant0707/0xtrace/discussions",
  GITHUB_CHANGELOG: "https://github.com/Sidhant0707/0xtrace/releases",
  
  // NPM
  NPM_PACKAGE: "https://www.npmjs.com/package/0xtrace",
  
  // Social (update these with your actual accounts)
  TWITTER: "https://twitter.com/yourusername", // TODO: Update with your Twitter
  DISCORD: "https://discord.gg/yourinvite", // TODO: Create Discord server
  
  // Docs & Resources
  MIT_LICENSE: "https://github.com/Sidhant0707/0xtrace/blob/main/LICENSE",
  README: "https://github.com/Sidhant0707/0xtrace#readme",
} as const;

export const INTERNAL_LINKS = {
  // Landing
  HOME: "/",
  
  // Auth
  LOGIN: "/login",
  SIGNUP: "/signup",
  
  // Dashboard
  DASHBOARD: "/dashboard",
  SESSIONS: "/dashboard",
  EXPLORER: "/dashboard/explorer",
  COST: "/dashboard/cost",
  ANOMALIES: "/dashboard/anomalies",
  SETTINGS: "/dashboard/settings",
  
  // Public pages
  DOCS: "/docs",
  
  // Onboarding
  ONBOARDING: "/onboarding",
} as const;

// Helper to create external link props
export function externalLinkProps(url: string) {
  return {
    href: url,
    target: "_blank" as const,
    rel: "noopener noreferrer" as const,
  };
}