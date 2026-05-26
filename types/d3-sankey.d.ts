// types/d3-sankey.d.ts

declare module "d3-sankey" {
  export interface SankeyNode {
    name: string;
    /** Populated by layout */
    x0?: number;
    x1?: number;
    y0?: number;
    y1?: number;
    value?: number;
    depth?: number;
    index?: number;
    /** Extra properties we attach */
    [key: string]: unknown;
  }

  export interface SankeyLink {
    source: number | SankeyNode;
    target: number | SankeyNode;
    value: number;
    /** Populated by layout */
    y0?: number;
    y1?: number;
    width?: number;
    index?: number;
  }

  export interface SankeyGraph<N extends SankeyNode, L extends SankeyLink> {
    nodes: N[];
    links: L[];
  }

  export interface SankeyLayout<N extends SankeyNode, L extends SankeyLink> {
    nodeWidth(): number;
    nodeWidth(width: number): this;
    nodePadding(): number;
    nodePadding(padding: number): this;
    extent(): [[number, number], [number, number]];
    extent(extent: [[number, number], [number, number]]): this;
    iterations(): number;
    iterations(iterations: number): this;
    (graph: SankeyGraph<N, L>): SankeyGraph<N, L>;
  }

  export function sankey<
    N extends SankeyNode = SankeyNode,
    L extends SankeyLink = SankeyLink,
  >(): SankeyLayout<N, L>;

  export function sankeyLinkHorizontal(): (link: SankeyLink) => string | null;

  export function sankeyLeft(node: SankeyNode, n: number): number;
  export function sankeyRight(node: SankeyNode, n: number): number;
  export function sankeyCenter(node: SankeyNode, n: number): number;
  export function sankeyJustify(node: SankeyNode, n: number): number;
}