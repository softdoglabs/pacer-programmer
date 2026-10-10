import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { edgeGeometry } from "./edgePath";

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
 * arrives pointing squarely into the side it touches. The two halves of a pair also meet each node
 * at their own points, or their heads would sit on each other's tails (see `edgePath`).
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
  const geometry = edgeGeometry({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    offset: data?.offset ?? 0,
  });
  const path = geometry.path;
  const labelX = geometry.label.x;
  const labelY = geometry.label.y;

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
