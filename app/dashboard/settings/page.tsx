import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Extract GitHub OAuth metadata safely
  const avatarUrl = user.user_metadata?.avatar_url || "";
  const fullName = user.user_metadata?.full_name || user.email || "Developer";
  const preferredName = user.user_metadata?.preferred_username || "github-user";

  return (
    <div>
      <div className="mb-8">
        <h1 className="m-0 text-white text-2xl font-medium leading-tight tracking-[-0.02em]">
          Settings
        </h1>
        <p className="mt-1.5 text-[#71717a] text-sm m-0">
          Manage your account, SDK configuration, and data retention.
        </p>
      </div>

      <div className="grid gap-8" style={{ gridTemplateColumns: "minmax(0, 1fr) 340px" }}>
        
        {/* ── LEFT COLUMN: Configs ── */}
        <div className="flex flex-col gap-6">
          
          {/* SDK Integration */}
          <section className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1f1f1f] bg-[#0a0a0a]">
              <h2 className="m-0 text-white text-sm font-medium">SDK Integration</h2>
            </div>
            <div className="p-5">
              <p className="text-[#71717a] text-[13px] mb-4">
                Initialize the `Tracer` in your application using these credentials. 
                Keep your API key secure and do not commit it to version control.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-[#a1a1aa] text-[11px] uppercase tracking-wider mb-1.5">
                    Ingest URL
                  </label>
                  <div className="flex">
                    <input 
                      readOnly 
                      value="https://api.0xtrace.dev/v1/ingest" 
                      className="w-full bg-[#080808] border border-[#262626] rounded-l-md px-3 h-9 text-[13px] text-[#e4e4e7] font-mono outline-none focus:border-[#3b82f6]"
                    />
                    <button className="h-9 px-4 bg-[#1a1a1a] border border-l-0 border-[#262626] rounded-r-md text-[#a1a1aa] text-[12px] hover:bg-[#262626] hover:text-white transition-colors">
                      Copy
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[#a1a1aa] text-[11px] uppercase tracking-wider mb-1.5">
                    Ingest API Key
                  </label>
                  <div className="flex">
                    <input 
                      type="password"
                      readOnly 
                      value="trc_live_9a8b7c6d5e4f3g2h1i0j" 
                      className="w-full bg-[#080808] border border-[#262626] rounded-l-md px-3 h-9 text-[13px] text-[#e4e4e7] font-mono outline-none focus:border-[#3b82f6]"
                    />
                    <button className="h-9 px-4 bg-[#1a1a1a] border border-l-0 border-[#262626] rounded-r-md text-[#a1a1aa] text-[12px] hover:bg-[#262626] hover:text-white transition-colors">
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Data Retention */}
          <section className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-[#1f1f1f] bg-[#0a0a0a]">
              <h2 className="m-0 text-white text-sm font-medium">Data Management</h2>
            </div>
            <div className="p-5 flex items-center justify-between">
              <div>
                <div className="text-[#e4e4e7] text-[13px] font-medium">Auto-Prune Context Arrays</div>
                <div className="text-[#71717a] text-[12px] mt-1">
                  Massive JSONB messages arrays older than 7 days are automatically dropped to save Postgres space. Metadata and token counts are retained forever.
                </div>
              </div>
              <span className="h-6 px-2.5 bg-[#052e16] border border-[#064e3b] text-[#10b981] text-[11px] rounded inline-flex items-center">
                Active
              </span>
            </div>
            <div className="p-5 border-t border-[#1f1f1f] flex items-center justify-between bg-[#161111]">
              <div>
                <div className="text-[#f43f5e] text-[13px] font-medium">Danger Zone</div>
                <div className="text-[#a1a1aa] text-[12px] mt-1">
                  Permanently delete all ingested traces and anomalies from this project.
                </div>
              </div>
              <button className="h-8 px-4 bg-[#1f0a0a] border border-[#4a1111] rounded text-[#f43f5e] text-[12px] hover:bg-[#2a0e0e] transition-colors">
                Flush Database
              </button>
            </div>
          </section>
        </div>

        {/* ── RIGHT COLUMN: Profile ── */}
        <aside className="flex flex-col gap-6">
          <div className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden p-6 flex flex-col items-center text-center">
            {avatarUrl ? (
              <img 
                src={avatarUrl} 
                alt="GitHub Avatar" 
                className="w-20 h-20 rounded-full border-2 border-[#262626] mb-4"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-[#1a1a1a] border-2 border-[#262626] mb-4 flex items-center justify-center text-[#71717a] text-xl font-mono">
                {preferredName.substring(0, 2).toUpperCase()}
              </div>
            )}
            
            <h3 className="text-white font-medium m-0">{fullName}</h3>
            <p className="text-[#71717a] text-[13px] font-mono mt-1">@{preferredName}</p>
            
            <div className="w-full h-px bg-[#1f1f1f] my-5" />
            
            <div className="w-full flex justify-between items-center text-[13px] mb-2">
              <span className="text-[#71717a]">Provider</span>
              <span className="text-[#e4e4e7] flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
                GitHub
              </span>
            </div>
            <div className="w-full flex justify-between items-center text-[13px]">
              <span className="text-[#71717a]">Role</span>
              <span className="text-[#10b981] font-mono">Admin</span>
            </div>
            
            <form action="/auth/signout" method="post" className="w-full mt-6">
              <button className="w-full h-9 bg-transparent border border-[#333] text-[#a1a1aa] rounded-md text-[13px] hover:text-white hover:border-[#555] transition-colors">
                Sign Out
              </button>
            </form>
          </div>
        </aside>

      </div>
    </div>
  );
}