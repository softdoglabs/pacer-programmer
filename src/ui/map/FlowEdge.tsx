import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";

/*
 * An edge that can be pushed aside.
 *
 * Two presets that step to each other produce a line each way, and between neighbours those lines
 * are the same vertical: whichever draws second hides the other completely, and its label lands on
 * top, so the map appeared to have only half its edges. Each of a reciprocal pair is bowed the
 * opposite way instead, and each label rides its own curve.
 */

export interface FlowEdgeData extends Record<string, unknown> {
  /** Sideways push, in flow units. Opposite signs separate a pair; 0 leaves a straight line. */
  offset?: number;
  label?: string;
  faded?: boolean;
}

export function FlowEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  data,
}: EdgeProps & { data?: FlowEdgeData }) {
  const offset = data?.offset ?? 0;
  // A quadratic through a displaced midpoint: the control point is twice the displacement,
  // because a quadratic passes half way to it.
  const cx = (sourceX + targetX) / 2 + offset * 2;
  const cy = (sourceY + targetY) / 2;
  const path = `M ${sourceX},${sourceY} Q ${cx},${cy} ${targetX},${targetY}`;
  // Where the curve actually is at its middle, so the label sits on its own line.
  const labelX = (sourceX + targetX) / 4 + cx / 2;
  const labelY = (sourceY + targetY) / 4 + cy / 2;

  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            className={
              data.faded
                ? "pointer-events-none absolute rounded bg-background/70 px-1 text-[10px] text-muted-foreground"
                : "pointer-events-none absolute rounded bg-background/90 px-1 text-[11px] text-foreground"
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
