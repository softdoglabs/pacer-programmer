import { usePress } from "react-aria";
import { useMemo, useState, type CSSProperties } from "react";
import { panelRow, type SwitchSpec } from "@/pacer/hardware";
import { PRESET_NAME_LENGTH, renamePreset } from "@/pacer/editing";
import { presetIndexToLabel } from "@/pacer/protocol/constants";
import { computePanelState, switchHint, type DisplayState, type SwitchPanelState } from "@/pacer/panel";
import { usePacerStore } from "@/store/pacerStore";
import { useControlPress } from "../useControlPress";
import { EditBadge } from "./EditBadge";
import { HOUSING_H, HOUSING_W, SwitchView } from "./SwitchView";

/*
 * A schematic, hand-drawn rendering of the Pacer's top panel (landscape, player's view), laid
 * out entirely from the hardware description (src/pacer/hardware) and painted from the
 * computed panel state (src/pacer/panel). Proportions are approximate.
 *
 * Layout: a background SVG draws the body, display, printed markings, and the app's per-switch
 * hints. Each switch is a real HTML <button> positioned over it (see SwitchView). The switches
 * have to be HTML elements, not SVG ones: React Aria's usePress ends a touch long-press, which
 * fires no click on iOS/Android, by clicking the target itself, and it only does that for
 * HTMLElements.
 */
const WIDTH = 1480;
const HEIGHT = 700;
const COL_X0 = 50;
const COL_PITCH = 236;
const ROW_Y = { back: 40, front: 372 } as const;
/** App annotations (what a press would do) sit just below each housing, styled apart from the hardware. */
const HINT_DY = HOUSING_H + 24;
const MARKING_DY = HOUSING_H + 58;
const DISPLAY_COL = 5;
const DISPLAY_RED = "#ff3322";
/** The display is a 14-segment module; DSEG14 draws its characters the same way (see index.css). */
const DISPLAY_FONT = '"DSEG14 Classic", ui-monospace, SFMono-Regular, Menlo, monospace';
const HINT_COLOR = "#7fd1c3";

const colX = (col: number) => COL_X0 + col * COL_PITCH;

function placementOf(spec: SwitchSpec): { x: number; y: number } {
  if (spec.placement.kind !== "panel") throw new Error(`${spec.id} isn't on the panel`);
  return { x: colX(spec.placement.col), y: ROW_Y[spec.placement.row] };
}

/** Positions an element over the background SVG, in its coordinate space. */
function overlayStyle(x: number, y: number, w: number, h: number): CSSProperties {
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return { left: pct(x, WIDTH), top: pct(y, HEIGHT), width: pct(w, WIDTH), height: pct(h, HEIGHT) };
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
  const { x, y } = placementOf(spec);
  return (
    <SwitchView
      spec={spec}
      state={state}
      style={overlayStyle(x, y, HOUSING_W, HOUSING_H)}
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
  const { x, y } = placementOf(spec);
  return (
    <SwitchView
      spec={spec}
      state={state}
      style={overlayStyle(x, y, HOUSING_W, HOUSING_H)}
      selected={false}
      uneditable={editing}
      ariaLabel={editing ? "Preset button (not programmable)" : `Preset button (${hint})`}
      title={`Preset: ${hint}`}
      pressProps={pressProps}
    />
  );
}

function Display({ display }: { display: DisplayState }) {
  return (
    <g transform={`translate(${colX(DISPLAY_COL)} ${ROW_Y.back})`} aria-live="polite">
      <rect width={HOUSING_W} height={130} rx={8} fill="#060606" stroke="#000" strokeWidth={4} />
      <g
        fill={DISPLAY_RED}
        filter="url(#display-glow)"
        fontFamily={DISPLAY_FONT}
        fontStyle="italic"
        fontSize={38}
        letterSpacing={2}
        textAnchor="middle"
      >
        <text x={HOUSING_W / 2} y={56} style={{ whiteSpace: "pre" }}>
          {display.line1}
        </text>
        <text
          x={HOUSING_W / 2}
          y={108}
          className={display.line2Blinking ? "pacer-blink" : undefined}
          data-testid="display-line2"
        >
          {display.line2}
        </text>
      </g>
      <g transform={`translate(${HOUSING_W / 2} 196)`}>
        <circle r={50} fill="#151517" stroke="#000" strokeWidth={3} />
        <circle r={44} fill="none" stroke="#2c2c30" strokeWidth={6} strokeDasharray="3 4" />
        <circle r={32} fill="#1d1d20" />
      </g>
    </g>
  );
}

/** Printed faceplate markings below each switch, from the hardware spec. */
function Marking({ spec }: { spec: SwitchSpec }) {
  if (!spec.marking) return null;
  const { x, y } = placementOf(spec);
  const cx = x + HOUSING_W / 2;
  if (spec.marking === "badge") {
    return (
      <g transform={`translate(${cx} ${y + MARKING_DY})`}>
        <circle r={15} fill="#5fa99b" />
        <text
          dy={6}
          fontSize={17}
          fontWeight={700}
          fill="#1c2b28"
          textAnchor="middle"
          fontFamily="ui-sans-serif, system-ui"
        >
          {spec.name}
        </text>
      </g>
    );
  }
  return (
    <text
      x={cx}
      y={y + MARKING_DY + 8}
      fontSize={22}
      fontWeight={700}
      fill="#d4d4d8"
      textAnchor="middle"
      fontFamily="ui-sans-serif, system-ui"
    >
      {spec.name}
    </text>
  );
}

/** The app's own annotation of what a press would do: not something the hardware shows. */
function Hint({ spec, hint }: { spec: SwitchSpec; hint: string | undefined }) {
  if (!hint) return null;
  const { x, y } = placementOf(spec);
  return (
    <text
      x={x + HOUSING_W / 2}
      y={y + HINT_DY}
      fontSize={17}
      fontStyle="italic"
      fill={HINT_COLOR}
      textAnchor="middle"
      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
    >
      {hint.length > 20 ? `${hint.slice(0, 19)}…` : hint}
    </text>
  );
}

const PANEL_SWITCHES: readonly SwitchSpec[] = [...panelRow("back"), ...panelRow("front")];

const DISPLAY_BOX = { w: HOUSING_W, h: 130 };

/**
 * The preset's name, edited on the display itself: in Edit mode the display takes a pencil badge,
 * and tapping it turns into a 5-character field over the same spot.
 */
function DisplayNameEditor() {
  const presetIndex = usePacerStore((s) => s.board.activePresetIndex);
  const name = usePacerStore((s) => s.board.config.presets[s.board.activePresetIndex]?.name ?? "");
  const applyEdit = usePacerStore((s) => s.applyEdit);
  const [draft, setDraft] = useState<string>();
  const style = overlayStyle(colX(DISPLAY_COL), ROW_Y.back, DISPLAY_BOX.w, DISPLAY_BOX.h);
  const commit = () => {
    if (draft !== undefined && draft.trimEnd() !== name.trimEnd())
      applyEdit((c) => renamePreset(c, presetIndex, draft));
    setDraft(undefined);
  };

  if (draft === undefined) {
    return (
      <button
        type="button"
        className="absolute rounded-[4%] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        style={style}
        title={`Rename preset ${presetIndexToLabel(presetIndex)}`}
        aria-label={`Rename preset ${presetIndexToLabel(presetIndex)} (currently ${name.trim() || "unnamed"})`}
        onClick={() => setDraft(name.trimEnd())}
      >
        <EditBadge />
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      maxLength={PRESET_NAME_LENGTH}
      aria-label={`Preset ${presetIndexToLabel(presetIndex)} name`}
      className="absolute rounded-[4%] border-2 border-primary bg-black text-center text-[#ff3322] uppercase outline-none"
      style={{ ...style, fontFamily: DISPLAY_FONT, fontStyle: "italic", fontSize: "min(3.4vw, 2rem)" }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(undefined);
      }}
    />
  );
}

export function Faceplate() {
  const editing = usePacerStore((s) => s.uiMode === "edit");
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

  return (
    <div
      className="relative w-full touch-none rounded-[2%] select-none"
      style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
      role="group"
      aria-label={editing ? "Pacer faceplate (editing: tap a switch to program it)" : "Pacer faceplate"}
    >
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="absolute inset-0 size-full">
        <defs>
          <filter id="led-glow" x="-30%" y="-200%" width="160%" height="500%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="legend-glow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="display-glow" x="-10%" y="-30%" width="120%" height="160%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width={WIDTH} height={HEIGHT} rx={28} fill="#3a3b3e" />
        <rect
          x={12}
          y={12}
          width={WIDTH - 24}
          height={HEIGHT - 24}
          rx={20}
          fill="none"
          stroke="#5fa99b"
          strokeWidth={3}
          opacity={0.8}
        />
        {PANEL_SWITCHES.map((spec) => (
          <Marking key={spec.id} spec={spec} />
        ))}
        {PANEL_SWITCHES.map((spec) => (
          <Hint key={spec.id} spec={spec} hint={hints.get(spec.id)} />
        ))}
        <Display display={panel.display} />
      </svg>

      {editing && <DisplayNameEditor />}
      {PANEL_SWITCHES.map((spec) =>
        spec.kind === "presetSwitch" ? (
          <PresetPanelSwitch key={spec.id} spec={spec} state={panel.switches[spec.id]} hint={hints.get(spec.id)} />
        ) : spec.controlId !== undefined ? (
          <StompPanelSwitch
            key={spec.id}
            spec={spec}
            controlId={spec.controlId}
            state={panel.switches[spec.id]}
            hint={hints.get(spec.id)}
          />
        ) : null,
      )}
    </div>
  );
}
