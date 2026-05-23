// app/dashboard/[sessionId]/diff/page.tsx

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveProjectId } from "@/lib/project-context";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool" | "function";
  content: string | null;
  name?: string;
}

interface SnapshotRow {
  call_id: string;
  step_index: number;
  full_snapshot: ChatMessage[] | null;
  diff_from_previous: StoredDiff | null;
}

interface StoredDiff {
  added: ChatMessage[];
  removed: ChatMessage[];
  tokenDelta: number;
}

interface CallMetaRaw {
  id: string;
  model: string;
  tokens_in: number | null;
  tokens_out: number | null;
  latency_ms: number;
  estimated_cost_usd: number | null;
  is_stream: boolean;
  timestamp: string;
  metadata: Record<string, unknown> | null;
}

type DiffLineKind = "keep" | "add" | "remove";

interface DiffLine {
  kind: DiffLineKind;
  message: ChatMessage;
}

// FIX 1: searchParams is a Promise in Next.js 15 App Router Server Components.
// The original typed it as SearchParams (not wrapped in Promise), which caused
// TypeScript to error on `await searchParams`. Typed correctly here.
interface PageProps {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// ── Diff line display maps ─────────────────────────────────────────────────────
// Kept as records for O(1) lookup. All three are used in DiffLineRow.

const GUTTER_CHAR: Record<DiffLineKind, string> = {
  keep: " ",
  add: "+",
  remove: "−",
};

const GUTTER_STYLE: Record<DiffLineKind, string> = {
  keep: "text-[#3f3f46]",
  add: "text-[#10b981]",
  remove: "text-[#f43f5e]",
};

const LINE_STYLE: Record<DiffLineKind, string> = {
  keep: "text-[#52525b]",
  add: "bg-[#052e16] text-[#10b981]",
  remove: "bg-[#1f0a0a] text-[#f43f5e]",
};

// FIX 2: MetaBar backgroundColor was an inline style with a computed string.
// Tailwind can't purge these because it scans source at build time.
// Map the three allowed values to static Tailwind classes instead.
// Static string keys → Tailwind includes them in the bundle correctly.
const BAR_COLOR_CLASS: Record<"blue" | "emerald" | "amber", string> = {
  blue: "bg-[#3b82f6]",
  emerald: "bg-[#10b981]",
  amber: "bg-[#f59e0b]",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function messageKey(m: ChatMessage): string {
  return `${m.role}::${m.content ?? ""}`;
}

function applyDiff(base: ChatMessage[], diff: StoredDiff): ChatMessage[] {
  const removedKeys = new Set(diff.removed.map(messageKey));
  return [
    ...base.filter((m) => !removedKeys.has(messageKey(m))),
    ...diff.added,
  ];
}

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
    if (snap.full_snapshot) current = [...snap.full_snapshot];
    else if (snap.diff_from_previous)
      current = applyDiff(current, snap.diff_from_previous);
    else return current; // missing data — return best effort
  }

  return current;
}

function computeVisualDiff(
  prev: ChatMessage[],
  curr: ChatMessage[],
): DiffLine[] {
  const currKeys = new Set(curr.map(messageKey));
  const prevKeys = new Set(prev.map(messageKey));
  const lines: DiffLine[] = [];

  for (const msg of prev) {
    lines.push({
      kind: currKeys.has(messageKey(msg)) ? "keep" : "remove",
      message: msg,
    });
  }
  for (const msg of curr) {
    if (!prevKeys.has(messageKey(msg)))
      lines.push({ kind: "add", message: msg });
  }

  return lines;
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.0001) return `$${usd.toFixed(8).replace(/0+$/, "")}`;
  if (usd < 0.01) return `$${usd.toFixed(6).replace(/0+$/, "")}`;
  return `$${usd.toFixed(4)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function truncateContent(content: string | null, role: string): string {
  if (!content) return "(empty)";
  const limit = role === "tool" ? 300 : 800;
  return content.length <= limit
    ? content
    : `${content.slice(0, limit)}\n… (${content.length - limit} more chars)`;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getDiffPageData(
  sessionId: string,
  stepIndex: number,
  projectId: string,
): Promise<{
  snapshots: SnapshotRow[];
  callMeta: CallMetaRaw;
  totalSteps: number;
} | null> {
  const [snapshotsResult, callResult, countResult] = await Promise.all([
    supabaseAdmin
      .from("prompt_snapshots")
      .select("call_id, step_index, full_snapshot, diff_from_previous")
      .eq("session_id", sessionId)
      .eq("project_id", projectId)
      .lte("step_index", stepIndex)
      .order("step_index", { ascending: true }) as unknown as Promise<{
      data: SnapshotRow[] | null;
      error: Error | null;
    }>,

    supabaseAdmin
      .from("llm_calls")
      .select(
        "id, model, tokens_in, tokens_out, latency_ms, " +
          "estimated_cost_usd, is_stream, timestamp, metadata",
      )
      .eq("session_id", sessionId)
      .eq("project_id", projectId)
      .order("timestamp", { ascending: true })
      .range(stepIndex - 1, stepIndex - 1) as unknown as Promise<{
      data: CallMetaRaw[] | null;
      error: Error | null;
    }>,

    supabaseAdmin
      .from("llm_calls")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("project_id", projectId) as unknown as Promise<{
      count: number | null;
      error: Error | null;
    }>,
  ]);

  if (
    snapshotsResult.error ||
    callResult.error ||
    !snapshotsResult.data ||
    !callResult.data ||
    callResult.data.length === 0
  )
    return null;

  return {
    snapshots: snapshotsResult.data,
    callMeta: callResult.data[0],
    totalSteps: countResult.count ?? 1,
  };
}

// ── generateMetadata ──────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { sessionId } = await params;
  const sp = await searchParams;
  const step = Number(sp.step) || 1;
  const short = sessionId.length > 12 ? `${sessionId.slice(0, 8)}…` : sessionId;
  return { title: `Step ${step} · ${short}` };
}

// ── DiffLineRow ───────────────────────────────────────────────────────────────
// FIX 3: Replaced style={{ gridTemplateColumns: "28px 16px 72px 1fr" }}
// with Tailwind arbitrary value class. Static string → safe from purge.

interface DiffLineRowProps {
  line: DiffLine;
  lineNumber: number;
}

function DiffLineRow({ line, lineNumber }: DiffLineRowProps) {
  const content = truncateContent(line.message.content, line.message.role);
  const isMulti = content.includes("\n");

  return (
    <div
      className={[
        // FIX 3: was style={{ gridTemplateColumns: "28px 16px 72px 1fr" }}
        "grid grid-cols-[28px_16px_72px_1fr] gap-2",
        "px-4 py-1.5 font-mono text-[12.5px] leading-[1.65]",
        "border-b border-[#141414] last:border-b-0",
        LINE_STYLE[line.kind],
      ].join(" ")}
    >
      <span className="text-[#3f3f46] text-[11px] select-none pt-px text-right">
        {lineNumber}
      </span>
      <span
        className={[
          "select-none pt-px text-center font-bold",
          GUTTER_STYLE[line.kind],
        ].join(" ")}
        aria-hidden="true"
      >
        {GUTTER_CHAR[line.kind]}
      </span>
      <span
        className={[
          "text-[11px] font-medium tracking-[0.02em] select-none pt-px",
          line.kind === "keep" ? "text-[#3f3f46]" : "opacity-80",
        ].join(" ")}
      >
        {line.message.role}
      </span>
      <span
        className={isMulti ? "whitespace-pre-wrap break-words" : "truncate"}
      >
        {content}
      </span>
    </div>
  );
}

// ── MetaBar ───────────────────────────────────────────────────────────────────
// FIX 4: backgroundColor removed from inline style.
// Now uses BAR_COLOR_CLASS map → static Tailwind class string.
// width stays inline because it is genuinely dynamic (0–100 float).

interface MetaBarProps {
  label: string;
  value: number;
  color: "blue" | "emerald" | "amber";
}
function getBarWidthClass(value: number) {
  const pct = Math.max(0, Math.min(100, value));
  return `w-[${pct}%]`;
}

function MetaBar({ label, value, color }: MetaBarProps) {
  return (
    <div className="mt-2">
      {label && (
        <div className="flex justify-between items-center text-[12px] mb-1">
          <span className="text-[#71717a]">{label}</span>
          <span className="text-[#a1a1aa]">{value.toFixed(1)}%</span>
        </div>
      )}
      <div className="h-[5px] bg-[#1a1a1a] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${BAR_COLOR_CLASS[color]} ${getBarWidthClass(value)}`}
        />
      </div>
    </div>
  );
}

// ── StepNavigator ─────────────────────────────────────────────────────────────

interface StepNavigatorProps {
  sessionId: string;
  stepIndex: number;
  totalSteps: number;
}

function StepNavigator({
  sessionId,
  stepIndex,
  totalSteps,
}: StepNavigatorProps) {
  const base = `/dashboard/${encodeURIComponent(sessionId)}/diff`;
  const prevUrl = stepIndex > 1 ? `${base}?step=${stepIndex - 1}` : null;
  const nextUrl =
    stepIndex < totalSteps ? `${base}?step=${stepIndex + 1}` : null;

  const activeBtn =
    "h-8 px-3 rounded border border-[#333] text-[12px] text-[#e4e4e7] inline-flex items-center gap-1.5 no-underline transition-colors duration-[120ms] hover:border-[#555]";
  const disabledBtn =
    "h-8 px-3 rounded border border-[#1f1f1f] text-[12px] text-[#3f3f46] inline-flex items-center gap-1.5 cursor-not-allowed pointer-events-none";

  return (
    <div className="flex items-center gap-2">
      {prevUrl ? (
        <Link href={prevUrl} className={activeBtn}>
          ← Prev
        </Link>
      ) : (
        <span className={disabledBtn}>← Prev</span>
      )}
      <span className="text-[#52525b] text-[12px] min-w-[72px] text-center">
        Step {stepIndex} / {totalSteps}
      </span>
      {nextUrl ? (
        <Link href={nextUrl} className={activeBtn}>
          Next →
        </Link>
      ) : (
        <span className={disabledBtn}>Next →</span>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DiffViewerPage({
  params,
  searchParams,
}: PageProps) {
  const { sessionId } = await params;
  const sp = await searchParams;
  const rawStep = typeof sp.step === "string" ? parseInt(sp.step, 10) : NaN;
  const stepIndex = Number.isNaN(rawStep) || rawStep < 1 ? 1 : rawStep;
  const projectId = await getActiveProjectId();

  const result = await getDiffPageData(sessionId, stepIndex, projectId);
  if (!result) notFound();

  const { snapshots, callMeta, totalSteps } = result;

  const currMessages = replayToStep(snapshots, stepIndex);
  const prevMessages =
    stepIndex > 1 ? replayToStep(snapshots, stepIndex - 1) : null;
  if (!currMessages) notFound();

  const diffLines: DiffLine[] = prevMessages
    ? computeVisualDiff(prevMessages, currMessages)
    : currMessages.map((m) => ({ kind: "keep" as DiffLineKind, message: m }));

  const addedCount = diffLines.filter((l) => l.kind === "add").length;
  const removedCount = diffLines.filter((l) => l.kind === "remove").length;
  const keptCount = diffLines.filter((l) => l.kind === "keep").length;

  const tokensIn = callMeta.tokens_in ?? 0;
  const tokensOut = callMeta.tokens_out ?? 0;
  const totalTokens = tokensIn + tokensOut;
  const contextWindowPct = tokensIn > 0 ? (tokensIn / 128_000) * 100 : 0;
  const latencyPct = Math.min(100, (callMeta.latency_ms / 10_000) * 100);
  const hasAnomaly =
    callMeta.metadata?.anomaly === true ||
    callMeta.metadata?.anomaly === "true";
  const truncatedId =
    sessionId.length > 20 ? `${sessionId.slice(0, 16)}…` : sessionId;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-[#52525b] text-[13px] mb-2">
          <Link
            href="/dashboard"
            className="hover:text-[#a1a1aa] no-underline transition-colors duration-[120ms]"
          >
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

      {/* FIX 5: Replaced style={{ gridTemplateColumns: "minmax(0,1.6fr) 340px" }}
          with Tailwind arbitrary value grid class. */}
      <div className="grid grid-cols-[minmax(0,1.6fr)_340px] gap-6">
        {/* LEFT: diff panel */}
        <div className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden min-w-0">
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
                      <span className="text-[#10b981]">
                        +{addedCount} added
                      </span>
                    )}
                    {addedCount > 0 && removedCount > 0 && (
                      <span className="text-[#52525b]"> · </span>
                    )}
                    {removedCount > 0 && (
                      <span className="text-[#f43f5e]">
                        −{removedCount} removed
                      </span>
                    )}
                    {(addedCount > 0 || removedCount > 0) && keptCount > 0 && (
                      <span className="text-[#52525b]"> · </span>
                    )}
                    <span className="text-[#52525b]">
                      {keptCount} unchanged
                    </span>
                  </>
                )}
              </p>
            </div>
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

          {/* FIX 6: Replaced style={{ maxHeight: "calc(100vh - 280px)" }}
              with Tailwind arbitrary value class. */}
          <div
            className="overflow-y-auto max-h-[calc(100vh-280px)]"
            aria-label="Prompt diff"
          >
            {diffLines.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-[#52525b] text-sm">
                No messages to display for this step.
              </div>
            ) : (
              diffLines.map((line, i) => (
                <DiffLineRow key={i} line={line} lineNumber={i + 1} />
              ))
            )}
          </div>
        </div>

        {/* RIGHT: metadata panel */}
        <aside className="bg-[#111] border border-[#1f1f1f] rounded-lg overflow-hidden h-fit">
          <div className="px-5 py-4 border-b border-[#1f1f1f]">
            <h2 className="m-0 text-white text-sm font-medium">
              Call Metadata
            </h2>
            <p className="mt-1 mb-0 text-[#71717a] text-[12px] font-mono truncate">
              {callMeta.id}
            </p>
          </div>

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

          <div className="px-5 py-4 border-b border-[#1f1f1f]">
            <p className="m-0 mb-3 text-[#71717a] text-[11px] uppercase tracking-[0.05em]">
              Tokens
            </p>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[#a1a1aa]">Prompt</span>
                <span className="text-[#a1a1aa] font-mono">
                  {formatTokens(tokensIn)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#a1a1aa]">Completion</span>
                <span className="text-[#a1a1aa] font-mono">
                  {formatTokens(tokensOut)}
                </span>
              </div>
              <div className="flex justify-between border-t border-[#1f1f1f] pt-2 mt-2">
                <span className="text-[#a1a1aa]">Total</span>
                <strong className="text-white font-medium font-mono">
                  {formatTokens(totalTokens)}
                </strong>
              </div>
            </div>
            <MetaBar
              label={`Context used (${contextWindowPct.toFixed(1)}%)`}
              value={contextWindowPct}
              color={contextWindowPct > 70 ? "amber" : "emerald"}
            />
          </div>

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

          <div className="px-5 py-4 border-b border-[#1f1f1f]">
            <p className="m-0 mb-3 text-[#71717a] text-[11px] uppercase tracking-[0.05em]">
              Model
            </p>
            <div className="flex justify-between text-[13px]">
              <span className="font-mono text-[#e4e4e7]">{callMeta.model}</span>
              <span className="text-[#52525b]">
                {relativeTime(callMeta.timestamp)}
              </span>
            </div>
            <div className="mt-1.5 text-[#52525b] text-[12px]">
              Step {stepIndex} of {totalSteps}
            </div>
          </div>

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
                  <div className="text-[#f59e0b] text-[13px]">
                    Anomaly flagged
                  </div>
                  <div className="mt-0.5 text-[#71717a] text-[12px]">
                    Context growth rate exceeded threshold at this step.
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[#10b981] text-[12px]">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>No anomalies this step</span>
              </div>
            )}
          </div>

          <div className="px-5 py-4">
            <Link
              href={`/dashboard/${encodeURIComponent(sessionId)}/replay?step=${stepIndex}`}
              className="w-full h-10 bg-[#1a2744] border border-[#1e3a8a] text-[#3b82f6] text-sm rounded-md inline-flex items-center justify-center gap-2 transition-colors duration-[120ms] hover:bg-[#1e3a5f] active:scale-[0.98] no-underline"
            >
              Replay this prompt
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
