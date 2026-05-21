"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { IBM_Plex_Mono, DM_Sans } from "next/font/google";
import { createClient } from "../../lib/supabase-browser";

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

interface StepFrame {
  tokens:    number;
  cost:      number;
  latencyMs: number;
  barColor:  "normal" | "warn" | "spike";
}

const FRAMES: StepFrame[] = [
  { tokens: 2_100,  cost: 0.004, latencyMs: 312,  barColor: "normal" },
  { tokens: 5_800,  cost: 0.011, latencyMs: 428,  barColor: "normal" },
  { tokens: 12_400, cost: 0.023, latencyMs: 601,  barColor: "normal" },
  { tokens: 28_900, cost: 0.054, latencyMs: 890,  barColor: "warn"   },
  { tokens: 84_200, cost: 0.158, latencyMs: 1340, barColor: "spike"  },
];

const BAR_HEIGHTS = [8, 18, 34, 55, 100] as const;

const BAR_BG: Record<StepFrame["barColor"], string> = {
  normal: "#10b981",
  warn:   "#f59e0b",
  spike:  "#f43f5e",
};

interface DiffLine {
  type:    "keep" | "add" | "remove";
  prefix:  "+" | "-" | " ";
  content: string;
}

const DIFF_LINES: DiffLine[] = [
  { type: "keep",   prefix: " ", content: '{"role":"system","content":"You are a concise assistant."}' },
  { type: "keep",   prefix: " ", content: '{"role":"user","content":"What is a binary search tree?"}' },
  { type: "keep",   prefix: " ", content: '{"role":"assistant","content":"A BST is a node-based binary..."}' },
  { type: "remove", prefix: "-", content: '{"role":"user","content":"Explain step 2 in more depth."}' },
  { type: "add",    prefix: "+", content: '{"role":"user","content":"Explain step 3 in more depth."}' },
  { type: "add",    prefix: "+", content: '{"role":"assistant","content":"Building on the previous..."}' },
  { type: "add",    prefix: "+", content: '{"role":"user","content":"Now compare to AVL trees."}' },
];

const FEATURES = [
  "Proxy intercept for every OpenAI / Groq call",
  "Context growth visualization across agent steps",
  "Diff viewer — see exactly what changed each step",
  "Cost anomaly detection before your bill spikes",
] as const;

// ── AnimatedVisualizer ────────────────────────────────────────────────────────

function AnimatedVisualizer() {
  const [activeStep, setActiveStep] = useState(0);
  const [showDiff,   setShowDiff]   = useState(false);
  const [diffLines,  setDiffLines]  = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAll = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);

  const runCycle = useCallback(function cycle() {
    clearAll();
    setActiveStep(0);
    setShowDiff(false);
    setDiffLines(0);

    FRAMES.forEach((_, i) => {
      schedule(() => setActiveStep(i + 1), (i + 1) * 600);
    });

    const diffStart = FRAMES.length * 600 + 500;
    schedule(() => setShowDiff(true), diffStart);

    DIFF_LINES.forEach((_, i) => {
      schedule(() => setDiffLines(i + 1), diffStart + 150 + i * 90);
    });

    const loopAt = diffStart + DIFF_LINES.length * 90 + 5_000;
    schedule(cycle, loopAt);
  }, [clearAll, schedule]);

  useEffect(() => {
    const init = setTimeout(runCycle, 600);
    return () => {
      clearAll();
      clearTimeout(init);
    };
  }, [runCycle, clearAll]);

  const currentFrame = activeStep > 0 ? FRAMES[activeStep - 1] : null;
  const showAnomaly  = activeStep >= 4;

  return (
    <>
      {/* Stats strip */}
      <div className="stats-strip">
        {[
          {
            label: "tokens used",
            value: currentFrame ? `${(currentFrame.tokens / 1000).toFixed(1)}k` : "0k",
            color: "#10b981",
          },
          {
            label: "estimated cost",
            value: currentFrame ? `$${currentFrame.cost.toFixed(3)}` : "$0.00",
            color: "#f59e0b",
          },
          {
            label: "avg latency",
            value: currentFrame ? `${currentFrame.latencyMs}ms` : "0ms",
            color: "#3b82f6",
          },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat-card">
            <div className="stat-val" style={{ color }}>{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Context growth chart */}
      <div className="viz-card" style={{ marginBottom: "16px" }}>
        <div className="viz-card-header">
          <span className="viz-card-title">Context growth per step</span>
          <span
            className="anomaly-badge"
            style={{ opacity: showAnomaly ? 1 : 0 }}
          >
            ⚠ anomaly
          </span>
        </div>
        <div className="chart-bars">
          {FRAMES.map((frame, i) => (
            <div key={i} className="bar-wrap">
              <div
                className="bar"
                style={{
                  backgroundColor: BAR_BG[frame.barColor],
                  height: activeStep > i ? `${BAR_HEIGHTS[i]}%` : "0%",
                }}
              />
              <span className="bar-label">{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Prompt diff */}
      <div
        className="viz-card diff-card"
        style={{
          opacity:   showDiff ? 1 : 0,
          transform: showDiff ? "translateY(0)" : "translateY(8px)",
        }}
      >
        <div className="viz-card-header">
          <span className="viz-card-title">Prompt diff · step 3 → 4</span>
          <span className="diff-meta">+847 tokens</span>
        </div>
        <div className="diff-body">
          {DIFF_LINES.slice(0, diffLines).map((line, i) => (
            <div
              key={i}
              className={`diff-line diff-${line.type}`}
            >
              <span className="diff-prefix">{line.prefix}</span>
              <span className="diff-content">{line.content}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── GitHubButton ──────────────────────────────────────────────────────────────

function GitHubButton() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        type="button"
        className={`github-btn${loading ? " github-btn--loading" : ""}`}
      >
        {loading ? (
          <span className="spinner" aria-hidden="true" />
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
        )}
        {loading ? "Redirecting…" : "Continue with GitHub"}
      </button>

      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <div className={`login-root ${ibmPlexMono.variable} ${dmSans.variable}`}>
      <style>{`
        .login-root {
          display: flex;
          width: 100%;
          min-height: 100vh;
          background: #080808;
          color: #e2e8f0;
          font-family: var(--font-sans);
        }

        /* ── LEFT PANEL ── */
        .left-panel {
          width: 55%;
          background: #0a0a0a;
          border-right: 1px solid #1a1a1a;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 40px 48px;
          position: relative;
          overflow: hidden;
        }

        .left-panel::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(16,185,129,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(16,185,129,0.03) 1px, transparent 1px);
          background-size: 32px 32px;
          pointer-events: none;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          position: relative;
          z-index: 2;
        }

        .brand-icon {
          width: 32px;
          height: 32px;
          background: #10b981;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-mono);
          font-weight: 600;
          font-size: 13px;
          color: #000;
          flex-shrink: 0;
        }

        .brand-name {
          font-family: var(--font-mono);
          font-size: 16px;
          font-weight: 600;
          color: #f1f5f9;
          letter-spacing: -0.5px;
        }

        .brand-name span { color: #10b981; }

        .visualizer {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          position: relative;
          z-index: 2;
          padding: 24px 0;
        }

        .viz-session-label {
          font-family: var(--font-mono);
          font-size: 10px;
          color: #4b5563;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-bottom: 14px;
        }

        .stats-strip {
          display: flex;
          gap: 12px;
          margin-bottom: 16px;
        }

        .stat-card {
          flex: 1;
          background: #0f0f0f;
          border: 1px solid #1f1f1f;
          border-radius: 8px;
          padding: 12px 14px;
        }

        .stat-val {
          font-family: var(--font-mono);
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 2px;
          transition: color 0.3s ease;
        }

        .stat-label {
          font-size: 10px;
          color: #4b5563;
          font-weight: 500;
        }

        .viz-card {
          background: #0f0f0f;
          border: 1px solid #1f1f1f;
          border-radius: 10px;
          overflow: hidden;
          transition: opacity 0.4s ease, transform 0.4s ease;
        }

        .viz-card-header {
          padding: 12px 16px;
          border-bottom: 1px solid #1a1a1a;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .viz-card-title {
          font-size: 12px;
          font-weight: 500;
          color: #9ca3af;
        }

        .anomaly-badge {
          font-family: var(--font-mono);
          font-size: 10px;
          color: #f59e0b;
          background: rgba(245,158,11,0.1);
          border: 1px solid rgba(245,158,11,0.2);
          padding: 2px 8px;
          border-radius: 4px;
          transition: opacity 0.4s ease;
        }

        .chart-bars {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          height: 72px;
          padding: 16px 16px 12px;
        }

        .bar-wrap {
          flex: 1;
          height: 100%;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          align-items: center;
          gap: 4px;
        }

        .bar {
          width: 100%;
          border-radius: 3px 3px 0 0;
          transition: height 0.7s cubic-bezier(0.4, 0, 0.2, 1);
          min-height: 0;
        }

        .bar-label {
          font-family: var(--font-mono);
          font-size: 9px;
          color: #4b5563;
        }

        .diff-card {
          margin-top: 0;
        }

        .diff-meta {
          font-family: var(--font-mono);
          font-size: 10px;
          color: #374151;
        }

        .diff-body {
          padding: 8px 0;
          font-family: var(--font-mono);
          font-size: 11px;
        }

        .diff-line {
          padding: 3px 16px;
          display: flex;
          gap: 10px;
          animation: loginFadeIn 0.3s ease forwards;
        }

        .diff-keep   { color: #4b5563; }
        .diff-add    { background: rgba(16,185,129,0.07); color: #10b981; }
        .diff-remove { background: rgba(244,63,94,0.07);  color: #f43f5e; text-decoration: line-through; }

        .diff-prefix  { width: 12px; flex-shrink: 0; }
        .diff-content { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .tagline {
          font-family: var(--font-mono);
          font-size: 12px;
          color: #374151;
          position: relative;
          z-index: 2;
        }

        .tagline span { color: #10b981; }

        /* ── RIGHT PANEL ── */
        .right-panel {
          width: 45%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 52px;
          background: #080808;
        }

        .form-wrap {
          width: 100%;
          max-width: 360px;
        }

        .version-badge {
          font-family: var(--font-mono);
          font-size: 10px;
          color: #374151;
          border: 1px solid #1a1a1a;
          padding: 3px 8px;
          border-radius: 4px;
          display: inline-block;
          margin-bottom: 32px;
        }

        .form-heading {
          font-size: 26px;
          font-weight: 600;
          color: #f1f5f9;
          letter-spacing: -0.5px;
          margin-bottom: 6px;
        }

        .form-sub {
          font-size: 13px;
          color: #4b5563;
          margin-bottom: 36px;
          line-height: 1.5;
        }

        .github-btn {
          width: 100%;
          background: #f1f5f9;
          color: #0a0a0a;
          border: none;
          border-radius: 8px;
          padding: 13px 20px;
          font-family: var(--font-sans);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: background 0.12s ease;
          margin-bottom: 28px;
        }

        .github-btn:hover:not(:disabled) { background: #fff; }
        .github-btn--loading { background: #c8d0da; cursor: not-allowed; }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid #6b7280;
          border-top-color: #0a0a0a;
          border-radius: 50%;
          display: inline-block;
          animation: loginSpin 0.6s linear infinite;
        }

        .auth-error {
          margin-bottom: 28px;
          padding: 10px 14px;
          background: rgba(244,63,94,0.08);
          border: 1px solid rgba(244,63,94,0.2);
          border-radius: 6px;
          font-size: 12px;
          color: #f43f5e;
          font-family: var(--font-mono);
        }

        .divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 28px;
        }

        .divider-line {
          flex: 1;
          height: 1px;
          background: #1a1a1a;
        }

        .divider-text {
          font-family: var(--font-mono);
          font-size: 11px;
          color: #374151;
          letter-spacing: 1px;
        }

        .feature-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
          margin-bottom: 36px;
        }

        .feature {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .feature-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
          flex-shrink: 0;
        }

        .feature-text {
          font-size: 13px;
          color: #6b7280;
        }

        .privacy-note {
          font-family: var(--font-mono);
          font-size: 11px;
          color: #374151;
          text-align: center;
          line-height: 1.6;
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid #111;
        }

        @keyframes loginFadeIn {
          from { opacity: 0; transform: translateX(-4px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        @keyframes loginSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* ── LEFT PANEL ── */}
      <div className="left-panel">
        <div className="brand">
          <div className="brand-icon">0x</div>
          <span className="brand-name"><span>0x</span>trace</span>
        </div>

        <div className="visualizer">
          <div className="viz-session-label">Live session · demo-sess-1</div>
          <AnimatedVisualizer />
        </div>

        <div className="tagline">
          <span>intercepting</span> every LLM call.{" "}
          <span>no black boxes.</span>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="right-panel">
        <div className="form-wrap">
          <div className="version-badge">v0.1.0 · open source</div>

          <h1 className="form-heading">Sign in to 0xtrace</h1>
          <p className="form-sub">
            AI observability for developers who need to see inside their agents.
          </p>

          <GitHubButton />

          <div className="divider">
            <div className="divider-line" />
            <span className="divider-text">what you get</span>
            <div className="divider-line" />
          </div>

          <div className="feature-list">
            {FEATURES.map((text) => (
              <div key={text} className="feature">
                <div className="feature-dot" />
                <span className="feature-text">{text}</span>
              </div>
            ))}
          </div>

          <div className="privacy-note">
            Your traces are private and isolated to your account.
            <br />
            We never train on your data.
          </div>
        </div>
      </div>
    </div>
  );
}