import { useMemo } from "react";
import { Background, ReactFlow, type Edge, type Node } from "@xyflow/react";
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

export function PresetMap() {
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

    const edges: Edge[] = machine.states.flatMap((state) =>
      state.transitions.flatMap((t, i) => {
        const target = t.to.kind === "state" ? t.to.id : undefined;
        if (!target) return []; // a return points at whatever entered it, so it has no fixed end
        return [
          {
            id: `${state.id}-${i}`,
            source: state.id,
            target,
            label: controlLabel(t.controlId),
            labelBgPadding: [4, 2] as [number, number],
            style: { strokeWidth: 1.5 },
          },
        ];
      }),
    );

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
  }, [config, activeIndex]);

  return (
    <section aria-label="Preset map" className="flex min-h-0 flex-1 flex-col gap-2">
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
