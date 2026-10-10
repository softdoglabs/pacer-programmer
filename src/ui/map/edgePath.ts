import { Position } from "@xyflow/react";

/*
 * The geometry of a map edge, kept apart from the component so it can be tested.
 *
 * Two presets that lead to each other produce a line each way. They used to share both ends —
 * each node has one handle per side, and both halves of a pair leave and arrive through it — so
 * however far apart the middles were bowed, the two curves ran together for the last stretch into
 * each node, and each arrowhead sat on top of the other edge's tail. At the zoom the map usually
 * shows, the pair read as a single line with one head. So the halves of a pair meet each node at
 * their own points, spread along the side they arrive on, each on its own side of the bow.
 */

/**
 * How far each half of a pair moves its ends along the node's side, in flow units. Far enough that
 * the two lines and heads read as two at the map's usual zoom, near enough that the lower head stays
 * clear of the pencil badge on the node's bottom-right corner.
 */
export const END_SPREAD = 8;

export interface EdgeEnds {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  /** Sideways push, in flow units. Opposite signs separate a pair; 0 leaves the plain curve. */
  offset: number;
}

export interface EdgeGeometry {
  path: string;
  /** Where the curve actually starts and ends, after a pair's ends are spread apart. */
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

export function edgeGeometry({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  offset,
}: EdgeEnds): EdgeGeometry {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
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
   *
   * "Across" has to mean the same direction for both halves of a pair, or the opposite offsets
   * they're given cancel out and they land on top of each other again. Deriving it from the
   * endpoints in a fixed order makes it a property of the pair rather than of the direction.
   */
  const reversed = sourceX > targetX || (sourceX === targetX && sourceY > targetY);
  const side = reversed ? -1 : 1;
  const across = { x: (-dy / span) * side, y: (dx / span) * side };
  const midX = sourceX + dx / 2 + across.x * offset;
  const midY = sourceY + dy / 2 + across.y * offset;
  const along = { x: dx / span, y: dy / span };
  const glide = Math.min(span * 0.25, 90);

  /*
   * A pair's ends, spread along the side each one meets, towards the side its curve bows to. Moved
   * along the side rather than across it, so each end still sits on the node's edge and the head
   * still points straight in.
   */
  const spread = Math.sign(offset) * Math.min(Math.abs(offset), END_SPREAD);
  const spreadAlong = (position: Position) => {
    const n = normal(position);
    const axis = { x: Math.abs(n.y), y: Math.abs(n.x) };
    const towards = Math.sign(across.x * axis.x + across.y * axis.y) || 1;
    return { x: axis.x * towards * spread, y: axis.y * towards * spread };
  };
  const startShift = spreadAlong(sourcePosition);
  const endShift = spreadAlong(targetPosition);
  const start = { x: sourceX + startShift.x, y: sourceY + startShift.y };
  const end = { x: targetX + endShift.x, y: targetY + endShift.y };

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
