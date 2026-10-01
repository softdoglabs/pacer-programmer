import { useCallback, useMemo, useState } from "react";
import { Background, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { FlowEdge, type FlowEdgeData } from "./FlowEdge";
import { RouteDialog, type RouteIntent } from "./RouteDialog";
import { StateDetails } from "./StateDetails";
import { StateNode, type StateNodeData } from "./StateNode";
import { MAP_ARROW, MapDefs } from "./MapDefs";
import "@xyflow/react/dist/style.css";
import { recoverMachine } from "@/pacer/analysis";
import { presetIndexToLabel } from "@/pacer/protocol/constants";
import { switchSpecForControl } from "@/pacer/hardware";
import { controlLabel } from "@/pacer/simulator";
import { usePacerStore } from "../../store/pacerStore";
import { layoutStates } from "./layout";

/*
 * The configuration as the machine its author meant, rather than 24 slots. Presets that behave
 * alike are one node however many copies the hardware needed, and a transition that leads each
 * copy back where it came from is drawn as a return — the thing the Pacer can't do, and the
 * reason the copies exist at all.
 *
 * It's also how you navigate: a node is a place, and choosing one loads it in the simulator.
 */

const EDGE_TYPES = { flow: FlowEdge };
const NODE_TYPES = { state: StateNode };

/**
 * What a state's presets are called. One preset is its slot, which is how you find it on the
 * hardware; several is a count, because a state of twelve copies is twelve slots the app chose and
 * the design has no opinion about — the list stays in the node's tooltip.
 */
function collapsedLabel(members: number[]): string {
  if (members.length === 0) return "";
  return members.length === 1 ? presetIndexToLabel(members[0]!) : `${members.length} presets · one state`;
}

/**
 * The marking printed on the hardware: "C", "1", "3". The rear-jack switches keep their number and
 * lose the "FS" — an edge badge has room for a character, and a number on its own reads as a switch.
 */
const marking = (controlId: number) =>
  (switchSpecForControl(controlId)?.name ?? controlLabel(controlId)).replace(/^FS/, "");

/** How far apart to bow the two halves of a reciprocal pair, in flow units. */
const SEPARATION = 26;

type Showing = "designed" | "all";

export function PresetMap() {
  const [showing, setShowing] = useState<Showing>("designed");
  const [intent, setIntent] = useState<RouteIntent | null>(null);
  // The state whose presets are being looked at, below the map.
  const [inspecting, setInspecting] = useState<string | null>(null);
  const config = usePacerStore((s) => s.board.config);
  const activeIndex = usePacerStore((s) => s.board.activePresetIndex);
  const jumpToPreset = usePacerStore((s) => s.jumpToPreset);
  const setUiMode = usePacerStore((s) => s.setUiMode);

  /*
   * Opening a route loads the preset it leaves from, so the faceplate beside you is the one the
   * route is on — and pressing its switches runs what you're about to change.
   */
  const openRoute = useCallback(
    (intent: RouteIntent, members: number[]) => {
      const load = members.includes(activeIndex) ? activeIndex : members[0];
      if (load !== undefined) jumpToPreset(load);
      setIntent(intent);
      // The panel below follows the route, so it's the state you're editing that's spelled out.
      setInspecting(intent.fromStateId);
    },
    [jumpToPreset, activeIndex],
  );

  /** Open a preset for programming: the map is where you find it, Program is where you change it. */
  const programPreset = useCallback(
    (presetIndex: number) => {
      jumpToPreset(presetIndex);
      setUiMode("program");
    },
    [jumpToPreset, setUiMode],
  );

  const { nodes, edges, notes } = useMemo(() => {
    const machine = recoverMachine(config);
    // Drawn, not merely present: hiding the plain stepping is what leaves a design's own shape, so
    // the layout reads the same routes the map does. Counting stepping makes every preset entered
    // from its neighbour, which has no beginning to rank from.
    const drawnRoute = (t: (typeof machine.states)[number]["transitions"][number]) =>
      t.to.kind === "state" && (showing === "all" || !t.viaStepping);
    const positions = new Map(
      layoutStates(
        machine.states.map((s) => ({
          id: s.id,
          leadsTo: s.transitions.flatMap((t) => (drawnRoute(t) && t.to.kind === "state" ? [t.to.id] : [])),
        })),
      ).map((p) => [p.id, p]),
    );

    // A return has no single destination to draw, so it's named on the node it leaves from.
    const returnsVia = (state: (typeof machine.states)[number]) => {
      const via = state.transitions.filter((t) => t.to.kind === "return").map((t) => marking(t.controlId));
      return via.length > 0 ? via.join(", ") : undefined;
    };

    const nodes: Node[] = machine.states.map((state) => {
      const members = machine.members[state.id] ?? [];
      const via = returnsVia(state);
      // Whichever copy you're on, or the first: the copies behave alike, so any of them is the
      // state — it's only the way back that tells them apart.
      const open = members.includes(activeIndex) ? activeIndex : members[0];
      return {
        id: state.id,
        type: "state",
        position: positions.get(state.id) ?? { x: 0, y: 0 },
        data: {
          name: state.name?.trim() || state.id,
          presets: collapsedLabel(members),
          // The count on the node, the slots behind it here: a bare list reads as a riddle.
          presetsTitle:
            members.length > 1
              ? `${members.length} presets, one state: ${members.map(presetIndexToLabel).join(", ")}`
              : undefined,
          ...(via !== undefined ? { returnsVia: via } : {}),
          // The preset the simulator is on, wherever among the copies it happens to be.
          here: members.includes(activeIndex),
          ...(open !== undefined ? { onEdit: () => programPreset(open) } : {}),
        } satisfies StateNodeData,
      };
    });

    const drawn = machine.states.flatMap((state) =>
      state.transitions.flatMap((t, i) =>
        drawnRoute(t) && t.to.kind === "state"
          ? [{ id: `${state.id}-${i}`, source: state.id, target: t.to.id, t }]
          : [],
      ),
    );
    // A pair that leads both ways sits on one line, so each half is bowed the other way.
    const pairs = new Set(drawn.map((e) => `${e.source}>${e.target}`));
    const edges: Edge[] = drawn.map((e) => {
      const reciprocal = pairs.has(`${e.target}>${e.source}`);
      const faded = e.t.viaStepping === true;
      /*
       * Which side of each node the route meets. The layout decides the direction it reads in,
       * so an edge that travels back along it leaves the near side and arrives at the far one,
       * rather than going out the front and round the houses.
       */
      const from = positions.get(e.source);
      const to = positions.get(e.target);
      const down = from?.facing === "down";
      const forward = down ? (to?.y ?? 0) >= (from?.y ?? 0) : (to?.x ?? 0) >= (from?.x ?? 0);
      const [out, into] = down
        ? forward
          ? (["b", "t"] as const)
          : (["t", "b"] as const)
        : forward
          ? (["r", "l"] as const)
          : (["l", "r"] as const);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: `s-${out}`,
        targetHandle: `t-${into}`,
        type: "flow",
        data: {
          // "C", "1", "FS1" — the marking on the hardware, not a sentence about it.
          label: marking(e.t.controlId),
          faded,
          controlId: e.t.controlId,
          stepNumber: e.t.stepNumber,
          offset: reciprocal ? (e.source < e.target ? SEPARATION : -SEPARATION) : 0,
        } satisfies FlowEdgeData,
        // Stated outright rather than left to the library's default, which is a dark grey that
        // all but disappears on this background. Stepping stays quieter, but still readable.
        style: faded ? { strokeWidth: 1.25, stroke: "#8b8b96" } : { strokeWidth: 2, stroke: "#d8d8de" },
        // Which way the press takes you, in our own slender head (see MapDefs).
        // The id, not a url: React Flow wraps it in url(#...) itself.
        markerEnd: MAP_ARROW,
      };
    });

    return { nodes, edges, notes: machine.notes };
  }, [config, activeIndex, showing, programPreset]);

  return (
    <section aria-label="Preset map" className="flex min-h-0 flex-1 flex-col gap-2">
      <MapDefs />
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup<Showing>
          label="Show"
          labelVisible
          options={[
            {
              id: "designed",
              label: "Designed routes",
              title: "Hide the plain next/previous stepping every factory preset carries",
            },
            { id: "all", label: "Everything", title: "Include the next/previous stepping on every preset" },
          ]}
          value={showing}
          onChange={setShowing}
        />
        <span className="text-xs text-muted-foreground">
          {showing === "designed"
            ? edges.length === 0
              ? // True of the factory set: its only routes are C and D stepping through the banks.
                "Nothing here goes anywhere on purpose — every switch that changes preset just steps to a neighbour."
              : "Switches that only step to the neighbouring preset are left out."
            : "Stepping to a neighbour is drawn faintly."}
        </span>
      </div>
      {notes.length > 0 && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          {notes.length} thing{notes.length === 1 ? "" : "s"} on this device the machine can't express, so they're drawn
          as they are: {notes[0]!.message}
        </p>
      )}
      <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs">
        Drag from one state to another to add a route, or click a route to change it. A route belongs to the state, so
        it's written to every preset that state is — which is the part that can't be done a preset at a time. The pencil
        opens a state for programming; clicking it loads its preset in the simulator.
      </p>
      {/* A definite height: React Flow is height:100%, which resolves to nothing against min-height. */}
      <div className="h-[70vh] min-h-96 overflow-hidden rounded-lg border bg-card">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          fitView
          // Selecting a node otherwise lifts it over the edge labels, so the map rearranges
          // itself in depth as soon as you click anything.
          elevateNodesOnSelect={false}
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          onConnect={(connection) => {
            if (connection.source === connection.target) return;
            const members = recoverMachine(config).members[connection.source] ?? [];
            openRoute({ kind: "add", fromStateId: connection.source, toStateId: connection.target }, members);
          }}
          onEdgeClick={(_, edge) => {
            const data = edge.data as FlowEdgeData | undefined;
            if (data?.controlId === undefined || data.stepNumber === undefined) return;
            openRoute(
              { kind: "existing", fromStateId: edge.source, controlId: data.controlId, stepNumber: data.stepNumber },
              recoverMachine(config).members[edge.source] ?? [],
            );
          }}
          onNodeClick={(_, node) => {
            const members = recoverMachine(config).members[node.id] ?? [];
            if (members[0] !== undefined) jumpToPreset(members[0]);
            // And show what it's made of: one node can be several presets, which is the thing a
            // map of states hides by design.
            setInspecting(node.id);
          }}
          // The shortcut for the pencil, for anyone who tries it.
          onNodeDoubleClick={(_, node) => {
            const members = recoverMachine(config).members[node.id] ?? [];
            const open = members.includes(activeIndex) ? activeIndex : members[0];
            if (open !== undefined) programPreset(open);
          }}
        >
          <Background />
        </ReactFlow>
      </div>
      {inspecting !== null && <StateDetails stateId={inspecting} onClose={() => setInspecting(null)} />}
      <RouteDialog intent={intent} onClose={() => setIntent(null)} />
    </section>
  );
}
