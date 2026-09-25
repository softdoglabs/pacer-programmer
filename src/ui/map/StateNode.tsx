import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

/*
 * A state on the map, with somewhere for a route to meet it on every side.
 *
 * React Flow's stock node has one source handle and one target handle, so with the layout running
 * left to right a route that goes back — every return, and every pair of states that lead to each
 * other — has to leave the right-hand side and come all the way round to the left. It arrives at a
 * slant with its head half under the node, and the curve pokes out past both. Each side carries
 * both a source and a target here, stacked in the same spot, and the edge picks the pair facing
 * the way it travels (see `PresetMap`), so a back edge simply runs back.
 */

export interface StateNodeData extends Record<string, unknown> {
  name: string;
  /** The presets this state is, already worded: "A1" or "2 presets · A1 C1". */
  presets: string;
  /** Switch markings that come back to whatever entered the state, if any. */
  returnsVia?: string;
  /** The simulator is on one of its presets. */
  here?: boolean;
}

const SIDES = [
  { position: Position.Left, id: "l" },
  { position: Position.Right, id: "r" },
  { position: Position.Top, id: "t" },
  { position: Position.Bottom, id: "b" },
] as const;

export function StateNode({ data, isConnectable }: NodeProps & { data: StateNodeData }) {
  return (
    <div
      className={cn(
        "min-w-28 rounded-lg border-2 bg-card px-2 py-1 text-left",
        data.here ? "border-primary bg-primary/15" : "border-border",
      )}
    >
      {SIDES.map((side) => (
        <div key={side.id}>
          {/* Stacked, so a side is one dot however a route happens to use it. */}
          {/* Told outright, or a handle takes itself to be connectable and shows when nothing can
              be dragged. */}
          <Handle type="target" position={side.position} id={`t-${side.id}`} isConnectable={isConnectable} />
          <Handle type="source" position={side.position} id={`s-${side.id}`} isConnectable={isConnectable} />
        </div>
      ))}
      <div className="truncate text-sm font-semibold">{data.name}</div>
      <div className="truncate text-[11px] opacity-70">{data.presets}</div>
      {data.returnsVia && <div className="mt-0.5 truncate text-[11px] text-primary">↩ {data.returnsVia} returns</div>}
    </div>
  );
}
