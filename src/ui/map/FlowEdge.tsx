import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { edgeGeometry } from "./edgePath";
import { LABEL_SPOTS, useLabelSpot } from "./labelBoard";

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
 * arrives pointing squarely into the side it touches. Edges that share a side of a node meet it at
 * their own points, or their heads would stack on each other (see `edgePath`).
 */

export interface FlowEdgeData extends Record<string, unknown> {
  /** Sideways push, in flow units. Opposite signs separate a pair; 0 leaves the plain curve. */
  offset?: number;
  /** Where along its side the edge leaves and arrives, when it shares the side (see `spreadEnds`). */
  sourceShift?: number;
  targetShift?: number;
  label?: string;
  faded?: boolean;
  /** One of several places its switch can lead, depending on the way in: a return, or a row of a table. */
  dashed?: boolean;
  /** The switch and step that carry this route, so clicking it can open the route for editing. */
  controlId?: number;
  stepNumber?: number;
}

export function FlowEdge({
  id,
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
  const ends = {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    offset: data?.offset ?? 0,
    sourceShift: data?.sourceShift ?? 0,
    targetShift: data?.targetShift ?? 0,
  };
  const geometry = edgeGeometry(ends);
  const path = geometry.path;
  // Where the badge goes is settled with every other edge's (see `labelBoard`).
  const spots = LABEL_SPOTS.map((labelAt) => edgeGeometry({ ...ends, labelAt }).label);
  const spot = useLabelSpot(id, spots, data?.faded ? 2 : data?.dashed ? 1 : 0);
  const labelX = spots[spot]?.x ?? geometry.label.x;
  const labelY = spots[spot]?.y ?? geometry.label.y;
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
                : data.dashed
                  ? // Room for the ↩ beside the marking, and an outline to match the dashed line.
                    "pointer-events-none absolute grid h-6 min-w-6 place-items-center rounded-full border-2 border-dashed border-primary bg-card px-1 text-[11px] font-bold text-primary"
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
