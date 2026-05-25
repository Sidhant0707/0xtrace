// components/dashboard/AgentLoopGraph.tsx

"use client";

import { useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlowProvider,
  Handle,
  Position,
  type Node,
  type Edge,
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "@dagrejs/dagre";

const NODE_W = 210;
const NODE_H = 120;

export interface StepData {
  stepIndex: number;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  costUsd: number;
  isStream: boolean;
  hasError: boolean;
}

interface NodeData extends StepData {
  tokenDelta: number;
  isLoopSuspect: boolean;
}

function classifyEdge(delta: number): {
  color: string;
  strokeWidth: number;
  animated: boolean;
} {
  if (delta > 5_000)
    return { color: "#ef4444", strokeWidth: 3, animated: true };
  if (delta > 500) return { color: "#f59e0b", strokeWidth: 2, animated: false };
  return { color: "#3f3f46", strokeWidth: 1, animated: false };
}

function buildGraph(steps: StepData[]): {
  nodes: Node<NodeData>[];
  edges: Edge[];
} {
  const sorted = [...steps].sort((a, b) => a.stepIndex - b.stepIndex);

  const nodes: Node<NodeData>[] = sorted.map((step, i) => {
    const prev = sorted[i - 1];
    const tokenDelta = prev ? step.tokensIn - prev.tokensIn : 0;
    const isLoopSuspect = i > 0 && tokenDelta < 200;

    return {
      id: String(step.stepIndex),
      type: "stepNode",
      position: { x: 0, y: 0 },
      data: { ...step, tokenDelta, isLoopSuspect },
    };
  });

  const edges: Edge[] = sorted.slice(0, -1).map((step, i) => {
    const next = sorted[i + 1];
    const delta = next.tokensIn - step.tokensIn;
    const { color, strokeWidth, animated } = classifyEdge(delta);
    const label =
      delta >= 0
        ? `+${delta.toLocaleString()} tok`
        : `${delta.toLocaleString()} tok`;

    return {
      id: `e${step.stepIndex}-${next.stepIndex}`,
      source: String(step.stepIndex),
      target: String(next.stepIndex),
      animated,
      label,
      labelStyle: { fill: "#71717a", fontSize: 10 },
      labelBgStyle: { fill: "#18181b" },
      labelBgPadding: [4, 2] as [number, number],
      style: { stroke: color, strokeWidth },
    };
  });

  return { nodes, edges };
}

function applyDagreLayout(
  nodes: Node<NodeData>[],
  edges: Edge[],
): Node<NodeData>[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 60 });

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((node) => {
    const { x, y } = g.node(node.id);
    return { ...node, position: { x: x - NODE_W / 2, y: y - NODE_H / 2 } };
  });
}

function StepNode({ data }: { data: NodeData }) {
  const totalTokens = data.tokensIn + data.tokensOut;

  const borderColor = data.hasError
    ? "border-red-500/60"
    : totalTokens > 50_000
      ? "border-amber-500/60"
      : data.isLoopSuspect
        ? "border-violet-500/50"
        : data.latencyMs > 10_000
          ? "border-orange-500/50"
          : "border-zinc-800";

  return (
    <div
      className={`w-[210px] bg-zinc-900 border rounded-lg overflow-hidden shadow-lg ${borderColor}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: "#52525b",
          border: "1px solid #71717a",
          width: 8,
          height: 8,
        }}
      />

      <div className="px-3 py-2 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-white text-[12px] font-mono font-medium">
          Step {data.stepIndex}
        </span>
        <div className="flex items-center gap-1.5">
          {data.hasError && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
              error
            </span>
          )}
          {!data.hasError && data.isLoopSuspect && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
              loop?
            </span>
          )}
          {!data.hasError && totalTokens > 50_000 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              spike
            </span>
          )}
        </div>
      </div>

      <div className="px-3 py-2.5 space-y-2">
        <p className="text-[10px] text-zinc-600 truncate m-0">{data.model}</p>
        <div className="grid grid-cols-2 gap-x-2">
          <div>
            <p className="text-[10px] text-zinc-600 m-0">Tokens</p>
            <p className="text-[11px] text-zinc-300 font-mono m-0">
              {totalTokens.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-600 m-0">Latency</p>
            <p className="text-[11px] text-zinc-300 font-mono m-0">
              {(data.latencyMs / 1_000).toFixed(2)}s
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-emerald-400 font-mono m-0">
            ${data.costUsd.toFixed(4)}
          </p>
          {data.tokenDelta !== 0 && (
            <p
              className={`text-[10px] font-mono m-0 ${
                data.tokenDelta > 5_000
                  ? "text-red-400"
                  : data.tokenDelta > 500
                    ? "text-amber-400"
                    : "text-zinc-600"
              }`}
            >
              {data.tokenDelta > 0 ? "+" : ""}
              {data.tokenDelta.toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: "#52525b",
          border: "1px solid #71717a",
          width: 8,
          height: 8,
        }}
      />
    </div>
  );
}

const NODE_TYPES = { stepNode: StepNode };

function GraphInner({ steps }: { steps: StepData[] }) {
  const { nodes, edges } = useMemo(() => {
    const { nodes: raw, edges: rawEdges } = buildGraph(steps);
    return { nodes: applyDagreLayout(raw, rawEdges), edges: rawEdges };
  }, [steps]);

  const totalCost = steps.reduce((s, c) => s + c.costUsd, 0);
  const totalTokens = steps.reduce((s, c) => s + c.tokensIn + c.tokensOut, 0);
  const loopSuspects = steps.filter((_, i) => {
    if (i === 0) return false;
    const sorted = [...steps].sort((a, b) => a.stepIndex - b.stepIndex);
    return sorted[i].tokensIn - sorted[i - 1].tokensIn < 200;
  }).length;
  const errorCount = steps.filter((s) => s.hasError).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Steps", value: String(steps.length), highlight: false },
          {
            label: "Total Tokens",
            value: totalTokens.toLocaleString(),
            highlight: false,
          },
          {
            label: "Total Cost",
            value: `$${totalCost.toFixed(4)}`,
            highlight: false,
          },
          {
            label: "Loop Suspects",
            value: String(loopSuspects),
            highlight: loopSuspects > 0,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3"
          >
            <p className="text-zinc-500 text-[11px] uppercase tracking-wide m-0">
              {stat.label}
            </p>
            <p
              className={`text-lg font-mono font-medium m-0 mt-0.5 ${stat.highlight ? "text-violet-400" : "text-white"}`}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div
        className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden"
        style={{ height: 560 }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            color="#27272a"
            gap={20}
            size={1}
          />
          <Controls
            style={{
              background: "#18181b",
              border: "1px solid #27272a",
              borderRadius: 6,
            }}
          />
          <MiniMap
            nodeColor={(n) => {
              const d = n.data as NodeData;
              if (d.hasError) return "#ef4444";
              if (d.isLoopSuspect) return "#8b5cf6";
              if (d.tokensIn > 50_000) return "#f59e0b";
              return "#52525b";
            }}
            maskColor="rgba(0,0,0,0.65)"
            style={{
              background: "#18181b",
              border: "1px solid #27272a",
              borderRadius: 6,
            }}
          />
        </ReactFlow>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1">
        {[
          { color: "bg-zinc-600", label: "Normal growth" },
          { color: "bg-amber-500", label: "Moderate spike (500–5k)" },
          { color: "bg-red-500", label: "Context explosion (>5k)" },
          { color: "bg-violet-500", label: "Loop suspect" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span
              className={`w-2.5 h-2.5 rounded-full flex-none ${item.color}`}
            />
            <span className="text-[11px] text-zinc-500">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentLoopGraph({ steps }: { steps: StepData[] }) {
  if (steps.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-zinc-900 border border-zinc-800 rounded-lg">
        <p className="text-zinc-500 text-sm">
          No steps found for this session.
        </p>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <GraphInner steps={steps} />
    </ReactFlowProvider>
  );
}
