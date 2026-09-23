import { usePress } from "react-aria";
import { useMemo, useState } from "react";
import { panelRow, type SwitchSpec } from "@/pacer/hardware";
import { checkPresetName, renamePreset } from "@/pacer/editing";
import { presetIndexToLabel } from "@/pacer/protocol/constants";
import { computePanelState, switchHint, type DisplayState, type SwitchPanelState } from "@/pacer/panel";
import { cn } from "@/lib/utils";
import { usePacerStore } from "@/store/pacerStore";
import { useControlPress } from "../useControlPress";
import { EditBadge } from "./EditBadge";
import { FaceplateDefs } from "./FaceplateDefs";
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

const DISPLAY_RED = "#ff3322";
/* The display module's own drawing units (its SVG viewBox), which line 2's field matches. */
const SCREEN = { w: 196, h: 130, fontSize: 38, letterSpacing: 2, line1Baseline: 52, line2Baseline: 104 };
const pctOfScreenW = (v: number) => `${((v / SCREEN.w) * 100).toFixed(2)}cqw`;
/** The display is a 14-segment module; DSEG14 draws its characters the same way (see index.css). */
const DISPLAY_FONT = '"DSEG14 Classic", ui-monospace, SFMono-Regular, Menlo, monospace';

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
  const editing = usePacerStore((s) => s.uiMode === "edit");
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
  const editing = usePacerStore((s) => s.uiMode === "edit");
  const { pressProps } = usePress({ onPressStart, onPressEnd, isDisabled: editing });
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
function Display({
  display,
  hideName = false,
  children,
}: {
  display: DisplayState;
  /** The rename field draws line 1 (the preset's name) while it's open, in the same place and size. */
  hideName?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-[1cqw]">
      <div
        className="@container relative w-full rounded-[4%] border-[0.25cqw] border-black bg-[#060606] px-[2%] py-[3%] text-center"
        style={{ aspectRatio: `${HOUSING_W} / 130` }}
        aria-live="polite"
      >
        <svg viewBox={`0 0 ${SCREEN.w} ${SCREEN.h}`} className="size-full" aria-hidden>
          <g
            fill={DISPLAY_RED}
            filter="url(#display-glow)"
            fontFamily={DISPLAY_FONT}
            fontStyle="italic"
            fontSize={SCREEN.fontSize}
            letterSpacing={SCREEN.letterSpacing}
            textAnchor="middle"
          >
            {!hideName && (
              <text x={SCREEN.w / 2} y={SCREEN.line1Baseline} style={{ whiteSpace: "pre" }}>
                {display.line1}
              </text>
            )}
            <text
              x={SCREEN.w / 2}
              y={SCREEN.line2Baseline}
              className={display.line2Blinking ? "pacer-blink" : undefined}
            >
              {display.line2}
            </text>
          </g>
        </svg>
        {/* The tests read the display's second line; the SVG text above is aria-hidden. */}
        <span className="sr-only" data-testid="display-line2">
          {display.line2}
        </span>
        {/* Renaming targets the screen itself, not the encoder below it. */}
        {children}
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
 * The preset's name, edited on the display itself: in Edit mode the display takes a pencil badge,
 * and tapping it turns into a 5-character field over the same spot.
 */
function DisplayNameEditor({ onEditingChange }: { onEditingChange: (editing: boolean) => void }) {
  const presetIndex = usePacerStore((s) => s.board.activePresetIndex);
  const name = usePacerStore((s) => s.board.config.presets[s.board.activePresetIndex]?.name ?? "");
  const applyEdit = usePacerStore((s) => s.applyEdit);
  const [draft, setDraftState] = useState<string>();
  const setDraft = (next: string | undefined) => {
    setDraftState(next);
    onEditingChange(next !== undefined);
  };
  const check = draft === undefined ? undefined : checkPresetName(draft);
  const commit = () => {
    if (draft === undefined) return;
    if (check?.error) return; // keep editing until it's something the Pacer can store
    if (check && check.name.trimEnd() !== name.trimEnd()) applyEdit((c) => renamePreset(c, presetIndex, draft));
    setDraft(undefined);
  };

  if (draft === undefined) {
    return (
      <button
        type="button"
        className="absolute inset-0 rounded-[4%] ring-focus outline-none"
        title={`Rename preset ${presetIndexToLabel(presetIndex)}`}
        aria-label={`Rename preset ${presetIndexToLabel(presetIndex)} (currently ${name.trim() || "unnamed"})`}
        onClick={() => setDraft(name.trimEnd())}
      >
        <EditBadge />
      </button>
    );
  }
  const problem = check?.error ?? check?.warning;
  return (
    <>
      {/*
       * Sized and placed from the display's own units, so renaming changes nothing on screen
       * except that a caret appears: same segment font, same size, same line.
       */}
      <input
        autoFocus
        value={draft}
        aria-label={`Preset ${presetIndexToLabel(presetIndex)} name`}
        aria-invalid={check?.error !== undefined}
        aria-describedby={problem ? "preset-name-problem" : undefined}
        className={cn(
          "absolute w-full border-0 bg-transparent p-0 text-center uppercase caret-current outline-none",
          check?.error && "text-destructive",
        )}
        style={{
          color: check?.error ? undefined : DISPLAY_RED,
          fontFamily: DISPLAY_FONT,
          fontStyle: "italic",
          textShadow: `0 0 ${pctOfScreenW(5)} ${DISPLAY_RED}`,
          fontSize: pctOfScreenW(SCREEN.fontSize),
          letterSpacing: pctOfScreenW(SCREEN.letterSpacing),
          // The name line's baseline, less the ascent the font sits above it.
          top: `${(((SCREEN.line1Baseline - SCREEN.fontSize * 0.78) / SCREEN.h) * 100).toFixed(2)}%`,
          left: 0,
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(undefined);
        }}
      />
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
  const editing = usePacerStore((s) => s.uiMode === "edit");
  const [renaming, setRenaming] = useState(false);
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

  return (
    <div
      className="@container w-full touch-none rounded-[2%] bg-[#3a3b3e] p-[1.2cqw] select-none"
      role="group"
      aria-label={editing ? "Pacer faceplate (editing: tap a switch to program it)" : "Pacer faceplate"}
    >
      <FaceplateDefs />
      <div className="grid grid-cols-6 gap-x-[1.6cqw] gap-y-[2cqw] rounded-[1.6cqw] p-[1.2cqw] ring-[0.2cqw] ring-[#5fa99b]/80">
        {back.map(cell)}
        <Display display={panel.display} hideName={renaming}>
          {editing && <DisplayNameEditor onEditingChange={setRenaming} />}
        </Display>
        {front.map(cell)}
      </div>
    </div>
  );
}
