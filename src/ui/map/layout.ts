import dagre from "@dagrejs/dagre";

/*
 * Where the states sit, chosen from the shape of the graph:
 *
 * - A design with a beginning — states nothing else leads to — is laid out by dagre, left to
 *   right. It ranks the states by how far they are from a beginning and orders each rank to cut
 *   down crossings, which is the part worth not writing by hand: a machine with a state entered
 *   from a dozen places has a dozen edges converging, and where those nodes sit decides whether
 *   the map can be read at all.
 * - A graph with no beginning is a ring, which is exactly what the factory set is: every preset
 *   steps to its neighbours, so no ranking means anything and dagre strings all 24 across the
 *   screen. Those are laid out as a grid shaped like the hardware's banks instead.
 *
 * Only the nodes are placed. Edges route themselves (see `FlowEdge`), and their labels ride their
 * own curve, so nothing here has to think about labels.
 */

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
}

export interface LayoutInput {
  id: string;
  /** Ids this node leads to. Targets that aren't nodes are ignored. */
  leadsTo: string[];
  /** Nothing leads here, so it's somewhere a design can begin. */
  isEntry: boolean;
}

/** Roughly what a state node measures; dagre needs a size to keep ranks apart. */
const NODE_WIDTH = 190;
const NODE_HEIGHT = 64;
const COLUMN = 260;
const ROW = 96;
const BANK = 6;

export function layoutStates(nodes: LayoutInput[]): LayoutNode[] {
  if (nodes.length === 0) return [];

  if (!nodes.some((n) => n.isEntry)) {
    // No beginning: a ring. Shaped like the banks rather than strung out in one line.
    return nodes.map((node, i) => ({
      id: node.id,
      x: Math.floor(i / BANK) * COLUMN,
      y: (i % BANK) * ROW,
    }));
  }

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "LR", ranksep: 110, nodesep: 36, marginx: 20, marginy: 20 });
  graph.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(nodes.map((n) => n.id));
  for (const node of nodes) graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const node of nodes) {
    for (const next of node.leadsTo) if (ids.has(next) && next !== node.id) graph.setEdge(node.id, next);
  }
  dagre.layout(graph);

  // dagre positions a node by its centre; React Flow places by the top-left corner.
  return nodes.map((node) => {
    const placed = graph.node(node.id) as { x: number; y: number } | undefined;
    return {
      id: node.id,
      x: (placed?.x ?? 0) - NODE_WIDTH / 2,
      y: (placed?.y ?? 0) - NODE_HEIGHT / 2,
    };
  });
}
