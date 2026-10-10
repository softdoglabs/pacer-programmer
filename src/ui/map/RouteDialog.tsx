import { useMemo, useState } from "react";
import { Checkbox, Label, Radio, RadioGroup } from "react-aria-components";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { editRoute, entrantStates, planRoute, switchUses, type RouteChange, type SwitchUse } from "@/pacer/authoring";
import { dependsOnEntry, type EntryTarget, type MachineTarget } from "@/pacer/analysis";
import { isSparePreset } from "@/pacer/editing";
import { switchSpecForControl } from "@/pacer/hardware";
import { FIRST_USER_PRESET_INDEX, LAST_USER_PRESET_INDEX, presetIndexToLabel } from "@/pacer/protocol/constants";
import { controlLabel } from "@/pacer/simulator";
import { usePacerStore } from "../../store/pacerStore";
import { useMachine } from "../useMachine";

/*
 * One switch on one state: where it leads, edited as the map shows it.
 *
 * The question this dialog exists to ask is whether the switch depends on the way in — and it only
 * asks when that's a real question. A copy of a state is needed for one reason: a switch that has to
 * lead to different places depending on how you got there. So drawing a route *into* a state never
 * asks anything (it just leads there), and a route *out of* one asks only when the switch already
 * leads somewhere else, or when this state has more than one way in and going back is on offer.
 *
 * Everything is written to every copy of the state (see `pacer/authoring`), and what it costs —
 * presets for new copies, presets freed — is worked out by running the edit without writing it, so
 * the dialog shows exactly what pressing the button will do.
 */

export type RouteIntent =
  /** Dragged from one state to another: the switch is still to be chosen. */
  | { kind: "add"; fromStateId: string; toStateId: string }
  /** A route already on the map, picked by clicking it (or the state's "returns" note). */
  | { kind: "existing"; fromStateId: string; controlId: number; stepNumber: number };

type Mode = "fixed" | "back" | "table";

const marking = (controlId: number) => switchSpecForControl(controlId)?.name ?? controlLabel(controlId);
const slotKey = (t: { controlId: number; stepNumber: number }) => `${t.controlId}:${t.stepNumber}`;

const FIRMWARE_TARGET = {
  track: "selects the Track preset",
  transport: "selects the Transport preset",
  reload: "reloads the preset",
} as const;

/** What a switch carries now, in a few words for the picker. */
function describe(use: SwitchUse, nameOf: (id: string) => string): string {
  if (use.route?.to.kind === "return") return "goes back to where it was entered from";
  if (use.route?.to.kind === "byEntry") return "depends on the way in";
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

  const machine = useMachine();
  const stateOf = (id: string) => machine.states.find((s) => s.id === id);
  const nameOf = (id: string) => stateOf(id)?.name?.trim() || id;
  const from = stateOf(intent.fromStateId);
  const fromName = nameOf(intent.fromStateId);
  const members = machine.members[intent.fromStateId] ?? [];
  const uses = useMemo(() => switchUses(config, intent.fromStateId), [config, intent.fromStateId]);
  // The states that enter this one: the rows of a table, and what "back" can lead to.
  const ways = useMemo(() => entrantStates(machine, intent.fromStateId), [machine, intent.fromStateId]);

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
  const current = from?.transitions.find((t) => t.controlId === controlId && !t.viaStepping);

  /*
   * Which switch a route is on is part of the route, so it can be changed like anything else: pick
   * another and it moves, giving up the one it was on in the same edit.
   */
  const staying = intent.kind === "existing" && controlId === intent.controlId;
  const moveFrom =
    intent.kind === "existing" && !staying ? { controlId: intent.controlId, stepNumber: intent.stepNumber } : undefined;

  const [replace, setReplace] = useState(false);
  const replacing = replace && !staying;
  const stepNumber = staying ? intent.stepNumber : replacing ? 1 : (current?.stepNumber ?? use?.freeStep);

  // Where it goes when it always goes to one state.
  const [toStateId, setToStateId] = useState<string | undefined>(() => {
    if (intent.kind === "add") return intent.toStateId;
    return current?.to.kind === "state" ? current.to.id : undefined;
  });

  /*
   * A route drawn onto a switch that already leads somewhere else is the moment the question is
   * real: instead, back to wherever this state was entered from, or somewhere different per way in.
   * It starts unanswered, so nothing is assumed.
   */
  const conflict =
    intent.kind === "add" &&
    current !== undefined &&
    !(current.to.kind === "state" && current.to.id === intent.toStateId) &&
    !moveFrom;
  const canDepend = ways.length >= 2 || (current !== undefined && current.to.kind !== "state");
  /*
   * What the form starts on depends on the switch, so it's worked out per switch, and an answer
   * given for one switch doesn't carry over to another — choosing A after the dialog opened on a
   * free switch has to raise A's question, not keep the free switch's answer.
   */
  // The route being edited, which moves with the switch; otherwise whatever the switch does now.
  const shown =
    intent.kind === "existing"
      ? from?.transitions.find((t) => t.controlId === intent.controlId && !t.viaStepping)
      : current;
  const defaultMode: Mode | undefined =
    intent.kind === "existing" && shown?.to.kind === "return"
      ? "back"
      : intent.kind === "existing" && shown?.to.kind === "byEntry"
        ? "table"
        : conflict && canDepend
          ? undefined
          : "fixed";
  const [chosenMode, setChosenMode] = useState<{ controlId?: number; mode: Mode }>();
  const mode = chosenMode && chosenMode.controlId === controlId ? chosenMode.mode : defaultMode;
  const setMode = (m: Mode) => setChosenMode({ controlId, mode: m });

  // The table, one row per way in: "back", or a state id. Starts from what the switch does now.
  const defaultRows: Record<string, string> = {};
  for (const w of ways) {
    if (shown?.to.kind === "byEntry") {
      const row = shown.to.routes.find((r) => r.from === w)?.to;
      defaultRows[w] = row?.kind === "state" ? row.id : "back";
    } else if (shown?.to.kind === "return") defaultRows[w] = "back";
    // Drawn here from another state: back from that state, wherever it went before from the rest.
    else if (intent.kind === "add" && w === intent.toStateId) defaultRows[w] = "back";
    else defaultRows[w] = shown?.to.kind === "state" ? shown.to.id : (toStateId ?? "back");
  }
  const [rowEdits, setRowEdits] = useState<{ controlId?: number; rows: Record<string, string> }>();
  const rows = { ...defaultRows, ...(rowEdits && rowEdits.controlId === controlId ? rowEdits.rows : {}) };
  const setRow = (way: string, v: string) =>
    setRowEdits((e) => ({ controlId, rows: { ...(e && e.controlId === controlId ? e.rows : {}), [way]: v } }));

  const to: MachineTarget | undefined =
    mode === "fixed"
      ? toStateId !== undefined
        ? { kind: "state", id: toStateId }
        : undefined
      : mode === "back"
        ? { kind: "return" }
        : mode === "table"
          ? {
              kind: "byEntry",
              routes: ways.map((w) => ({
                from: w,
                to:
                  rows[w] === "back" || !rows[w]
                    ? { kind: "return" as const }
                    : { kind: "state" as const, id: rows[w]! },
              })),
            }
          : undefined;

  /*
   * A state this route enters whose switches depend on the way in needs to know where they lead
   * from here. Asked only for a way in it doesn't have yet; back unless changed.
   */
  const entered = useMemo(() => {
    const ids =
      to?.kind === "state"
        ? [to.id]
        : to?.kind === "byEntry"
          ? to.routes.flatMap((r) => (r.to.kind === "state" ? [r.to.id] : []))
          : [];
    return [...new Set(ids)]
      .map((id) => stateOf(id)!)
      .filter((s) => s && dependsOnEntry(s) && !entrantStates(machine, s.id).includes(intent.fromStateId));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `stateOf` reads `machine`, which is listed
  }, [to, machine, intent.fromStateId]);
  const [entering, setEntering] = useState<Record<string, string>>({});
  const enteringTargets: Record<string, EntryTarget> = {};
  for (const s of entered) {
    for (const t of s.transitions) {
      if (t.to.kind === "state") continue;
      const v = entering[`${s.id}|${slotKey(t)}`] ?? "back";
      enteringTargets[slotKey(t)] = v === "back" ? { kind: "return" } : { kind: "state", id: v };
    }
  }

  const change: RouteChange | undefined =
    controlId === undefined || stepNumber === undefined
      ? undefined
      : {
          fromStateId: intent.fromStateId,
          controlId,
          stepNumber,
          ...(to ? { to } : {}),
          ...(Object.keys(enteringTargets).length > 0 ? { entering: enteringTargets } : {}),
          ...(moveFrom ? { moveFrom } : {}),
          replace: replacing,
        };
  // Cheap enough to work out on every render (a pass over 24 presets).
  const plan = change && to ? planRoute(config, change) : undefined;
  const needs = plan?.ok ? plan.needs : [];
  const freed = plan?.ok ? plan.freed : [];

  const spare = useMemo(() => {
    const free: number[] = [];
    for (let i = FIRST_USER_PRESET_INDEX; i <= LAST_USER_PRESET_INDEX; i++) {
      if (isSparePreset(config.presets[i])) free.push(i);
    }
    return free;
  }, [config]);
  // One empty preset per copy, defaulting to the empty ones in order.
  const [into, setInto] = useState<(number | undefined)[]>([]);
  const slots = needs.map((_, i) => into[i] ?? spare.filter((s) => !into.includes(s))[i]);

  const commit = (target: MachineTarget | undefined) => {
    if (!change) return;
    const result = editRoute(
      config,
      { ...change, ...(target ? { to: target } : { to: undefined }) },
      target ? slots.filter((s): s is number => s !== undefined) : [],
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    applyEdit(() => result.config);
    onClose();
  };

  const stateOptions = machine.states
    .filter((s) => s.id !== intent.fromStateId)
    .map((s) => ({ id: s.id, label: `${s.name?.trim() || s.id} · ${statePresets(machine.members[s.id] ?? [])}` }));
  const rowOptions = (way: string) => [
    { id: "back", label: `Back to ${nameOf(way)}` },
    ...stateOptions.filter((o) => o.id !== way),
  ];
  const switchWord = controlId !== undefined ? marking(controlId) : "the switch";
  const hasRoom = use?.freeStep !== undefined || use?.route !== undefined;

  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        From <span className="font-semibold text-foreground">{fromName}</span>
        {members.length > 1 && (
          <>
            , written to all {members.length} presets it is{" "}
            <span title={members.map(presetIndexToLabel).join(", ")}>(one state)</span>
          </>
        )}
        .
      </p>

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
      {moveFrom && (
        <p className="text-xs text-muted-foreground">
          Moved off {marking(moveFrom.controlId)}, which goes back to doing nothing.
        </p>
      )}

      {conflict && current && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          On {fromName}, {switchWord} already{" "}
          {current.to.kind === "state"
            ? `goes to ${nameOf(current.to.id)}`
            : current.to.kind === "return"
              ? "goes back to wherever it was entered from"
              : "depends on the way in"}
          . Choose what it should do — or pick another switch above, which needs no change here.
        </p>
      )}

      {canDepend && (
        <RadioGroup
          value={mode ?? null}
          onChange={(v) => {
            setMode(v as Mode);
            setError(undefined);
          }}
          className="space-y-2"
        >
          <Label className="text-muted-foreground">
            {switchWord} on {fromName}…
          </Label>
          <Choice value="fixed">Always goes to one state</Choice>
          {ways.length >= 2 && (
            <Choice value="back">
              Goes back to wherever {fromName} was entered from ({ways.map(nameOf).join(", ")})
            </Choice>
          )}
          {ways.length >= 1 && <Choice value="table">Depends on the way in</Choice>}
        </RadioGroup>
      )}
      {/* The chosen answer's details sit below the choice, not inside its label. */}
      {mode === "fixed" && <Select label="Goes to" value={toStateId} onChange={setToStateId} options={stateOptions} />}
      {mode === "table" && (
        <div className="space-y-1">
          {ways.map((w) => (
            <Select
              key={w}
              label={`Entered from ${nameOf(w)}`}
              value={rows[w] ?? "back"}
              onChange={(v) => v && setRow(w, v)}
              options={rowOptions(w)}
            />
          ))}
        </div>
      )}

      {entered.map((s) => (
        <div key={s.id} className="space-y-2 rounded-md border px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Where {s.name?.trim() || s.id}'s switches lead depends on the way in, so they need to say where they lead
            when it's entered from {fromName}.
          </p>
          {s.transitions
            .filter((t) => t.to.kind !== "state")
            .map((t) => (
              <Select
                key={slotKey(t)}
                label={`${marking(t.controlId)}, entered from ${fromName}`}
                value={entering[`${s.id}|${slotKey(t)}`] ?? "back"}
                onChange={(v) => v && setEntering((e) => ({ ...e, [`${s.id}|${slotKey(t)}`]: v }))}
                options={[
                  { id: "back", label: `Back to ${fromName}` },
                  ...machine.states
                    .filter((x) => x.id !== s.id)
                    .map((x) => ({ id: x.id, label: x.name?.trim() || x.id })),
                ]}
              />
            ))}
        </div>
      ))}

      {needs.length > 0 && (
        <div className="space-y-2 rounded-md border px-3 py-2">
          <p className="text-xs text-muted-foreground">
            A switch that leads somewhere different depending on the way in needs a preset for each distinct set of
            destinations, so this needs {needs.length === 1 ? "another preset" : `${needs.length} more presets`}. The
            Pacer has 24 and no spare ones of its own — clearing a preset in Program mode is what frees one.
          </p>
          {needs.map((need, i) => (
            <Select
              key={i}
              // The label wraps rather than the slot shrinking: "D6 EM…" doesn't say which preset.
              className="[&>button]:shrink-0"
              label={`Copy of ${nameOf(need.stateId)}${need.enteredFrom ? ` (entered from ${nameOf(need.enteredFrom)})` : ""} goes in`}
              value={slots[i] === undefined ? undefined : String(slots[i])}
              onChange={(id) => {
                setInto((prev) => {
                  const next = [...prev];
                  next[i] = id === undefined || id === "none" ? undefined : Number(id);
                  return next;
                });
                setError(undefined);
              }}
              options={
                spare.length > 0
                  ? spare.map((i) => ({
                      id: String(i),
                      label: `${presetIndexToLabel(i)} ${config.presets[i]?.name?.trim() ?? ""}`.trim(),
                    }))
                  : [{ id: "none", label: "— none —" }]
              }
            />
          ))}
          {slots.some((slot) => slot === undefined) && (
            <p className="text-xs text-destructive">No empty presets left. Clear one in Program mode first.</p>
          )}
        </div>
      )}
      {freed.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Frees {freed.map(presetIndexToLabel).join(", ")}, which {freed.length === 1 ? "isn't" : "aren't"} needed any
          more: {freed.length === 1 ? "it's" : "they're"} cleared and named EMPTY.
        </p>
      )}
      {plan && !plan.ok && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">{plan.error}</p>
      )}

      {/* Not for the switch this route is already on: it's already all that switch does about where it leads. */}
      {!staying && use && !(use.route && !use.route.viaStepping) && (
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
              {members.length > 1 ? `all ${members.length} presets` : "this preset"}.
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
          isDisabled={!change || !to || !plan?.ok || slots.some((slot) => slot === undefined)}
          onPress={() => commit(to)}
        >
          {intent.kind === "add" ? "Add route" : "Change route"}
        </Button>
      </div>
    </div>
  );
}

/** A state's presets, worded as the map words them: the slot when it's one, a count when it's many. */
const statePresets = (members: number[]) =>
  members.length === 1 ? presetIndexToLabel(members[0]!) : `${members.length} presets`;

function Choice({ value, children }: { value: Mode; children: React.ReactNode }) {
  return (
    <Radio value={value} className="group flex cursor-pointer items-start gap-2 text-sm outline-none">
      <span
        aria-hidden
        className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border bg-card ring-focus group-data-[focus-visible]:outline group-data-[selected]:border-primary"
      >
        <span className="size-2 rounded-full bg-primary opacity-0 group-data-[selected]:opacity-100" />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </Radio>
  );
}
