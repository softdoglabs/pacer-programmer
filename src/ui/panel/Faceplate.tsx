// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { useEffect, useMemo, useRef, useState } from "react";
import { panelRow, type SwitchSpec } from "@/pacer/hardware";
import { checkPresetName, renamePreset } from "@/pacer/editing";
import { presetIndexToLabel } from "@/pacer/protocol/constants";
import { computePanelState, switchHint, type DisplayState, type SwitchPanelState } from "@/pacer/panel";
import { Button } from "react-aria-components";
import { Titled } from "@/components/ui/titled";
import { cn } from "@/lib/utils";
import { PresetChooser } from "../PresetChooser";
import { usePacerStore } from "@/store/pacerStore";
import { useStateOfPreset } from "../useMachine";
import { useControlPress } from "../useControlPress";
import { useSettledPress } from "../useSettledPress";
import { EditBadge, PresetBadge } from "./EditBadge";
import { HOUSING_H, HOUSING_W, SwitchView } from "./SwitchView";

/*
 * A schematic, hand-drawn rendering of the Pacer's top panel (landscape, player's view), laid
 * out entirely from the hardware description (src/pacer/hardware) and painted from the computed
 * panel state (src/pacer/panel). Proportions are approximate.
 *
 * Layout is a plain CSS grid — two rows of six cells, each holding a switch with its hint and
 * printed marking beneath it — so every element sizes itself from its content. (It used to be an
 * SVG background with the switches positioned over it as percentages of a hand-built coordinate
 * system, which meant anything that grew, like Edit mode's badges, had nowhere to go.)
 *
 * Text scales with the panel through container-query units (`cqw`), so it stays in proportion at
 * any width without depending on the viewport.
 *
 * The switches have to be HTML elements, not SVG ones: React Aria's usePress ends a touch
 * long-press, which fires no click on iOS/Android, by clicking the target itself, and it only
 * does that for HTMLElements.
 */

/** The display module's proportions; its text metrics live in `.display-line` (index.css). */
const SCREEN_ASPECT = "196 / 130";

const PANEL_SWITCHES: readonly SwitchSpec[] = [...panelRow("back"), ...panelRow("front")];

/** A switch and, beneath it, the app's hint and the faceplate's printed marking. */
function PanelCell({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-[1cqw]">{children}</div>;
}

interface PanelSwitchProps {
  spec: SwitchSpec;
  state: SwitchPanelState;
  hint: string | undefined;
}

/** A programmable stompswitch: presses go to the simulation (or the firmware, in special modes). */
function StompPanelSwitch({ spec, controlId, state, hint }: PanelSwitchProps & { controlId: number }) {
  const { pressProps } = useControlPress(controlId);
  const selected = usePacerStore((s) => s.selectedControlId === controlId);
  const editing = usePacerStore((s) => s.uiMode === "program");
  return (
    <SwitchView
      spec={spec}
      state={state}
      selected={selected}
      editable={editing}
      ariaLabel={`Switch ${spec.name}: ${hint ?? "—"}`}
      title={hint ? `${spec.name}: ${hint}` : `${spec.name}: not configured on this preset`}
      pressProps={pressProps}
    />
  );
}

/**
 * [Preset]: not programmable. Tap vs. hold is decided by the device machine's timer (it's
 * firmware behavior being simulated), so the UI only reports press start/end.
 */
function PresetPanelSwitch({ spec, state, hint }: PanelSwitchProps) {
  const onPressStart = usePacerStore((s) => s.presetButtonDown);
  const onPressEnd = usePacerStore((s) => s.presetButtonUp);
  // [Preset] isn't programmable, so in Edit mode it does nothing.
  const editing = usePacerStore((s) => s.uiMode === "program");
  // Settled, like the other switches: a swipe across the faceplate that starts here isn't a tap.
  const { pressProps } = useSettledPress({ onDown: onPressStart, onUp: onPressEnd, isDisabled: editing });
  return (
    <SwitchView
      spec={spec}
      state={state}
      selected={false}
      uneditable={editing}
      ariaLabel={editing ? "Preset button (not programmable)" : `Preset button (${hint})`}
      title={`Preset: ${hint}`}
      pressProps={pressProps}
    />
  );
}

/** The app's own annotation of what a press would do: not something the hardware shows. */
function Hint({ hint }: { hint: string | undefined }) {
  return (
    <p className="max-w-full truncate text-[1.15cqw] italic" style={{ color: "#7fd1c3" }}>
      {hint ?? " "}
    </p>
  );
}

/** The marking printed on the faceplate below a switch: a teal badge (A-D) or a plain numeral (1-6). */
function Marking({ spec }: { spec: SwitchSpec }) {
  if (spec.marking === "badge") {
    return (
      <span className="grid size-[2.2cqw] place-items-center rounded-full bg-[#5fa99b] text-[1.2cqw] font-bold text-[#1c2b28]">
        {spec.name}
      </span>
    );
  }
  if (spec.marking === "numeral") {
    return <span className="text-[1.6cqw] font-bold text-[#d4d4d8]">{spec.name}</span>;
  }
  return null;
}

/** The LED display and the encoder below it, in the back row's last cell. */
function Display({ display, nameLine }: { display: DisplayState; nameLine: React.ReactNode }) {
  const presetIndex = usePacerStore((s) => s.board.activePresetIndex);
  const uiMode = usePacerStore((s) => s.uiMode);
  const scope = usePacerStore((s) => s.editScope);
  const { members } = useStateOfPreset();

  /*
   * While an edit goes to every preset of a state, the number line would be a lie: it names one
   * slot when the change reaches all of them. The hardware would never show this — it's the app
   * saying what it's about to change, in the place you'd look to find out.
   */
  const editingState = uiMode === "program" && scope === "state" && members.length > 1;
  const line2 = editingState ? `x${members.length}` : display.line2;
  /*
   * "x2" is a count, and a count is no use without the slots behind it — they're where the presets
   * are on the hardware. They don't fit on a 14-segment line, so they're the tooltip, which has to
   * sit on the chooser overlay: it covers the lower half of the display, which is exactly where the
   * number is, so a tooltip anywhere behind it would never be the one that shows.
   */
  const presets = editingState
    ? `${display.line1.trim()} — ${members.length} presets: ${members.map(presetIndexToLabel).join(", ")}`
    : undefined;
  const readout = presets ?? `${display.line1.trim()} ${display.line2}`;

  return (
    <div className="flex w-full flex-col items-center gap-[1cqw]">
      <div
        className="@container relative flex w-full flex-col justify-center rounded-[4%] border-[0.25cqw] border-black bg-[#060606] px-[3%] py-[4%]"
        style={{ aspectRatio: `${SCREEN_ASPECT}` }}
        aria-live="polite"
        title={presets}
      >
        <span className="sr-only">{readout}</span>
        {nameLine}
        <span
          aria-hidden
          className={cn("display-line display-line--number", display.line2Blinking && "pacer-blink")}
          data-testid="display-line2"
        >
          {line2}
        </span>
        {/*
         * The preset number is where the preset lives on the hardware, so it's where you change it
         * here: an overlay across the display's lower half, badged so it doesn't rely on anyone
         * guessing. The name line above keeps its own half for renaming.
         */}
        <PresetChooser
          trigger={
            <Titled title={presets ? `${presets}. Choose another` : "Choose a preset"}>
              <Button
                aria-label={
                  presets ? `${presets} — choose another` : `Preset ${presetIndexToLabel(presetIndex)} — choose another`
                }
                className="ring-focus absolute inset-x-0 top-1/2 bottom-0 cursor-pointer rounded-[4%] outline-none"
              >
                <PresetBadge />
              </Button>
            </Titled>
          }
        />
      </div>
      <Encoder />
    </div>
  );
}

function Encoder() {
  return (
    <svg viewBox="0 0 110 110" className="w-[7cqw]" aria-hidden>
      <circle cx={55} cy={55} r={50} fill="#151517" stroke="#000" strokeWidth={3} />
      <circle cx={55} cy={55} r={44} fill="none" stroke="#2c2c30" strokeWidth={6} strokeDasharray="3 4" />
      <circle cx={55} cy={55} r={32} fill="#1d1d20" />
    </svg>
  );
}

/**
 * The preset's name, edited on the display itself. The field and the readout are the same line of
 * the display (`.display-line` in index.css), so opening the editor only puts a caret in it —
 * there's no second element to position or keep in step.
 */
function DisplayNameField({ editable }: { editable: boolean }) {
  const presetIndex = usePacerStore((s) => s.board.activePresetIndex);
  const name = usePacerStore((s) => s.board.config.presets[s.board.activePresetIndex]?.name ?? "");
  const applyPresetEdit = usePacerStore((s) => s.applyPresetEdit);
  const [draft, setDraft] = useState<string>();
  const field = useRef<HTMLInputElement>(null);
  const check = draft === undefined ? undefined : checkPresetName(draft);
  const renaming = draft !== undefined;
  // The field is always mounted (it's the display's name line), so opening it has to move focus.
  useEffect(() => {
    if (!renaming) return;
    field.current?.focus();
    field.current?.select(); // typing replaces the old name, as renaming usually means a new one
  }, [renaming]);
  const label = `Preset ${presetIndexToLabel(presetIndex)} name`;
  // Blurring is how the field also commits, so committing must not re-enter through it and apply
  // the rename a second time — which would take two undos to put back.
  const committing = useRef(false);
  const commit = () => {
    if (draft === undefined || committing.current) return;
    committing.current = true;
    try {
      const checked = checkPresetName(draft);
      if (checked.error) return; // keep editing until it's something the Pacer can store
      if (checked.name.trimEnd() !== name.trimEnd()) applyPresetEdit((c, i) => renamePreset(c, i, draft));
      setDraft(undefined);
      // Closing the field hides it from assistive tech again, so focus must not stay on it.
      field.current?.blur();
    } finally {
      committing.current = false;
    }
  };
  const problem = check?.error ?? check?.warning;

  return (
    <>
      {/* The name line and its own small pencil, which sits with the text it edits. */}
      <div className="relative">
        <input
          ref={field}
          value={draft ?? name}
          // Outside editing it's the display: focusable and clickable, but not typed into.
          readOnly={!renaming}
          aria-label={renaming ? label : undefined}
          aria-hidden={!renaming}
          tabIndex={renaming ? 0 : -1}
          aria-invalid={check?.error !== undefined}
          aria-describedby={problem ? "preset-name-problem" : undefined}
          className={cn("display-line", check?.error && "text-destructive")}
          data-testid="display-line1"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(undefined);
              field.current?.blur();
            }
          }}
        />
        {editable && !renaming && (
          <EditBadge
            size="small"
            // Clear of the name's last character: just outside the display, level with the line.
            className="right-[calc(-1*var(--badge-overhang))] bottom-[-25%]"
            onPress={() => setDraft(name.trimEnd())}
            label={`Rename preset ${presetIndexToLabel(presetIndex)} (currently ${name.trim() || "unnamed"})`}
          />
        )}
      </div>
      {problem && (
        <p
          id="preset-name-problem"
          role={check?.error ? "alert" : undefined}
          className={cn(
            "absolute top-full right-0 z-10 mt-1 w-max max-w-64 rounded-md border bg-popover px-2 py-1 text-xs shadow-lg",
            check?.error ? "text-destructive" : "text-warning",
          )}
        >
          {problem}
        </p>
      )}
    </>
  );
}

export function Faceplate() {
  const editing = usePacerStore((s) => s.uiMode === "program");
  const board = usePacerStore((s) => s.board);
  const deviceMode = usePacerStore((s) => s.deviceMode);
  const panel = useMemo(() => computePanelState(board, deviceMode), [board, deviceMode]);
  const hints = useMemo(
    () =>
      new Map(
        PANEL_SWITCHES.map((spec) => [
          spec.id,
          switchHint(spec, board.config, board.activePresetIndex, deviceMode.mode, deviceMode.pendingBank),
        ]),
      ),
    [board, deviceMode],
  );
  const back = PANEL_SWITCHES.filter((s) => s.placement.kind === "panel" && s.placement.row === "back");
  const front = PANEL_SWITCHES.filter((s) => s.placement.kind === "panel" && s.placement.row === "front");

  const cell = (spec: SwitchSpec) => (
    <PanelCell key={spec.id}>
      <div className="relative w-full" style={{ aspectRatio: `${HOUSING_W} / ${HOUSING_H}` }}>
        {spec.kind === "presetSwitch" ? (
          <PresetPanelSwitch spec={spec} state={panel.switches[spec.id]} hint={hints.get(spec.id)} />
        ) : spec.controlId !== undefined ? (
          <StompPanelSwitch
            spec={spec}
            controlId={spec.controlId}
            state={panel.switches[spec.id]}
            hint={hints.get(spec.id)}
          />
        ) : null}
      </div>
      <Hint hint={hints.get(spec.id)} />
      <Marking spec={spec} />
    </PanelCell>
  );

  // Touches may pan (pan-x pan-y), so a phone can scroll a faceplate wider than its screen; a tap or
  // a held finger still reaches the switch. touch-none here made the faceplate unscrollable by touch.
  return (
    <div
      className="@container w-full touch-pan-x touch-pan-y rounded-[2%] bg-[#3a3b3e] p-[1.2cqw] select-none"
      role="group"
      aria-label={editing ? "Pacer faceplate (editing: tap a switch to program it)" : "Pacer faceplate"}
    >
      <div className="grid grid-cols-6 gap-x-[1.6cqw] gap-y-[2cqw] rounded-[1.6cqw] p-[1.2cqw] ring-[0.2cqw] ring-[#5fa99b]/80">
        {back.map(cell)}
        <Display display={panel.display} nameLine={<DisplayNameField editable={editing} />} />
        {front.map(cell)}
      </div>
    </div>
  );
}
