import { useCallback, useEffect, useMemo, useState } from "react";
import { Background, ReactFlow, useReactFlow, type Edge, type Node } from "@xyflow/react";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { FlowEdge, type FlowEdgeData } from "./FlowEdge";
import { RouteDialog, type RouteIntent } from "./RouteDialog";
import { StateDetails } from "./StateDetails";
import { StateNode, type StateNodeData } from "./StateNode";
import { MAP_ARROW, MapDefs } from "./MapDefs";
import { bowDirection, bowOffsets, sideAxis, spreadEnds, type EndRequest, type Side } from "./edgePath";
import "@xyflow/react/dist/style.css";
import { presetIndexToLabel } from "@/pacer/protocol/constants";
import { switchSpecForControl } from "@/pacer/hardware";
import { controlLabel } from "@/pacer/simulator";
import { entrantStates } from "@/pacer/authoring";
import { usePacerStore } from "../../store/pacerStore";
import { useMachine } from "../useMachine";
import { layoutStates } from "./layout";
import { LabelBoard, LabelBoardContext } from "./labelBoard";

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

/** ↩ as text: on its own the platform's font draws it as an emoji tile. */
const RETURN_GLYPH = "\u21A9\uFE0E";

/** How far apart to bow the two halves of a reciprocal pair, in flow units. */
const SEPARATION = 26;

type Showing = "designed" | "all";

/**
 * Fits the view to the map again whenever its layout changes. `fitView` on the flow only runs when
 * it mounts, so after an edit that moves states (a route added, a preset moved) or a switch to
 * Everything, the view stayed where it was and the moved states fell outside it. Keyed on where
 * the states sit, not on what they show, so clicking a state (which marks it current) doesn't
 * undo the reader's panning.
 */
function FitOnLayoutChange({ layout }: { layout: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    // A frame later, so states that have just appeared have been measured.
    const frame = requestAnimationFrame(() => void fitView({ duration: 200 }));
    return () => cancelAnimationFrame(frame);
  }, [layout, fitView]);
  return null;
}

export function PresetMap() {
  const [showing, setShowing] = useState<Showing>("designed");
  const [intent, setIntent] = useState<RouteIntent | null>(null);
  // The state whose presets are being looked at, below the map.
  const [inspecting, setInspecting] = useState<string | null>(null);
  // Where the edge badges go, settled across the map (see `labelBoard`).
  const [labels] = useState(() => new LabelBoard());
  const machine = useMachine();
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

  const { nodes, edges, notes, layoutSignature } = useMemo(() => {
    // The same object every other view of this configuration has (see `useMachine`).
    type Transition = (typeof machine.states)[number]["transitions"][number];
    const drawnRoute = (t: Transition) => t.to.kind === "state" && (showing === "all" || !t.viaStepping);
    /*
     * States are placed by the designed routes alone, in both views. Plain stepping makes every
     * preset entered from its neighbour, which has no beginning to rank from: unless the stepping
     * happened to close into a ring, dagre strung all 24 out in one row, wider than the map can
     * zoom out to show. Laid out without it, Everything only adds its faint edges to the same
     * picture, and switching views doesn't rearrange the map.
     */
    const positions = new Map(
      layoutStates(
        machine.states.map((s) => ({
          id: s.id,
          leadsTo: s.transitions.flatMap((t) => (t.to.kind === "state" && !t.viaStepping ? [t.to.id] : [])),
        })),
      ).map((p) => [p.id, p]),
    );

    const openExisting = (stateId: string, t: Transition) =>
      openRoute(
        { kind: "existing", fromStateId: stateId, controlId: t.controlId, stepNumber: t.stepNumber },
        machine.members[stateId] ?? [],
      );

    const nodes: Node[] = machine.states.map((state) => {
      const members = machine.members[state.id] ?? [];
      /*
       * A switch whose destination depends on the way in is named on the node as well as drawn:
       * the dashed edges show where it can go, the note says it's one switch doing that, and it's
       * where to click to change it — to stop returning, say, which frees the copies.
       */
      const conditional = state.transitions
        .filter((t) => t.to.kind !== "state")
        .map((t) => ({
          key: `${t.controlId}:${t.stepNumber}`,
          glyph: t.to.kind === "return" ? RETURN_GLYPH : "\u2442",
          text: `${marking(t.controlId)} ${t.to.kind === "return" ? "returns" : "by way in"}`,
          title: `${marking(t.controlId)} ${t.to.kind === "return" ? "goes back to wherever this state was entered from" : "leads somewhere different depending on the way in"}. Click to change it.`,
          onPress: () => openExisting(state.id, t),
        }));
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
          ...(conditional.length > 0 ? { conditional } : {}),
          // The preset the simulator is on, wherever among the copies it happens to be.
          here: members.includes(activeIndex),
          ...(open !== undefined ? { onEdit: () => programPreset(open) } : {}),
        } satisfies StateNodeData,
      };
    });

    /*
     * A return is drawn too, dashed, to each state it can lead back to: the note on the node was
     * easy to miss, and without the edges the map showed a looper with no way out. A switch that
     * depends on the way in draws each of its destinations the same way. Dashed because it's one
     * of several places the switch can go, not where it always goes.
     */
    const drawn = machine.states.flatMap((state) =>
      state.transitions.flatMap((t, i) => {
        if (t.to.kind === "state")
          return drawnRoute(t) ? [{ id: `${state.id}-${i}`, source: state.id, target: t.to.id, t, back: false }] : [];
        const targets =
          t.to.kind === "return"
            ? entrantStates(machine, state.id).map((id) => ({ id, back: true }))
            : t.to.routes.map((r) =>
                r.to.kind === "state" ? { id: r.to.id, back: false } : { id: r.from, back: true },
              );
        const seen = new Set<string>();
        return targets.flatMap((target) => {
          if (seen.has(target.id) || target.id === state.id) return [];
          seen.add(target.id);
          return [{ id: `${state.id}-${i}-${target.id}`, source: state.id, target: target.id, t, back: target.back }];
        });
      }),
    );
    /*
     * Edges between the same two states would sit on one line: a pair leading both ways, or two
     * switches leading the same way (A1's C wraps round to D6, so when D6 is a copy of the looper
     * A1 reaches it by A and by C). Each is bowed its own distance, symmetric about the straight
     * line. The bow's "across" is the pair's, not the edge's (see `bowDirection`), so these offsets
     * share one frame whichever way each edge runs.
     */
    const offsets = bowOffsets(drawn, 2 * SEPARATION);
    const routed = drawn.map((e) => {
      /*
       * Which side of each node the route meets: the sides that face each other. A state mostly
       * above or below the other uses top and bottom, one mostly beside it the left and right, so
       * an edge leaves the near side and arrives at the far one rather than going out the front
       * and round the houses. (Going by which way the layout reads instead looped every edge
       * between two states stacked in one column of the ranked part.)
       */
      const from = positions.get(e.source) ?? { x: 0, y: 0 };
      const to = positions.get(e.target) ?? { x: 0, y: 0 };
      const vertical = Math.abs(to.y - from.y) > Math.abs(to.x - from.x);
      const [out, into]: [Side, Side] = vertical
        ? to.y >= from.y
          ? ["b", "t"]
          : ["t", "b"]
        : to.x >= from.x
          ? ["r", "l"]
          : ["l", "r"];
      const offset = offsets.get(e.id) ?? 0;
      return { ...e, from, to, out, into, offset };
    });

    /*
     * Every edge meeting the same side of a node gets its own point on it, ordered by where the
     * edge goes so they fan out without crossing. Without this, the routes into a state entered
     * from several places, or the two halves of a pair, share one point: they run together into
     * the node and their arrowheads stack, so two routes read as one. A pair's two ends go to the
     * same node, so they're ordered by which side each one's curve bows to.
     */
    const ends = routed.flatMap((e): EndRequest[] => {
      const bow = bowDirection(e.from, e.to, e.offset);
      const at = (side: Side, other: { x: number; y: number }) => {
        const axis = sideAxis(side);
        return { toward: other.x * axis.x + other.y * axis.y, tie: bow.x * axis.x + bow.y * axis.y };
      };
      return [
        { key: `${e.id}:s`, node: e.source, side: e.out, ...at(e.out, e.to) },
        { key: `${e.id}:t`, node: e.target, side: e.into, ...at(e.into, e.from) },
      ];
    });
    const shifts = spreadEnds(ends);

    const edges: Edge[] = routed.map((e) => {
      const faded = e.t.viaStepping === true;
      const dashed = e.t.to.kind !== "state";
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: `s-${e.out}`,
        targetHandle: `t-${e.into}`,
        type: "flow",
        data: {
          // "C", "1", "FS1" — the marking on the hardware, not a sentence about it.
          label: `${marking(e.t.controlId)}${e.back ? RETURN_GLYPH : ""}`,
          faded,
          dashed,
          controlId: e.t.controlId,
          stepNumber: e.t.stepNumber,
          offset: e.offset,
          sourceShift: shifts.get(`${e.id}:s`) ?? 0,
          targetShift: shifts.get(`${e.id}:t`) ?? 0,
        } satisfies FlowEdgeData,
        // Stated outright rather than left to the library's default, which is a dark grey that
        // all but disappears on this background. Stepping stays quieter, but still readable.
        style: faded
          ? { strokeWidth: 1.25, stroke: "#8b8b96" }
          : { strokeWidth: 2, stroke: "#d8d8de", ...(dashed ? { strokeDasharray: "6 4" } : {}) },
        // Which way the press takes you, in our own slender head (see MapDefs).
        // The id, not a url: React Flow wraps it in url(#...) itself.
        markerEnd: MAP_ARROW,
      };
    });

    const layoutSignature = nodes.map((n) => `${n.id}@${n.position.x},${n.position.y}`).join("|");
    return { nodes, edges, notes: machine.notes, layoutSignature };
  }, [machine, activeIndex, showing, programPreset, openRoute]);

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
        <LabelBoardContext.Provider value={labels}>
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
              const members = machine.members[connection.source] ?? [];
              openRoute({ kind: "add", fromStateId: connection.source, toStateId: connection.target }, members);
            }}
            onEdgeClick={(_, edge) => {
              const data = edge.data as FlowEdgeData | undefined;
              if (data?.controlId === undefined || data.stepNumber === undefined) return;
              openRoute(
                { kind: "existing", fromStateId: edge.source, controlId: data.controlId, stepNumber: data.stepNumber },
                machine.members[edge.source] ?? [],
              );
            }}
            onNodeClick={(_, node) => {
              const members = machine.members[node.id] ?? [];
              if (members[0] !== undefined) jumpToPreset(members[0]);
              // And show what it's made of: one node can be several presets, which is the thing a
              // map of states hides by design.
              setInspecting(node.id);
            }}
            // The shortcut for the pencil, for anyone who tries it.
            onNodeDoubleClick={(_, node) => {
              const members = machine.members[node.id] ?? [];
              const open = members.includes(activeIndex) ? activeIndex : members[0];
              if (open !== undefined) programPreset(open);
            }}
          >
            <Background />
            <FitOnLayoutChange layout={layoutSignature} />
          </ReactFlow>
        </LabelBoardContext.Provider>
      </div>
      {inspecting !== null && <StateDetails stateId={inspecting} onClose={() => setInspecting(null)} />}
      <RouteDialog intent={intent} onClose={() => setIntent(null)} />
    </section>
  );
}
