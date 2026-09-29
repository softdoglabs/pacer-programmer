import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Checkbox } from "react-aria-components";
import { Select } from "@/components/ui/select";
import { ToggleGroup } from "@/components/ui/toggle-group";
import { recoverMachine } from "@/pacer/analysis";
import { editRoute, planRoute, switchUses, type SwitchUse } from "@/pacer/authoring";
import { isSparePreset } from "@/pacer/editing";
import { switchSpecForControl } from "@/pacer/hardware";
import { FIRST_USER_PRESET_INDEX, LAST_USER_PRESET_INDEX, presetIndexToLabel } from "@/pacer/protocol/constants";
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

/** A state's presets, worded as the map words them: the slot when it's one, a count when it's many. */
const statePresets = (members: number[]) =>
  members.length === 1 ? presetIndexToLabel(members[0]!) : `${members.length} presets`;

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

  /*
   * Whether the state being entered comes back to whoever entered it. While it's entered from one
   * place that's a question the presets can't answer (see `RoutePlan.choice`), and it's what
   * decides whether the route costs a preset — so it's asked, starting at the answer that costs
   * nothing. A state whose copies already exist has no such question: it comes back, and the
   * copies are what the route needs.
   */
  const [asReturn, setAsReturn] = useState(false);

  /*
   * Most switches on a real device are busy — the factory set gives A and B to the firmware's DAW
   * presets and 1-6 to sending MIDI — so a route often has nowhere to go unless the switch stops
   * doing what it did. That's offered rather than done quietly, and it replaces the whole switch:
   * a route sharing a press with what was there would need a free step, which is the case that
   * doesn't need this.
   */
  const [replace, setReplace] = useState(false);
  const hasRoom = use?.freeStep !== undefined || use?.route !== undefined;
  const replacing = replace && intent.kind === "add";
  const change = {
    fromStateId: intent.fromStateId,
    controlId: controlId ?? -1,
    stepNumber: replacing ? 1 : (stepNumber ?? 1),
    ...(toStateId !== undefined ? { toStateId } : {}),
    asReturn,
    replace: replacing,
  };
  // Cheap enough to do on every render (a pass over 24 presets) and awkward to memoize on an
  // object that changes with every field: this is a modal with four controls in it.
  const plan = planRoute(config, change);
  const needs = plan.ok ? plan.copies : [];
  const spare = useMemo(() => {
    const free: number[] = [];
    for (let i = FIRST_USER_PRESET_INDEX; i <= LAST_USER_PRESET_INDEX; i++) {
      if (isSparePreset(config.presets[i])) free.push(i);
    }
    return free;
  }, [config]);

  // One preset per copy, defaulting to the empty ones in order. A slot already in use can be
  // chosen, and says so.
  const [into, setInto] = useState<(number | undefined)[]>([]);
  const slots = needs.map((_, i) => into[i] ?? spare[i]);

  const commit = (target?: string) => {
    if (controlId === undefined || (stepNumber === undefined && !replacing)) return;
    const chosen = target === undefined ? [] : slots.filter((s): s is number => s !== undefined);
    const result = editRoute(
      config,
      {
        fromStateId: intent.fromStateId,
        controlId,
        stepNumber: replacing ? 1 : stepNumber!,
        ...(target !== undefined ? { toStateId: target } : {}),
        asReturn,
        replace: replacing,
      },
      chosen,
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    applyEdit(() => result.config);
    onClose();
  };

  const presetOptions = () => {
    const empty: { id: string; label: string }[] = [];
    const inUse: { id: string; label: string }[] = [];
    for (let i = FIRST_USER_PRESET_INDEX; i <= LAST_USER_PRESET_INDEX; i++) {
      const name = config.presets[i]?.name?.trim();
      const option = { id: String(i), label: `${presetIndexToLabel(i)}${name ? ` ${name}` : ""}` };
      (isSparePreset(config.presets[i]) ? empty : inUse).push(option);
    }
    return [
      { title: "Empty", options: empty.length > 0 ? empty : [{ id: "none", label: "— none —" }] },
      { title: "In use — would be overwritten", options: inUse },
    ];
  };

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        From <span className="font-semibold text-foreground">{nameOf(intent.fromStateId)}</span>
        {members.length > 1 && (
          <>
            , written to all {members.length} presets it is{" "}
            <span title={members.map(presetIndexToLabel).join(", ")}>(one state)</span>
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
            label: `${s.name?.trim() || s.id} · ${statePresets(machine.members[s.id] ?? [])}`,
          }))}
      />

      {plan.ok && plan.choice && toStateId !== undefined && (
        <div className="space-y-2 rounded-md border px-3 py-2">
          <p className="text-xs text-muted-foreground">
            {nameOf(toStateId)} is one preset, entered from {plan.choice.sharedBy.map(presetIndexToLabel).join(" and ")}
            , and it leads to {presetIndexToLabel(plan.choice.backTo)}. Nothing in the presets says whether that means
            “back where I came from” or “always {presetIndexToLabel(plan.choice.backTo)}” — one preset can't do both, so
            this is the moment that settles it.
          </p>
          <ToggleGroup<"return" | "fixed">
            label="Leaving it"
            labelVisible
            options={[
              { id: "return", label: "Comes back here", title: "It needs a preset of its own for this way in" },
              {
                id: "fixed",
                label: `Always goes to ${presetIndexToLabel(plan.choice.backTo)}`,
                title: "It stays one preset, shared by both ways in",
              },
            ]}
            value={asReturn ? "return" : "fixed"}
            onChange={(v) => {
              setAsReturn(v === "return");
              setError(undefined);
            }}
          />
        </div>
      )}

      {needs.length > 0 && (
        <div className="space-y-2 rounded-md border px-3 py-2">
          <p className="text-xs text-muted-foreground">
            A state that comes back is a preset per place it's entered from, so this needs{" "}
            {needs.length === 1 ? "another preset" : `${needs.length} more presets`}. The Pacer has 24 and no spare ones
            of its own — clearing a preset in Program mode is what frees a slot.
          </p>
          {needs.some((copy) => copy.repoint) && (
            <p className="text-xs text-muted-foreground">
              {needs
                .filter((copy) => copy.repoint)
                .map((copy) => presetIndexToLabel(copy.entryFrom))
                .join(", ")}{" "}
              has been sharing it, so it gets a copy too and its own switch follows.
            </p>
          )}
          {needs.map((copy, i) => (
            <Select
              key={i}
              label={`Copy of ${copy.name?.trim() || copy.stateId} goes in`}
              value={slots[i] === undefined ? undefined : String(slots[i])}
              onChange={(id) => {
                setInto((prev) => {
                  const next = [...prev];
                  next[i] = id === undefined || id === "none" ? undefined : Number(id);
                  return next;
                });
                setError(undefined);
              }}
              options={presetOptions()}
            />
          ))}
          {slots.some((slot) => slot !== undefined && !isSparePreset(config.presets[slot])) && (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              That preset has something in it. Everything it does would be replaced by this copy.
            </p>
          )}
          {slots.some((slot) => slot === undefined) && (
            <p className="text-xs text-destructive">
              No empty presets left. Clear one in Program mode, or choose one to overwrite.
            </p>
          )}
        </div>
      )}

      {!plan.ok && <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">{plan.error}</p>}

      {use?.route?.isReturn && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          This is how {nameOf(intent.fromStateId)} comes back to wherever it was entered from. Pointing it at one state
          makes every copy go to the same place, and the copies stop being told apart.
        </p>
      )}
      {intent.kind === "add" && use && (
        <div className="space-y-1">
          {!hasRoom && !replacing && (
            <p className="text-xs text-destructive">
              {use.firmwareTarget
                ? `${marking(use.controlId)} already ${FIRMWARE_TARGET[use.firmwareTarget]}, and a press only takes the first jump, so a route on it would never fire.`
                : `Every step on ${marking(use.controlId)} is in use, so there's nowhere to put a route.`}
            </p>
          )}
          <Checkbox
            isSelected={replacing}
            onChange={(on) => {
              setReplace(on);
              setError(undefined);
            }}
            className="group flex items-start gap-2 text-xs"
          >
            <span
              aria-hidden
              className="flex size-5 shrink-0 items-center justify-center rounded border bg-card group-data-[selected]:bg-primary group-data-[selected]:text-primary-foreground"
            >
              {replacing ? "✓" : ""}
            </span>
            <span className="text-muted-foreground">
              Replace what {marking(use.controlId)} does ({describe(use, nameOf)}) — the route becomes all it does, on{" "}
              {members.length > 1 ? `all ${members.length} presets` : "it"}.
            </span>
          </Checkbox>
        </div>
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
          isDisabled={
            controlId === undefined ||
            (stepNumber === undefined && !replacing) ||
            toStateId === undefined ||
            !from ||
            !plan.ok ||
            slots.some((slot) => slot === undefined)
          }
          onPress={() => commit(toStateId)}
        >
          {intent.kind === "add" ? "Add route" : "Change route"}
        </Button>
      </div>
    </div>
  );
}
