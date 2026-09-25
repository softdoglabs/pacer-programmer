/*
 * Where the states sit. A layout engine would be another dependency; this is enough for two dozen
 * nodes, and it picks its arrangement from the shape of the graph:
 *
 * - A design with a beginning — states nothing else leads to — is drawn in layers, left to right,
 *   which is what an authored machine looks like: mains on the left, the states they enter next.
 * - A graph with no beginning is a ring, which is exactly what the factory set is: every preset
 *   steps to its neighbours, so every state is entered and no layering means anything. Those are
 *   laid out as a grid shaped like the hardware's banks, six to a column.
 *
 * Cycles are ordinary either way — a looper returns to where it came from — so a node keeps the
 * first, shallowest column it is given.
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

const COLUMN = 260;
const ROW = 96;
const BANK = 6;

export function layoutStates(nodes: LayoutInput[]): LayoutNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const entries = nodes.filter((n) => n.isEntry);

  if (entries.length === 0) {
    // No beginning: a ring. Shaped like the banks rather than strung out in one line.
    return nodes.map((node, i) => ({
      id: node.id,
      x: Math.floor(i / BANK) * COLUMN,
      y: (i % BANK) * ROW,
    }));
  }

  const depth = new Map<string, number>();
  const walk = (from: string) => {
    const queue: { id: string; d: number }[] = [{ id: from, d: 0 }];
    while (queue.length > 0) {
      const { id, d } = queue.shift()!;
      if (depth.has(id)) continue; // already placed, and no deeper than this
      depth.set(id, d);
      for (const next of byId.get(id)?.leadsTo ?? []) {
        if (ids.has(next) && !depth.has(next)) queue.push({ id: next, d: d + 1 });
      }
    }
  };
  for (const entry of entries) walk(entry.id);
  // Anything the entries can't reach is its own little machine; give it a start of its own rather
  // than piling it all into the first column.
  for (const node of nodes) if (!depth.has(node.id)) walk(node.id);

  // Stack each column in the order the analysis found the states, so nothing jumps about between
  // renders, and wrap a column that grows taller than a bank.
  const nextRow = new Map<number, number>();
  return nodes.map((node) => {
    const layer = depth.get(node.id)!;
    const taken = nextRow.get(layer) ?? 0;
    nextRow.set(layer, taken + 1);
    return { id: node.id, x: (layer + Math.floor(taken / BANK)) * COLUMN, y: (taken % BANK) * ROW };
  });
}
