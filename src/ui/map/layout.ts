import dagre from "@dagrejs/dagre";

/*
 * Where the states sit, chosen from the shape of the routes being drawn.
 *
 * - States the routes connect are laid out by dagre, left to right. It ranks them by how far they
 *   are from a beginning and orders each rank to cut down crossings, which is the part worth not
 *   writing by hand: a state entered from a dozen places has a dozen edges converging, and where
 *   those nodes sit decides whether the map can be read at all.
 * - States no drawn route touches are parked in a grid shaped like the hardware's banks, below the
 *   part that has structure. On a real device most presets are like this — a design occupies a
 *   corner of the 24 — and threading them through the ranking only pushes the design off screen.
 * - A ring with no beginning is laid out entirely as banks. That's the whole factory set with the
 *   next/previous stepping shown: nothing is an entry, so ranking means nothing and dagre strings
 *   all 24 across the screen.
 *
 * Only the nodes are placed. Edges route themselves (see `FlowEdge`), and their labels ride their
 * own curve, so nothing here has to think about labels.
 */

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  /**
   * Which way its edges should leave and arrive: "right" for the ranked part, where routes run
   * left to right, "down" for a grid, whose neighbours sit above and below. An edge that leaves
   * the wrong side has to loop right around the node to get where it's going.
   */
  facing: "right" | "down";
}

export interface LayoutInput {
  id: string;
  /** Ids this node leads to, as the map is currently drawing them. Unknown targets are ignored. */
  leadsTo: string[];
}

/** Roughly what a state node measures; dagre needs a size to keep ranks apart. */
const NODE_WIDTH = 190;
const NODE_HEIGHT = 64;
const COLUMN = 260;
const ROW = 96;
const BANK = 6;
/** Clear air between the ranked design and the presets parked underneath it. */
const GAP = ROW;

/** Presets in banks of six, the way they're arranged on the hardware. */
function banks(nodes: LayoutInput[], top: number): LayoutNode[] {
  return nodes.map((node, i) => ({
    id: node.id,
    x: Math.floor(i / BANK) * COLUMN,
    y: top + (i % BANK) * ROW,
    facing: "down" as const,
  }));
}

export function layoutStates(nodes: LayoutInput[]): LayoutNode[] {
  if (nodes.length === 0) return [];

  const ids = new Set(nodes.map((n) => n.id));
  const leads = new Map(nodes.map((n) => [n.id, n.leadsTo.filter((to) => ids.has(to) && to !== n.id)]));
  const entered = new Set([...leads.values()].flat());
  const connected = nodes.filter((n) => leads.get(n.id)!.length > 0 || entered.has(n.id));

  /*
   * Nothing leads anywhere, or the routes take in every state and none of them is a beginning —
   * a ring, which has no direction to read it in. A cycle among *some* of the states is different:
   * dagre breaks it and ranks the rest, which is what a looper and its origin should look like.
   */
  const ring = connected.length === nodes.length && connected.every((n) => entered.has(n.id));
  if (connected.length === 0 || ring) return banks(nodes, 0);

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "LR", ranksep: 110, nodesep: 36, marginx: 20, marginy: 20 });
  graph.setDefaultEdgeLabel(() => ({}));
  for (const node of connected) graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const node of connected) for (const next of leads.get(node.id)!) graph.setEdge(node.id, next);
  dagre.layout(graph);

  // dagre positions a node by its centre; React Flow places by the top-left corner.
  const placed = connected.map((node) => {
    const at = graph.node(node.id) as { x: number; y: number } | undefined;
    return {
      id: node.id,
      x: (at?.x ?? 0) - NODE_WIDTH / 2,
      y: (at?.y ?? 0) - NODE_HEIGHT / 2,
      facing: "right" as const,
    };
  });

  const bottom = Math.max(...placed.map((p) => p.y + NODE_HEIGHT));
  const rest = nodes.filter((n) => !connected.includes(n));
  return [...placed, ...banks(rest, bottom + GAP)];
}
