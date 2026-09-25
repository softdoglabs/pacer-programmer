import { BaseEdge, EdgeLabelRenderer, Position, type EdgeProps } from "@xyflow/react";

/*
 * An edge that can be pushed aside without losing its bearings.
 *
 * Two presets that step to each other produce a line each way, and between neighbours those lines
 * are the same vertical: whichever draws second hides the other outright and puts its label on
 * top, so the map appears to be missing half its edges. Each half is bowed the opposite way here.
 *
 * The bow is applied to the *control points*, not to where the curve starts and ends. A curve
 * aimed straight at a displaced midpoint meets the node at whatever angle that implies, often
 * nearly along the node's own edge — which slides the arrowhead under the node and hides it. This
 * leaves each handle along its normal, the way React Flow's own bezier does, so a head always
 * arrives pointing squarely into the side it touches.
 */

export interface FlowEdgeData extends Record<string, unknown> {
  /** Sideways push, in flow units. Opposite signs separate a pair; 0 leaves the plain curve. */
  offset?: number;
  label?: string;
  faded?: boolean;
  /** The switch and step that carry this route, so clicking it can open the route for editing. */
  controlId?: number;
  stepNumber?: number;
}

/** Which way a handle faces, as a unit vector pointing away from the node. */
function normal(position: Position): { x: number; y: number } {
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

export function FlowEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps & { data?: FlowEdgeData }) {
  const offset = data?.offset ?? 0;
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
   */
  /*
   * "Across" has to mean the same direction for both halves of a pair, or the opposite offsets
   * they're given cancel out and they land on top of each other again — which is what happened:
   * the heads separated correctly and the two labels still coincided. Deriving it from the
   * endpoints in a fixed order makes it a property of the pair rather than of the direction.
   */
  const reversed = sourceX > targetX || (sourceX === targetX && sourceY > targetY);
  const side = reversed ? -1 : 1;
  const across = { x: (-dy / span) * side, y: (dx / span) * side };
  const midX = sourceX + dx / 2 + across.x * offset;
  const midY = sourceY + dy / 2 + across.y * offset;
  const along = { x: dx / span, y: dy / span };
  const glide = Math.min(span * 0.25, 90);

  const sourceNormal = normal(sourcePosition);
  const targetNormal = normal(targetPosition);
  const path = [
    `M ${sourceX},${sourceY}`,
    `C ${sourceX + sourceNormal.x * reach},${sourceY + sourceNormal.y * reach}`,
    `${midX - along.x * glide},${midY - along.y * glide}`,
    `${midX},${midY}`,
    `C ${midX + along.x * glide},${midY + along.y * glide}`,
    `${targetX + targetNormal.x * reach},${targetY + targetNormal.y * reach}`,
    `${targetX},${targetY}`,
  ].join(" ");

  // The join between the two curves is the middle of the line, so a label sits on its own path.
  const labelX = midX;
  const labelY = midY;

  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            // The switch's own marking in a disc, the way it's printed on the hardware. A word
            // per edge ("Stomp C") is a sentence where a badge will do, and there are 48 of them.
            className={
              data.faded
                ? "pointer-events-none absolute grid size-5 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
                : "pointer-events-none absolute grid size-6 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground"
            }
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
