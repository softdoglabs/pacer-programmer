import { Position } from "@xyflow/react";

/*
 * The geometry of a map edge, kept apart from the component so it can be tested.
 *
 * Each node has one handle per side, so every edge that leaves or arrives on that side used to
 * meet it at the same point. Several routes into one state (a looper entered from two presets)
 * or a pair leading both ways ran together for the last stretch into the node, and their
 * arrowheads stacked on each other or on another edge's tail: at the map's usual zoom, two
 * routes read as one line with one head. So where several edges share a side, each meets it at
 * its own point (`spreadEnds`), and the curve starts and ends there (`edgeGeometry`).
 */

/** Gap between neighbouring ends on one side of a node, in flow units. */
export const END_SPACING = 14;
/**
 * How much of a side the ends may spread over, so they stay on the node: its left and right sides
 * are short (and the pencil badge sits on the bottom-right corner), its top and bottom long.
 */
const MAX_SPREAD = { across: 28, along: 120 };

export type Side = "l" | "r" | "t" | "b";

export interface EdgeEnds {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  /** Sideways push of the middle, in flow units. Opposite signs separate a pair; 0 leaves the plain curve. */
  offset: number;
  /** Where along its side the edge leaves and arrives, from `spreadEnds`: +down for left/right, +right for top/bottom. */
  sourceShift?: number;
  targetShift?: number;
}

export interface EdgeGeometry {
  path: string;
  /** Where the curve actually starts and ends, after its ends are spread along their sides. */
  start: { x: number; y: number };
  end: { x: number; y: number };
  label: { x: number; y: number };
}

/** Which way a handle faces, as a unit vector pointing away from the node. */
export function normal(position: Position): { x: number; y: number } {
  switch (position) {
    case Position.Top:
      return { x: 0, y: -1 };
    case Position.Bottom:
      return { x: 0, y: 1 };
    case Position.Left:
      return { x: -1, y: 0 };
    default:
      return { x: 1, y: 0 };
  }
}

/** The direction along a side: down for the left and right sides, right for the top and bottom. */
export function sideAxis(side: Side): { x: number; y: number } {
  return side === "l" || side === "r" ? { x: 0, y: 1 } : { x: 1, y: 0 };
}

const positionAxis = (position: Position) =>
  position === Position.Left || position === Position.Right ? { x: 0, y: 1 } : { x: 1, y: 0 };

/**
 * Which way an edge's middle is pushed, as a unit vector — the same rule `edgeGeometry` bows by, so
 * callers can put a pair's ends on the side its curve goes. "Across" is worked out from the two
 * ends in a fixed order, so both halves of a pair agree on it and their opposite offsets separate.
 */
export function bowDirection(from: { x: number; y: number }, to: { x: number; y: number }, offset: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = Math.hypot(dx, dy) || 1;
  const reversed = from.x > to.x || (from.x === to.x && from.y > to.y);
  const side = reversed ? -1 : 1;
  const sign = Math.sign(offset);
  return { x: (-dy / span) * side * sign, y: (dx / span) * side * sign };
}

/**
 * How far to bow each edge, so edges between the same two states don't sit on one line: a pair
 * leading both ways, or two switches leading the same way. Each group is spread symmetrically about
 * the straight line, `step` apart; an edge alone between its states stays straight. The offsets are
 * in the pair's frame (see `bowDirection`), so they mean the same whichever way each edge runs.
 */
export function bowOffsets(
  edges: readonly { id: string; source: string; target: string }[],
  step: number,
): Map<string, number> {
  const between = (e: { source: string; target: string }) => [e.source, e.target].sort().join(">");
  const groups = new Map<string, string[]>();
  for (const e of edges) groups.set(between(e), [...(groups.get(between(e)) ?? []), e.id]);
  const offsets = new Map<string, number>();
  for (const group of groups.values()) {
    group.forEach((id, i) => offsets.set(id, (i - (group.length - 1) / 2) * step));
  }
  return offsets;
}

export interface EndRequest {
  /** Names this end, to look its shift up by. */
  key: string;
  node: string;
  side: Side;
  /** Where the edge's other end is, along this side's axis: ends are ordered by it, so they don't cross. */
  toward: number;
  /** Breaks ties in `toward` (two ends going to the same node): lower first. */
  tie: number;
}

/**
 * Spaces out the ends that share a side of a node, centred on the handle, in the order of where
 * their edges go. A lone end stays on the handle.
 */
export function spreadEnds(ends: readonly EndRequest[]): Map<string, number> {
  const groups = new Map<string, EndRequest[]>();
  for (const end of ends) {
    const key = `${end.node}:${end.side}`;
    groups.set(key, [...(groups.get(key) ?? []), end]);
  }
  const shifts = new Map<string, number>();
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.toward - b.toward || a.tie - b.tie || a.key.localeCompare(b.key));
    const limit = sorted[0]!.side === "l" || sorted[0]!.side === "r" ? MAX_SPREAD.across : MAX_SPREAD.along;
    const gap = sorted.length > 1 ? Math.min(END_SPACING, limit / (sorted.length - 1)) : 0;
    sorted.forEach((end, i) => shifts.set(end.key, (i - (sorted.length - 1) / 2) * gap));
  }
  return shifts;
}

export function edgeGeometry({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  offset,
  sourceShift = 0,
  targetShift = 0,
}: EdgeEnds): EdgeGeometry {
  // Ends moved along their sides rather than off them, so each still sits on the node's edge and
  // its head still points straight in.
  const sAxis = positionAxis(sourcePosition);
  const tAxis = positionAxis(targetPosition);
  const start = { x: sourceX + sAxis.x * sourceShift, y: sourceY + sAxis.y * sourceShift };
  const end = { x: targetX + tAxis.x * targetShift, y: targetY + tAxis.y * targetShift };

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const span = Math.hypot(dx, dy) || 1;
  // How far the curve runs straight out of a handle before turning: enough to clear the node,
  // capped so a long edge doesn't balloon.
  const reach = Math.min(Math.max(span * 0.3, 26), 90);

  /*
   * Two curves meeting at a displaced middle, rather than one curve aimed at it. Displacing a
   * single curve's control points tilts both ends — with a 26-unit bow only six of the factory
   * map's 48 edges still met a node square on, and a head arriving at a slant slides under the
   * node and disappears. Here the bow lives entirely in the middle: each end keeps its handle's
   * own normal, so every head arrives pointing into the side it touches.
   */
  const bow = bowDirection({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, offset);
  const midX = start.x + dx / 2 + bow.x * Math.abs(offset);
  const midY = start.y + dy / 2 + bow.y * Math.abs(offset);
  const along = { x: dx / span, y: dy / span };
  const glide = Math.min(span * 0.25, 90);

  const sourceNormal = normal(sourcePosition);
  const targetNormal = normal(targetPosition);
  const path = [
    `M ${start.x},${start.y}`,
    `C ${start.x + sourceNormal.x * reach},${start.y + sourceNormal.y * reach}`,
    `${midX - along.x * glide},${midY - along.y * glide}`,
    `${midX},${midY}`,
    `C ${midX + along.x * glide},${midY + along.y * glide}`,
    `${end.x + targetNormal.x * reach},${end.y + targetNormal.y * reach}`,
    `${end.x},${end.y}`,
  ].join(" ");

  // The join between the two curves is the middle of the line, so a label sits on its own path.
  return { path, start, end, label: { x: midX, y: midY } };
}
