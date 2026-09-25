import { useMemo, useState } from "react";
import { Background, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { FlowEdge, type FlowEdgeData } from "./FlowEdge";
import "@xyflow/react/dist/style.css";
import { recoverMachine } from "@/pacer/analysis";
import { presetIndexToLabel } from "@/pacer/protocol/constants";
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

/** How far apart to bow the two halves of a reciprocal pair, in flow units. */
const SEPARATION = 26;

type Showing = "designed" | "all";

export function PresetMap() {
  const [showing, setShowing] = useState<Showing>("designed");
  const config = usePacerStore((s) => s.board.config);
  const activeIndex = usePacerStore((s) => s.board.activePresetIndex);
  const jumpToPreset = usePacerStore((s) => s.jumpToPreset);

  const { nodes, edges, notes } = useMemo(() => {
    const machine = recoverMachine(config);
    const entered = new Set(
      machine.states.flatMap((s) => s.transitions.flatMap((t) => (t.to.kind === "state" ? [t.to.id] : []))),
    );
    const positions = new Map(
      layoutStates(
        machine.states.map((s) => ({
          id: s.id,
          leadsTo: s.transitions.flatMap((t) => (t.to.kind === "state" ? [t.to.id] : [])),
          isEntry: !entered.has(s.id),
        })),
      ).map((p) => [p.id, p]),
    );

    const nodes: Node[] = machine.states.map((state) => {
      const members = machine.members[state.id] ?? [];
      const here = members.includes(activeIndex);
      return {
        id: state.id,
        position: positions.get(state.id) ?? { x: 0, y: 0 },
        data: {
          label: (
            <div className="min-w-28 px-1 py-0.5 text-left">
              <div className="truncate text-sm font-semibold">{state.name?.trim() || state.id}</div>
              <div className="truncate text-[11px] opacity-70">
                {members.length > 1
                  ? `${members.length} presets · ${members.map(presetIndexToLabel).join(" ")}`
                  : presetIndexToLabel(members[0] ?? 0)}
              </div>
            </div>
          ),
        },
        // The preset the simulator is on, wherever among the copies it happens to be.
        className: here ? "!border-primary !bg-primary/15" : undefined,
        style: { borderRadius: 8, borderWidth: 2, padding: 4 },
      };
    });

    const drawn = machine.states.flatMap((state) =>
      state.transitions.flatMap((t, i) =>
        t.to.kind === "state" && (showing === "all" || !t.viaStepping)
          ? [{ id: `${state.id}-${i}`, source: state.id, target: t.to.id, t }]
          : [],
      ),
    );
    // A pair that leads both ways sits on one line, so each half is bowed the other way.
    const pairs = new Set(drawn.map((e) => `${e.source}>${e.target}`));
    const edges: Edge[] = drawn.map((e) => {
      const reciprocal = pairs.has(`${e.target}>${e.source}`);
      const faded = e.t.viaStepping === true;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "flow",
        data: {
          label: controlLabel(e.t.controlId),
          faded,
          offset: reciprocal ? (e.source < e.target ? SEPARATION : -SEPARATION) : 0,
        } satisfies FlowEdgeData,
        style: { strokeWidth: faded ? 1 : 1.75, opacity: faded ? 0.45 : 1 },
        // Which way the press takes you. Slender rather than stubby: at this density a fat head
        // reads as a blob on the node it points at.
        markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 16 },
      };
    });

    // A return has no single destination to draw, so it's shown on the node it leaves from.
    for (const state of machine.states) {
      if (!state.transitions.some((t) => t.to.kind === "return")) continue;
      const node = nodes.find((n) => n.id === state.id);
      const via = state.transitions.filter((t) => t.to.kind === "return").map((t) => controlLabel(t.controlId));
      if (node && typeof node.data.label !== "string") {
        node.data = {
          label: (
            <div className="min-w-28 px-1 py-0.5 text-left">
              {node.data.label as React.ReactNode}
              <div className="mt-0.5 truncate text-[11px] text-primary">↩ {via.join(", ")} returns</div>
            </div>
          ),
        };
      }
    }

    return { nodes, edges, notes: machine.notes };
  }, [config, activeIndex, showing]);

  return (
    <section aria-label="Preset map" className="flex min-h-0 flex-1 flex-col gap-2">
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
      {/* A definite height: React Flow is height:100%, which resolves to nothing against min-height. */}
      <div className="h-[70vh] min-h-96 overflow-hidden rounded-lg border bg-card">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          edgeTypes={EDGE_TYPES}
          fitView
          colorMode="dark"
          proOptions={{ hideAttribution: false }}
          nodesDraggable={false}
          onNodeClick={(_, node) => {
            const members = recoverMachine(config).members[node.id] ?? [];
            if (members[0] !== undefined) jumpToPreset(members[0]);
          }}
        >
          <Background />
        </ReactFlow>
      </div>
    </section>
  );
}
