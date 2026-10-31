export type NodeType = "entity" | "attribute" | "relationship";

export interface ERNodeConfig {
  id: string;
  type: NodeType;
  text: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rx?: number;
  primary?: boolean;
  vx?: number;
  vy?: number;
}

export interface SerializedNode {
  id: string;
  text: string;
  type: NodeType;
  vx?: number;
  vy?: number;
  width?: number;
  x: number;
  y: number;
  primary?: boolean;
}

export interface SerializedLink {
  source: string;
  target: string;
  cardinality?: string;
}

export interface StateSnapshot {
  nodes: SerializedNode[];
  links: SerializedLink[];
}

export interface Anchor {
  x: number;
  y: number;
}

export interface DiagramBBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}
