// app/dashboard/[sessionId]/diff/page.tsx
//
// Prompt Diff Viewer — the "killer feature" of 0xtrace.
//
// Data architecture:
//   - Pure Server Component. Zero client JS on this page.
//   - Reads prompt_snapshots for this session up to the requested step.
//   - Step 1 has full_snapshot. Steps 2–N have diff_from_previous.
//   - We replay diffs forward from step 1 to reconstruct the full
//     message array at step (N-1) and step N, then compute a visual
//     diff between those two arrays.
//   - The llm_calls row for this step provides the right-panel metadata.
//
// URL shape: /dashboard/[sessionId]/diff?step=3
//   - `step` is 1-based. Defaults to the last step if omitted.
//   - Step 1 shows the initial prompt with no previous to diff against.

import type { Metadata }   from "next";
import { notFound }        from "next/navigation";
import Link                from "next/link";
import { supabaseAdmin }   from "@/lib/supabase";
import type { SearchParams } from "@/types/next";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role:    "system" | "user" | "assistant" | "tool" | "function";
  content: string | null;
  name?:   string;
}

/** Raw row from prompt_snapshots. */
interface SnapshotRow {
  call_id:            string;
  step_index:         number;
  full_snapshot:      ChatMessage[] | null;
  diff_from_previous: StoredDiff    | null;
}

/** The shape we store in diff_from_previous JSONB. */
interface StoredDiff {
  added:      ChatMessage[];
  removed:    ChatMessage[];
  tokenDelta: number;
}

/** Raw row from llm_calls for the metadata panel. */
interface CallMetaRaw {
  id:                 string;
  model:              string;
  tokens_in:          number | null;
  tokens_out:         number | null;
  latency_ms:         number;
  estimated_cost_usd: number | null;
  is_stream:          boolean;
  timestamp:          string;
  metadata:           Record<string, unknown> | null;
}

/** One line in the visual diff. */
type DiffLineKind = "keep" | "add" | "remove";

interface DiffLine {
  kind:    DiffLineKind;
  message: ChatMessage;
}

interface PageProps {
  params:       Promise<{ sessionId: string }>;
  searchParams: SearchParams;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function messageKey(m: ChatMessage): string {
  return `${m.role}::${m.content ?? ""}`;
}

/**
 * Applies a stored diff to a base message array.
 * Mirrors the SDK's applyDiff() — must stay in sync with lib/diff.ts.
 */
function applyDiff(base: ChatMessage[], diff: StoredDiff): ChatMessage[] {
  // Remove messages that appear in diff.removed
  const removedKeys = new Set(diff.removed.map(messageKey));
  const result = base.filter((m) => !removedKeys.has(messageKey(m)));
  // Append added messages
  return [...result, ...diff.added];
}

/**
 * Replays diffs from a base snapshot up to targetStep (1-based).
 * Returns the full message array at each step index.
 */
function replayToStep(
  snapshots: SnapshotRow[],
  targetStep: number,
): ChatMessage[] | null {
  const step1 = snapshots.find((s) => s.step_index === 1);
  if (!step1?.full_snapshot) return null;

  let current = [...step1.full_snapshot];
  if (targetStep === 1) return current;

  for (let i = 2; i <= targetStep; i++) {
    const snap = snapshots.find((s) => s.step_index === i);
    if (!snap) return null;

    if (snap.full_snapshot) {
      // Fallback full snapshot stored (e.g. after a failed diff batch)
      current = [...snap.full_snapshot];
    } else if (snap.diff_from_previous) {
      current = applyDiff(current, snap.diff_from_previous);
    } else {
      // Missing data — return what we have
      return current;
    }
  }

  return current;
}

/**
 * Computes a visual diff array between two message arrays.
 * Classifies each message as keep / add / remove.
 * Order: all kept/removed messages first (in prev order), then added.
 */
function computeVisualDiff(
  prev: ChatMessage[],
  curr: ChatMessage[],
): DiffLine[] {
  const currKeys = new Set(curr.map(messageKey));
  const prevKeys = new Set(prev.map(messageKey));

  const lines: DiffLine[] = [];

  // Walk prev — mark each as keep or remove
  for (const msg of prev) {
    lines.push({
      kind:    currKeys.has(messageKey(msg)) ? "keep" : "remove",
      message: msg,
    });
  }

  // Append additions (in curr but not in prev)
  for (const msg of curr) {
    if (!prevKeys.has(messageKey(msg))) {
      lines.push({ kind: "add", message: msg });
    }
  }

  return lines;
}

function formatCost(usd: number): string {
  if (usd === 0)     return "$0.00";
  if (usd < 0.0001) return `$${usd.toFixed(8).replace(/0+$/, "")}`;
  if (usd < 0.01)   return `$${usd.toFixed(6).replace(/0+$/, "")}`;
  return `$${usd.toFixed(4)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function relativeTime(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)  return `${diffHr} hr ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

/** Truncates message content for the diff view. Long tool results are
 *  collapsed to the first 300 chars to keep the view scannable. */
function truncateContent(content: string | null, role: string): string {
  if (!content) return "(empty)";
  const limit = role === "tool" ? 300 : 800;
  if (content.length <= limit) return content;
  return `${content.slice(0, limit)}\n… (${content.length - limit} more chars)`;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getDiffPageData(
  sessionId: string,
  stepIndex: number,
): Promise<{
  snapshots:    SnapshotRow[];
  callMeta:     CallMetaRaw;
  totalSteps:   number;
} | null> {
  const [snapshotsResult, callResult, countResult] = await Promise.all([
    // All snapshots for this session up to the requested step
    supabaseAdmin
      .from("prompt_snapshots")
      .select("call_id, step_index, full_snapshot, diff_from_previous")
      .eq("session_id", sessionId)
      .lte("step_index", stepIndex)
      .order("step_index", { ascending: true }) as unknown as Promise<{
        data: SnapshotRow[] | null;
        error: Error | null;
      }>,

    // The llm_calls row for this specific step — join via prompt_snapshots
    supabaseAdmin
      .from("llm_calls")
      .select(
        "id, model, tokens_in, tokens_out, latency_ms, " +
        "estimated_cost_usd, is_stream, timestamp, metadata",
      )
      .eq("session_id", sessionId)
      .order("timestamp", { ascending: true })
      .range(stepIndex - 1, stepIndex - 1) as unknown as Promise<{
        data: CallMetaRaw[] | null;
        error: Error | null;
      }>,

    // Total step count for the step navigator
    supabaseAdmin
      .from("llm_calls")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId) as unknown as Promise<{
        count: number | null;
        error: Error | null;
      }>,
  ]);

  if (
    snapshotsResult.error ||
    callResult.error     ||
    !snapshotsResult.data ||
    !callResult.data      ||
    callResult.data.length === 0
  ) {
    return null;
  }

  return {
    snapshots:  snapshotsResult.data,
    callMeta:   callResult.data[0],
    totalSteps: countResult.count ?? 1,
  };
}

// ── generateMetadata ──────────────────────────────────────────────────────────

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { sessionId } = await params;
  const sp = await searchParams;
  const step = Number(sp.step) || 1;
  const short = sessionId.length > 12 ? `${sessionId.slice(0, 8)}…` : sessionId;
  return { title: `Step ${step} · ${short}` };
}

// ── DiffLine component ────────────────────────────────────────────────────────

const GUTTER_CHAR: Record<DiffLineKind, string> = {
  keep:   " ",
  add:    "+",
  remove: "−",
};

const LINE_STYLE: Record<DiffLineKind, string> = {
  keep:   "text-[#52525b]",
  add:    "bg-[#052e16] text-[#10b981]",
  remove: "bg-[#1f0a0a] text-[#f43f5e]",
};

const GUTTER_STYLE: Record<DiffLineKind, string> = {
  keep:   "text-[#3f3f46]",
  add:    "text-[#10b981]",
  remove: "text-[#f43f5e]",
};

interface DiffLineRowProps {
  line:        DiffLine;
  lineNumber:  number;
}

function DiffLineRow({ line, lineNumber }: DiffLineRowProps) {
  const content   = truncateContent(line.message.content, line.message.role);
  const isMulti   = content.includes("\n");

  return (
    <div
      className={[
        "grid gap-2 px-4 py-1.5 font-mono text-[12.5px] leading-[1.65]",
        "border-b border-[#141414] last:border-b-0",
        LINE_STYLE[line.kind],
      ].join(" ")}
      style={{ gridTemplateColumns: "28px 72px 1fr" }}
    >
      {/* Line number */}
      <span className="text-[#3f3f46] text-[11px] select-none pt-px text-right">
        {lineNumber}
      </span>

      {/* Role badge */}
      <span className={[
        "text-[11px] font-medium tracking-[0.02em] select-none pt-px",
        line.kind === "keep"   ? "text-[#3f3f46]"  : "opacity-80",
      ].join(" ")}>
        {line.message.role}
      </span>

      {/* Content — preserve newlines for multi-line tool results */}
      <span className={isMulti ? "whitespace-pre-wrap break-words" : "truncate"}>
        {content}
      </span>
    </div>
  );
}

// ── MetaBar component ─────────────────────────────────────────────────────────

interface MetaBarProps {
  label: string;
  value: number;  // 0–100 percentage
  color: "blue" | "emerald" | "amber";
}

function MetaBar({ label, value, color }: MetaBarProps) {
  const barColor = {
    blue:    "#3b82f6",
    emerald: "#10b981",
    amber:   "#f59e0b",
  }[color];

  return (
    <div className="mt-2">
      <div className="flex justify-between items-center text-[12px] mb-1">
        <span className="text-[#71717a]">{label}</span>
        <span className="text-[#a1a1aa]">{value.toFixed(1)}%</span>
      </div>
      <div className="h-[5px] bg-[#1a1a1a] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, value)}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}

// ── StepNavigator ─────────────────────────────────────────────────────────────

interface StepNavigatorProps {
  sessionId:  string;
  stepIndex:  number;
  totalSteps: number;
}

function StepNavigator({ sessionId, stepIndex, totalSteps }: StepNavigatorProps) {
  const base    = `/dashboard/${encodeURIComponent(sessionId)}/diff`;
  const prevUrl = stepIndex > 1          ? `${base}?step=${stepIndex - 1}` : null;
  const nextUrl = stepIndex < totalSteps ? `${base}?step=${stepIndex + 1}` : null;

  const btnBase = [
    "h-8 px-3 rounded border text-[12px]",
    "inline-flex items-center gap-1.5 no-underline",
    "transition-colors duration-[120ms]",
  ].join(" ");

  const activeBtn  = `${btnBase} border-[#333] text-[#e4e4e7] hover:border-[#555]`;
  const disabledBtn = `${btnBase} border-[#1f1f1f] text-[#3f3f46] cursor-not-allowed pointer-events-none`;

  return (
    <div className="flex items-center gap-2">
      {prevUrl ? (
        <Link href={prevUrl} className={activeBtn}>← Prev</Link>
      ) : (
        <span className={disabledBtn}>← Prev</span>
      )}

      <span className="text-[#52525b] text-[12px] min-w-[72px] text-center">
        Step {stepIndex} / {totalSteps}
      </span>

      {nextUrl ? (
        <Link href={nextUrl} className={activeBtn}>Next →</Link>
      ) : (
        <span className={disabledBtn}>Next →</span>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DiffViewerPage({ params, searchParams }: PageProps) {
  const { sessionId } = await params;
  const sp = await searchParams;
  const rawStep = typeof sp.step === "string" ? parseInt(sp.step, 10) : NaN;
  const stepIndex = Number.isNaN(rawStep) || rawStep < 1 ? 1 : rawStep;

  // ── Fetch data ────────────────────────────────────────────────────────────
  const result = await getDiffPageData(sessionId, stepIndex);
  if (!result) notFound();

  const { snapshots, callMeta, totalSteps } = result;

  // ── Reconstruct message arrays ────────────────────────────────────────────
  const currMessages = replayToStep(snapshots, stepIndex);
  const prevMessages = stepIndex > 1 ? replayToStep(snapshots, stepIndex - 1) : null;

  if (!currMessages) notFound();

  // ── Compute visual diff ───────────────────────────────────────────────────
  const diffLines: DiffLine[] =
    prevMessages
      ? computeVisualDiff(prevMessages, currMessages)
      : currMessages.map((m) => ({ kind: "keep" as DiffLineKind, message: m }));

  // ── Diff summary counts ───────────────────────────────────────────────────
  const addedCount   = diffLines.filter((l) => l.kind === "add").length;
  const removedCount = diffLines.filter((l) => l.kind === "remove").length;
  const keptCount    = diffLines.filter((l) => l.kind === "keep").length;

  // ── Metadata calculations ─────────────────────────────────────────────────
  const tokensIn        = callMeta.tokens_in  ?? 0;
  const tokensOut       = callMeta.tokens_out ?? 0;
  const totalTokens     = tokensIn + tokensOut;
  const contextWindowPct = tokensIn > 0 ? (tokensIn / 128_000) * 100 : 0;
  const latencyPct       = Math.min(100, (callMeta.latency_ms / 10_000) * 100);
  const hasAnomaly       =
    callMeta.metadata?.anomaly === true ||
    callMeta.metadata?.anomaly === "true";

  // ── Breadcrumb display ────────────────────────────────────────────────────
  const truncatedId =
    sessionId.length > 20 ? `${sessionId.slice(0, 16)}…` : sessionId;

  return (
    <div>
      {/* ── Breadcrumb + page header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-[#52525b] text-[13px] mb-2">
          <Link href="/dashboard"
            className="hover:text-[#a1a1aa] no-underline transition-colors duration-[120ms]">
            Sessions
          </Link>
          <span aria-hidden="true">›</span>
          <Link
            href={`/dashboard/${encodeURIComponent(sessionId)}`}
            className="hover:text-[#a1a1aa] no-underline transition-colors duration-[120ms]"
          >
            {truncatedId}
          </Link>
          <span aria-hidden="true">›</span>
          <span className="text-[#a1a1aa]">Step {stepIndex}</span>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="m-0 text-white text-2xl font-medium leading-tight tracking-[-0.02em]">
            Prompt Diff Viewer
          </h1>
          <StepNavigator
            sessionId={sessionId}
            stepIndex={stepIndex}
            totalSteps={totalSteps}
          />
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div
        className="grid gap-6"
        style={{ gridTemplateColumns: "minmax(0, 1.6fr) 340px" }}
      >
        {/* ── LEFT: Diff panel ── */}
        <div className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden min-w-0">

          {/* Panel header */}
          <div className="px-5 py-4 border-b border-[#1f1f1f] flex items-start justify-between gap-4">
            <div>
              <h2 className="m-0 text-white text-sm font-medium">
                {stepIndex === 1
                  ? "Initial Prompt"
                  : `Step ${stepIndex - 1} → Step ${stepIndex}`}
              </h2>
              <p className="mt-1 mb-0 text-[#71717a] text-[12px]">
                {stepIndex === 1 ? (
                  `${currMessages.length} message${currMessages.length !== 1 ? "s" : ""} · initial context`
                ) : (
                  <>
                    {addedCount > 0 && (
                      <span className="text-[#10b981]">+{addedCount} added</span>
                    )}
                    {addedCount > 0 && removedCount > 0 && (
                      <span className="text-[#52525b]"> · </span>
                    )}
                    {removedCount > 0 && (
                      <span className="text-[#f43f5e]">−{removedCount} removed</span>
                    )}
                    {(addedCount > 0 || removedCount > 0) && keptCount > 0 && (
                      <span className="text-[#52525b]"> · </span>
                    )}
                    <span className="text-[#52525b]">{keptCount} unchanged</span>
                  </>
                )}
              </p>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 flex-shrink-0 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-[#10b981]" />
                <span className="text-[#71717a]">added</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-[#f43f5e]" />
                <span className="text-[#71717a]">removed</span>
              </span>
            </div>
          </div>

          {/* Diff lines */}
          <div
            className="overflow-y-auto"
            style={{ maxHeight: "calc(100vh - 280px)" }}
            aria-label="Prompt diff"
          >
            {diffLines.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-[#52525b] text-sm">
                No messages to display for this step.
              </div>
            ) : (
              diffLines.map((line, i) => (
                <DiffLineRow
                  key={i}
                  line={line}
                  lineNumber={i + 1}
                />
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT: Metadata panel ── */}
        <aside className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden h-fit">

          {/* Panel header */}
          <div className="px-5 py-4 border-b border-[#1f1f1f]">
            <h2 className="m-0 text-white text-sm font-medium">Call Metadata</h2>
            <p className="mt-1 mb-0 text-[#71717a] text-[12px] font-mono truncate">
              {callMeta.id}
            </p>
          </div>

          {/* Performance */}
          <div className="px-5 py-4 border-b border-[#1f1f1f]">
            <p className="m-0 mb-3 text-[#71717a] text-[11px] uppercase tracking-[0.05em]">
              Performance
            </p>
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#a1a1aa]">Latency</span>
              <strong className="text-white font-medium">
                {callMeta.latency_ms.toLocaleString()} ms
              </strong>
            </div>
            <MetaBar label="" value={latencyPct} color="blue" />

            <div className="flex justify-between items-center text-[13px] mt-3">
              <span className="text-[#a1a1aa]">Mode</span>
              <span className="text-[#a1a1aa]">
                {callMeta.is_stream ? "streaming" : "blocking"}
              </span>
            </div>
          </div>

          {/* Tokens */}
          <div className="px-5 py-4 border-b border-[#1f1f1f]">
            <p className="m-0 mb-3 text-[#71717a] text-[11px] uppercase tracking-[0.05em]">
              Tokens
            </p>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[#a1a1aa]">Prompt</span>
                <span className="text-[#a1a1aa] font-mono">{tokensIn.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#a1a1aa]">Completion</span>
                <span className="text-[#a1a1aa] font-mono">{tokensOut.toLocaleString()}</span>
              </div>
              <div className="flex justify-between border-t border-[#1f1f1f] pt-2 mt-2">
                <span className="text-[#a1a1aa]">Total</span>
                <strong className="text-white font-medium font-mono">
                  {totalTokens.toLocaleString()}
                </strong>
              </div>
            </div>
            <MetaBar
              label={`Context used (${contextWindowPct.toFixed(1)}%)`}
              value={contextWindowPct}
              color={contextWindowPct > 70 ? "amber" : "emerald"}
            />
          </div>

          {/* Cost */}
          <div className="px-5 py-4 border-b border-[#1f1f1f]">
            <p className="m-0 mb-3 text-[#71717a] text-[11px] uppercase tracking-[0.05em]">
              Cost
            </p>
            <div className="flex justify-between text-[13px]">
              <span className="text-[#a1a1aa]">This call</span>
              <span className="text-[#10b981] font-medium">
                {formatCost(callMeta.estimated_cost_usd ?? 0)}
              </span>
            </div>
          </div>

          {/* Model */}
          <div className="px-5 py-4 border-b border-[#1f1f1f]">
            <p className="m-0 mb-3 text-[#71717a] text-[11px] uppercase tracking-[0.05em]">
              Model
            </p>
            <div className="flex justify-between text-[13px]">
              <span className="font-mono text-[#e4e4e7]">{callMeta.model}</span>
              <span className="text-[#52525b]">{relativeTime(callMeta.timestamp)}</span>
            </div>
            <div className="mt-1.5 text-[#52525b] text-[12px]">
              Step {stepIndex} of {totalSteps}
            </div>
          </div>

          {/* Anomaly detection */}
          <div className="px-5 py-4 border-b border-[#1f1f1f]">
            <p className="m-0 mb-3 text-[#71717a] text-[11px] uppercase tracking-[0.05em]">
              Anomaly Detection
            </p>
            {hasAnomaly ? (
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 w-5 h-5 flex-none rounded border border-[#451a03] bg-[#2d1a00] text-[#f59e0b] inline-flex items-center justify-center text-[11px]">
                  !
                </span>
                <div>
                  <div className="text-[#f59e0b] text-[13px]">Anomaly flagged</div>
                  <div className="mt-0.5 text-[#71717a] text-[12px]">
                    Context growth rate exceeded threshold at this step.
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[#10b981] text-[12px]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>No anomalies this step</span>
              </div>
            )}
          </div>

          {/* Replay button */}
          <div className="px-5 py-4">
            <button
              type="button"
              className={[
                "w-full h-10",
                "bg-[#1a2744] border border-[#1e3a8a]",
                "text-[#3b82f6] text-sm rounded-md",
                "inline-flex items-center justify-center gap-2",
                "transition-colors duration-[120ms]",
                "hover:bg-[#1e3a5f] active:scale-[0.98]",
              ].join(" ")}
            >
              Replay this prompt
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}