"use client";
// components/dashboard/CostFlowSankey.tsx

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { sankey, sankeyLinkHorizontal, sankeyJustify } from "d3-sankey";
import type {
  SankeyData,
  SankeyInputNode,
} from "@/app/dashboard/cost/sankey/page";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CostFlowSankeyProps {
  data: SankeyData;
}

/**
 * Plain data attached to every node.
 * `name` is required by the d3-sankey SankeyNode constraint and is set to the
 * same value as `id`.
 */
interface NodeDatum {
  id: string;
  name: string; // required by SankeyNode – set equal to id
  label: string;
  layer: SankeyInputNode["layer"];
  totalCost: number;
}

interface LinkDatum {
  source: number;
  target: number;
  value: number;
}

/**
 * After d3-sankey runs its layout, it merges coordinates into the node/link
 * objects.  We use intersection types so we can access both our custom fields
 * and the layout fields without generic parameters (which the installed version
 * of @types/d3-sankey does not support).
 */
type LayoutNode = NodeDatum & {
  index?: number;
  depth?: number;
  height?: number;
  value?: number;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  sourceLinks?: LayoutLink[];
  targetLinks?: LayoutLink[];
};

type LayoutLink = LinkDatum & {
  source: LayoutNode;
  target: LayoutNode;
  width?: number;
  y0?: number;
  y1?: number;
  index?: number;
};

interface TooltipState {
  x: number;
  y: number;
  label: string;
  cost: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LAYER_COLORS: Record<SankeyInputNode["layer"], string> = {
  project: "#6366f1",
  model: "#8b5cf6",
  feature: "#ec4899",
  session: "#06b6d4",
};

const LAYER_LABELS: Record<SankeyInputNode["layer"], string> = {
  project: "Project",
  model: "Model",
  feature: "Feature",
  session: "Session",
};

const MARGIN = { top: 20, right: 168, bottom: 20, left: 168 };
const NODE_W = 14;
const NODE_PAD = 18;
const SVG_H = 520;
const MIN_W = 480;

/**
 * Module-level path generator — pure function with no configuration, so
 * creating it once avoids a new allocation per render.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linkPath = (sankeyLinkHorizontal as any)();

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCost(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function truncate(str: string, max = 20): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// ── Sankey layout ─────────────────────────────────────────────────────────────

/**
 * Builds and runs the d3-sankey layout.  Returns null when the data is empty
 * or would produce an invalid graph (e.g. cycles).
 *
 * We use `sankey()` without type parameters because the installed version of
 * @types/d3-sankey does not expose generic overloads.  Instead we cast the
 * result to our own LayoutNode / LayoutLink intersection types.
 */
function buildGraph(
  data: SankeyData,
  innerW: number,
  innerH: number,
): { nodes: LayoutNode[]; links: LayoutLink[] } | null {
  if (!data.nodes.length || !data.links.length) return null;

  const idToIndex = new Map<string, number>(
    data.nodes.map((n, i) => [n.id, i]),
  );

  // Input links reference nodes by numeric index.
  const inputLinks: Array<{ source: number; target: number; value: number }> =
    [];
  for (const l of data.links) {
    const si = idToIndex.get(l.source);
    const ti = idToIndex.get(l.target);
    if (si === undefined || ti === undefined) continue;
    inputLinks.push({ source: si, target: ti, value: l.value });
  }
  if (!inputLinks.length) return null;

  // Shallow-copy each node so d3-sankey mutations don't affect the original.
  // `name` is set equal to `id` — it satisfies the SankeyNode constraint and
  // also acts as the node identifier for the layout engine.
  const inputNodes: NodeDatum[] = data.nodes.map((n) => ({
    ...n,
    name: n.id,
  }));

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layout = (sankey as any)()
      .nodeAlign(sankeyJustify)
      .nodeWidth(NODE_W)
      .nodePadding(NODE_PAD)
      .nodeId((d: NodeDatum) => d.name)
      .extent([
        [0, 0],
        [innerW, innerH],
      ]);

    const result = layout({ nodes: inputNodes, links: inputLinks });

    return {
      nodes: result.nodes as LayoutNode[],
      links: result.links as LayoutLink[],
    };
  } catch {
    return null;
  }
}

// ── Stable hover handlers (module-level) ─────────────────────────────────────

function handleLinkOver(e: React.MouseEvent<SVGPathElement>) {
  e.currentTarget.style.strokeOpacity = "0.45";
}
function handleLinkOut(e: React.MouseEvent<SVGPathElement>) {
  e.currentTarget.style.strokeOpacity = "0.18";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CostFlowSankey({ data }: CostFlowSankeyProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgWidth, setSvgWidth] = useState(MIN_W);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // ── Responsive width ───────────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setSvgWidth(Math.max(w, MIN_W));
    });
    ro.observe(el);
    setSvgWidth(Math.max(el.clientWidth, MIN_W));
    return () => ro.disconnect();
  }, []);

  // ── Layout (memoised) ──────────────────────────────────────────────────────

  const innerW = svgWidth - MARGIN.left - MARGIN.right;
  const innerH = SVG_H - MARGIN.top - MARGIN.bottom;

  const graph = useMemo(
    () => buildGraph(data, innerW, innerH),
    [data, innerW, innerH],
  );

  // ── Sorted nodes for the breakdown table ──────────────────────────────────

  const sortedNodes = useMemo(
    () =>
      graph ? [...graph.nodes].sort((a, b) => b.totalCost - a.totalCost) : [],
    [graph],
  );

  // ── Tooltip helpers ────────────────────────────────────────────────────────

  const handleMouseEnter = useCallback((e: React.MouseEvent<SVGElement>) => {
    const raw = (e.currentTarget as SVGElement).dataset.tip;
    if (!raw) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const payload = JSON.parse(raw) as { label: string; cost: number };
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      ...payload,
    });
  }, []);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  // ── Percentage helper ──────────────────────────────────────────────────────

  const pctOf = useCallback(
    (cost: number) =>
      data.grandTotalCost > 0
        ? ((cost / data.grandTotalCost) * 100).toFixed(1)
        : "0",
    [data.grandTotalCost],
  );

  // ── Empty / error state ────────────────────────────────────────────────────

  if (!graph) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <p className="text-zinc-500 text-sm">
          {data.nodes.length === 0
            ? "No cost data available for this period."
            : "Unable to render flow diagram — data may contain cycles."}
        </p>
      </div>
    );
  }

  const { nodes, links } = graph;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-1">
        {(Object.keys(LAYER_LABELS) as SankeyInputNode["layer"][]).map(
          (layer) => (
            <div key={layer} className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-sm shrink-0"
                style={{ backgroundColor: LAYER_COLORS[layer] }}
              />
              <span className="text-zinc-400 text-xs">
                {LAYER_LABELS[layer]}
              </span>
            </div>
          ),
        )}
        <span className="text-zinc-600 text-xs ml-auto hidden sm:block">
          Band width = proportional spend
        </span>
      </div>

      {/* Sankey diagram */}
      <div
        ref={containerRef}
        className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden relative"
      >
        <div className="overflow-x-auto">
          <svg
            ref={svgRef}
            width={svgWidth}
            height={SVG_H}
            className="block"
            style={{ minWidth: MIN_W }}
            aria-label="Cost flow sankey diagram"
          >
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {/* ── Links ── */}
              {links.map((link, i) => {
                const src = link.source as LayoutNode;
                const tgt = link.target as LayoutNode;
                const color = LAYER_COLORS[src.layer];
                const tip = JSON.stringify({
                  label: `${src.label} → ${tgt.label}`,
                  cost: link.value,
                });

                return (
                  <path
                    key={`link-${i}`}
                    d={linkPath(link) ?? ""}
                    fill="none"
                    stroke={color}
                    strokeWidth={Math.max(link.width ?? 1, 1)}
                    strokeOpacity={0.18}
                    className="cursor-pointer"
                    data-tip={tip}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    onMouseOver={handleLinkOver}
                    onMouseOut={handleLinkOut}
                  />
                );
              })}

              {/* ── Nodes ── */}
              {nodes.map((node) => {
                const x0 = node.x0 ?? 0;
                const x1 = node.x1 ?? 0;
                const y0 = node.y0 ?? 0;
                const y1 = node.y1 ?? 0;
                const h = Math.max(y1 - y0, 2);
                const color = LAYER_COLORS[node.layer];
                const midY = y0 + h / 2;
                const isLeft = x0 < innerW / 2;
                const labelX = isLeft ? x1 + 8 : x0 - 8;
                const labelAnchor = isLeft ? "start" : "end";
                const tip = JSON.stringify({
                  label: node.label,
                  cost: node.totalCost,
                });

                return (
                  <g
                    key={node.id}
                    className="cursor-pointer"
                    data-tip={tip}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                  >
                    <rect
                      x={x0}
                      y={y0}
                      width={x1 - x0}
                      height={h}
                      rx={3}
                      fill={color}
                      fillOpacity={0.85}
                    />

                    {/* % badge — only when the bar is tall enough */}
                    {h >= 20 && (
                      <text
                        x={(x0 + x1) / 2}
                        y={midY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="white"
                        fontSize={9}
                        fontWeight={600}
                        style={{ userSelect: "none", pointerEvents: "none" }}
                      >
                        {pctOf(node.totalCost)}%
                      </text>
                    )}

                    {/* External label */}
                    <text
                      x={labelX}
                      y={midY}
                      textAnchor={labelAnchor}
                      dominantBaseline="middle"
                      fill="#d4d4d8"
                      fontSize={11}
                      style={{ userSelect: "none", pointerEvents: "none" }}
                    >
                      {truncate(node.label)}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Floating tooltip */}
        {tooltip && (
          <div
            className="absolute pointer-events-none z-10 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 shadow-2xl"
            style={{
              left: Math.min(tooltip.x + 14, svgWidth - 190),
              top: Math.max(tooltip.y - 48, 8),
            }}
          >
            <p className="text-zinc-300 text-xs font-medium truncate max-w-[172px] mb-0.5">
              {tooltip.label}
            </p>
            <p className="text-white text-sm font-semibold">
              {formatCost(tooltip.cost)}
            </p>
            <p className="text-zinc-500 text-xs">
              {pctOf(tooltip.cost)}% of total
            </p>
          </div>
        )}
      </div>

      {/* Cost breakdown table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 md:px-6 py-3 border-b border-zinc-800 bg-zinc-950/50">
          <h2 className="text-white text-sm font-medium m-0">Cost breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                {(["Layer", "Name", "Cost", "% of total"] as const).map((h) => (
                  <th
                    key={h}
                    className="text-left text-zinc-500 font-medium py-2 px-3 first:pl-6 last:pr-6"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedNodes.map((node) => {
                const color = LAYER_COLORS[node.layer];
                const pct = pctOf(node.totalCost);
                return (
                  <tr
                    key={node.id}
                    className="border-b border-zinc-800/40 last:border-0 hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="py-2 px-3 pl-6">
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{ color, backgroundColor: `${color}20` }}
                      >
                        {LAYER_LABELS[node.layer]}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-zinc-300 max-w-[200px] truncate">
                      {node.label}
                    </td>
                    <td className="py-2 px-3 font-mono text-white tabular-nums">
                      {formatCost(node.totalCost)}
                    </td>
                    <td className="py-2 px-3 pr-6">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-20 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(parseFloat(pct), 100)}%`,
                              backgroundColor: color,
                            }}
                          />
                        </div>
                        <span className="text-zinc-400 tabular-nums min-w-[36px]">
                          {pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
