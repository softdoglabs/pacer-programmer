import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { recoverMachine } from "@/pacer/analysis";
import { editRoute, switchUses, type SwitchUse } from "@/pacer/authoring";
import { switchSpecForControl } from "@/pacer/hardware";
import { presetIndexToLabel } from "@/pacer/protocol/constants";
import { controlLabel } from "@/pacer/simulator";
import { usePacerStore } from "../../store/pacerStore";

/*
 * Where a switch leads, edited as the map shows it: from one state to another, however many
 * presets each of them turns out to be.
 *
 * The route is written to every copy of the state it leaves (see `pacer/authoring`), so this can't
 * be done by opening a preset and editing a step — the copies would drift apart, which is the hand
 * work this project exists to remove. Refusals come from there too, worded for what they cost, and
 * they're shown here rather than being written and discovered on the next load.
 */

export type RouteIntent =
  /** Dragged from one state to another: the switch is still to be chosen. */
  | { kind: "add"; fromStateId: string; toStateId: string }
  /** A route already on the map, picked by clicking it. */
  | { kind: "existing"; fromStateId: string; controlId: number; stepNumber: number };

const marking = (controlId: number) => switchSpecForControl(controlId)?.name ?? controlLabel(controlId);

const FIRMWARE_TARGET = {
  track: "selects the Track preset",
  transport: "selects the Transport preset",
  reload: "reloads the preset",
} as const;

/** What a switch carries now, in a few words for the picker. */
function describe(use: SwitchUse, nameOf: (id: string) => string): string {
  if (use.route?.isReturn) return "comes back to where it was entered from";
  if (use.route?.viaStepping) return "steps to the neighbouring preset";
  if (use.route?.toStateId) return `goes to ${nameOf(use.route.toStateId)}`;
  // Before "free": the factory set puts Track on A and Transport on B of every preset, and those
  // aren't states of this configuration, so nothing about them shows on the map.
  if (use.firmwareTarget) return FIRMWARE_TARGET[use.firmwareTarget];
  if (use.freeStep === undefined) return "no step left that would fire";
  if (use.sends > 0) return `sends ${use.sends} message${use.sends === 1 ? "" : "s"}`;
  return "free";
}

export function RouteDialog({ intent, onClose }: { intent: RouteIntent | null; onClose: () => void }) {
  return (
    <ModalDialog isOpen={intent !== null} onOpenChange={(open) => !open && onClose()} title="Route">
      {/* Keyed so a second drag starts from its own choices rather than the last one's. */}
      {intent && <RouteForm key={JSON.stringify(intent)} intent={intent} onClose={onClose} />}
    </ModalDialog>
  );
}

function RouteForm({ intent, onClose }: { intent: RouteIntent; onClose: () => void }) {
  const config = usePacerStore((s) => s.board.config);
  const applyEdit = usePacerStore((s) => s.applyEdit);
  const [error, setError] = useState<string | undefined>();

  const machine = useMemo(() => recoverMachine(config), [config]);
  const nameOf = (id: string) => machine.states.find((s) => s.id === id)?.name?.trim() || id;
  const uses = useMemo(() => switchUses(config, intent.fromStateId), [config, intent.fromStateId]);

  const [controlId, setControlId] = useState<number | undefined>(() => {
    if (intent.kind === "existing") return intent.controlId;
    // A switch with nothing on it at all, in the order they're printed on the hardware; failing
    // that, the first that has room for a route.
    return (
      uses.find((u) => !u.route && !u.firmwareTarget && u.sends === 0 && u.freeStep !== undefined) ??
      uses.find((u) => !u.route && u.freeStep !== undefined) ??
      uses.find((u) => !u.route)
    )?.controlId;
  });
  const use = uses.find((u) => u.controlId === controlId);
  const [toStateId, setToStateId] = useState<string | undefined>(() =>
    intent.kind === "add" ? intent.toStateId : use?.route?.toStateId,
  );

  const from = machine.states.find((s) => s.id === intent.fromStateId);
  const members = machine.members[intent.fromStateId] ?? [];
  const stepNumber = intent.kind === "existing" ? intent.stepNumber : (use?.route?.stepNumber ?? use?.freeStep);

  const commit = (target?: string) => {
    if (controlId === undefined || stepNumber === undefined) return;
    const result = editRoute(config, { fromStateId: intent.fromStateId, controlId, stepNumber, toStateId: target });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    applyEdit(() => result.config);
    onClose();
  };

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        From <span className="font-semibold text-foreground">{nameOf(intent.fromStateId)}</span>
        {members.length > 1 && (
          <>
            , written to all {members.length} copies of it ({members.map(presetIndexToLabel).join(", ")})
          </>
        )}
        .
      </p>

      {intent.kind === "add" ? (
        <Select
          label="On switch"
          value={controlId === undefined ? undefined : String(controlId)}
          onChange={(id) => {
            setControlId(id === undefined ? undefined : Number(id));
            setError(undefined);
          }}
          options={uses.map((u) => ({
            id: String(u.controlId),
            label: `${marking(u.controlId)} — ${describe(u, nameOf)}`,
          }))}
        />
      ) : (
        <p>
          On switch <span className="font-semibold">{marking(intent.controlId)}</span>, step {intent.stepNumber} —{" "}
          {use ? describe(use, nameOf) : "not on this state any more"}.
        </p>
      )}

      <Select
        label="Goes to"
        value={toStateId}
        onChange={(id) => {
          setToStateId(id);
          setError(undefined);
        }}
        options={machine.states
          .filter((s) => s.id !== intent.fromStateId)
          .map((s) => ({
            id: s.id,
            label: `${s.name?.trim() || s.id} · ${(machine.members[s.id] ?? []).map(presetIndexToLabel).join(" ")}`,
          }))}
      />

      {use?.route?.isReturn && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          This is how {nameOf(intent.fromStateId)} comes back to wherever it was entered from. Pointing it at one state
          makes every copy go to the same place, and the copies stop being told apart.
        </p>
      )}
      {stepNumber === undefined && (
        <p className="text-xs text-destructive">
          {use?.firmwareTarget
            ? `${marking(controlId!)} already ${FIRMWARE_TARGET[use.firmwareTarget]}, and a press only takes the first jump, so a route on it would never fire.`
            : `Every step on ${controlId === undefined ? "that switch" : marking(controlId)} is in use, so there's nowhere to put a route.`}
        </p>
      )}
      {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onPress={onClose}>
          Cancel
        </Button>
        {intent.kind === "existing" && (
          <Button variant="ghost" onPress={() => commit(undefined)} title="Leave the switch doing nothing">
            Take the route away
          </Button>
        )}
        <Button
          isDisabled={controlId === undefined || stepNumber === undefined || toStateId === undefined || !from}
          onPress={() => commit(toStateId)}
        >
          {intent.kind === "add" ? "Add route" : "Change route"}
        </Button>
      </div>
    </div>
  );
}
