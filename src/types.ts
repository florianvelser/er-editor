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
  // Attribute only: part of the partial key (discriminator) of a weak entity;
  // rendered with a dashed underline.
  partialKey?: boolean;
  // Entity only: weak entity (no own key); rendered as a double rectangle.
  weak?: boolean;
  // Relationship only: identifying relationship of a weak entity; rendered as a double diamond.
  identifying?: boolean;
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
  // Attribute only: part of the partial key (discriminator) of a weak entity;
  // rendered with a dashed underline.
  partialKey?: boolean;
  // Entity only: weak entity (no own key); rendered as a double rectangle.
  weak?: boolean;
  // Relationship only: identifying relationship of a weak entity; rendered as a double diamond.
  identifying?: boolean;
}

export interface SerializedLink {
  source: string;
  target: string;
  cardinality?: string;
  // True when every instance of the source entity must participate in this
  // relationship; rendered as a double line (total participation constraint).
  totalParticipation?: boolean;
  // True for one of the two links of a self-referencing (recursive) relationship.
  recursive?: boolean;
  // Which side of the entity the recursive link's loop bulges towards.
  recursiveSide?: 1 | -1;
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
