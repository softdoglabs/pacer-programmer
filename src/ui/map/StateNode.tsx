import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { EditBadge } from "../panel/EditBadge";

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
  /**
   * The presets this state is, already worded. A state of one is its slot, since that's how you
   * find it on the hardware; a state of several says so instead of listing slots, because which
   * slots the copies landed in is the hardware's problem rather than the design's (`presetsTitle`
   * has them).
   */
  presets: string;
  presetsTitle?: string;
  /**
   * Switches whose destination depends on the way in ("A returns"), each opening its route. They're
   * drawn as dashed edges too, but a switch that returns is one thing, and this is where it's named.
   */
  conditional?: { key: string; glyph: string; text: string; title: string; onPress: () => void }[];
  /** The simulator is on one of its presets. */
  here?: boolean;
  /** Open this state's preset for programming. */
  onEdit?: () => void;
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
        "relative min-w-28 rounded-lg border-2 bg-card px-2 py-1 text-left",
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
      <div className="truncate text-[11px] opacity-70" title={data.presetsTitle}>
        {data.presets}
      </div>
      {data.conditional?.map((c) => (
        <button
          key={c.key}
          type="button"
          // nodrag/nopan: React Flow would otherwise take the press as the start of a drag.
          className="nodrag nopan ring-focus block max-w-full truncate rounded text-left text-[11px] text-primary underline-offset-2 hover:underline"
          title={c.title}
          onClick={(event) => {
            event.stopPropagation();
            c.onPress();
          }}
        >
          {c.glyph} {c.text}
        </button>
      ))}
      {/* The same pencil the faceplate puts on anything programmable, so the habit carries over. */}
      {data.onEdit && <EditBadge size="small" label={`Program ${data.name}`} onPress={data.onEdit} />}
    </div>
  );
}
