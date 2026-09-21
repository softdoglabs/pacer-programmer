import { ControlId, presetIndexToLabel } from "../pacer/protocol/constants";
import { getControlLedState, getControlDisplayState, ledColor, summarizeControl } from "../pacer/simulator";
import { PRESET_HOLD_MS, SPECIAL_PRESETS } from "../pacer/device";
import { usePacerStore, type DeviceModeView } from "../store/pacerStore";
import { useControlHandlers } from "./useControlHandlers";
import { useHoldHandlers } from "./useHoldHandlers";

/*
 * A schematic, hand-drawn rendering of the Pacer's top panel (landscape, player's view):
 * back row = Preset, A-D, then the display and encoder; front row = 1-6. Proportions are
 * approximate; hit regions are the switch housings themselves.
 */
const WIDTH = 1480;
const HEIGHT = 650;
const COL_X0 = 50;
const COL_PITCH = 236;
const HOUSING_W = 196;
const HOUSING_H = 236;
const BACK_ROW_Y = 40;
const FRONT_ROW_Y = 350;
const LED_OFF = "#26262a";
const DISPLAY_RED = "#ff3322";
const PRESET_BLUE = "#5b8cff";

const colX = (col: number) => COL_X0 + col * COL_PITCH;

const BACK_ROW: { controlId: number; name: string }[] = [
  { controlId: ControlId.StompswitchA, name: "A" },
  { controlId: ControlId.StompswitchB, name: "B" },
  { controlId: ControlId.StompswitchC, name: "C" },
  { controlId: ControlId.StompswitchD, name: "D" },
];

const FRONT_ROW: { controlId: number; name: string }[] = [
  { controlId: ControlId.Stompswitch1, name: "1" },
  { controlId: ControlId.Stompswitch2, name: "2" },
  { controlId: ControlId.Stompswitch3, name: "3" },
  { controlId: ControlId.Stompswitch4, name: "4" },
  { controlId: ControlId.Stompswitch5, name: "5" },
  { controlId: ControlId.Stompswitch6, name: "6" },
];

interface SwitchArtProps {
  x: number;
  y: number;
  name: string;
  legend: string;
  legendColor: string;
  ledCss: string;
  ledGlow: boolean;
  ledBlink?: boolean;
  pressed: boolean;
  selected?: boolean;
  dimmed?: boolean;
  ariaLabel: string;
  handlers: ReturnType<typeof useHoldHandlers>;
  /** Faceplate marking printed below the housing (A-D get a teal badge, 1-6 plain numerals). */
  marking?: { text: string; badge: boolean };
  title: string;
}

function SwitchArt(props: SwitchArtProps) {
  const { x, y, legend, pressed } = props;
  const legendSize = legend.length > 12 ? 15 : legend.length > 8 ? 19 : 24;

  return (
    <g
      className="pacer-switch"
      transform={`translate(${x} ${y})`}
      role="button"
      tabIndex={0}
      aria-label={props.ariaLabel}
      aria-pressed={pressed}
      data-pressed={pressed}
      data-selected={props.selected ?? false}
      opacity={props.dimmed ? 0.55 : 1}
      {...props.handlers}
    >
      <title>{props.title}</title>
      <rect className="housing" width={HOUSING_W} height={HOUSING_H} rx={14} fill="#111113" stroke="#000" strokeWidth={4} />
      <rect x={12} y={12} width={HOUSING_W - 24} height={70} rx={6} fill="#050506" />
      <text x={22} y={32} fontSize={14} fill="#8b8b93" fontFamily="ui-sans-serif, system-ui">
        {props.name}
      </text>
      <text
        x={HOUSING_W / 2}
        y={63}
        textAnchor="middle"
        fontSize={legendSize}
        fontWeight={700}
        fill={props.legendColor}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        {legend}
      </text>
      <rect
        x={20}
        y={92}
        width={HOUSING_W - 40}
        height={10}
        rx={5}
        fill={props.ledCss}
        filter={props.ledGlow ? "url(#led-glow)" : undefined}
        className={props.ledBlink ? "pacer-blink" : undefined}
      />
      <g className="pad">
        <rect x={22} y={114} width={HOUSING_W - 44} height={108} rx={12} fill={pressed ? "#141416" : "#1d1d20"} stroke="#000" strokeWidth={3} />
        <rect x={34} y={126} width={HOUSING_W - 68} height={84} rx={9} fill={pressed ? "#1a1a1d" : "#27272b"} />
      </g>
      {props.marking &&
        (props.marking.badge ? (
          <g transform={`translate(${HOUSING_W / 2} ${HOUSING_H + 28})`}>
            <circle r={15} fill="#5fa99b" />
            <text textAnchor="middle" dy={6} fontSize={17} fontWeight={700} fill="#1c2b28" fontFamily="ui-sans-serif, system-ui">
              {props.marking.text}
            </text>
          </g>
        ) : (
          <text
            x={HOUSING_W / 2}
            y={HOUSING_H + 36}
            textAnchor="middle"
            fontSize={22}
            fontWeight={700}
            fill="#d4d4d8"
            fontFamily="ui-sans-serif, system-ui"
          >
            {props.marking.text}
          </text>
        ))}
    </g>
  );
}

const DAW_LEGEND = "#e8e8ea";
const DAW_LED = "#6b6f78";
const MODE_LED = "#ffbf00";

interface SwitchLook {
  legend: string;
  legendColor: string;
  ledCss: string;
  ledGlow: boolean;
  ledBlink?: boolean;
  dimmed: boolean;
  title: string;
}

/** How a stompswitch looks inside one of the firmware's special presets, which override the user preset's config. */
function specialPresetLook(mode: DeviceModeView, controlId: number, name: string, isBankSwitch: boolean): SwitchLook | undefined {
  if (mode.mode === "presetSelect") {
    const activeBank = isBankSwitch && "ABCD".indexOf(name) === mode.pendingBank;
    const legend = isBankSwitch ? `BANK ${name}` : `${"ABCD"[mode.pendingBank]}${name}`;
    // Per the User Guide, switches 1-6 blink while preset select is active.
    return {
      legend,
      legendColor: PRESET_BLUE,
      ledCss: activeBank || !isBankSwitch ? PRESET_BLUE : LED_OFF,
      ledGlow: activeBank || !isBankSwitch,
      ledBlink: !isBankSwitch,
      dimmed: false,
      title: isBankSwitch ? `Select bank ${name}` : `Load preset ${legend}`,
    };
  }
  if (mode.mode === "track" || mode.mode === "transport") {
    const entry = SPECIAL_PRESETS[mode.mode].switches[controlId];
    if (!entry) return { legend: "—", legendColor: "#55555c", ledCss: LED_OFF, ledGlow: false, dimmed: true, title: "No function" };
    const isCurrentMode = entry.action.kind === "goto" && entry.action.preset === mode.mode;
    return {
      legend: entry.legend,
      legendColor: entry.action.kind === "goto" ? MODE_LED : DAW_LEGEND,
      ledCss: isCurrentMode ? MODE_LED : entry.action.kind === "goto" ? LED_OFF : DAW_LED,
      ledGlow: isCurrentMode,
      dimmed: false,
      title: entry.action.kind === "daw" ? `DAW: ${entry.action.command}` : `Switch to the built-in ${entry.legend} preset`,
    };
  }
  return undefined;
}

function StompSwitch({ controlId, name, col, rowY, badge }: { controlId: number; name: string; col: number; rowY: number; badge: boolean }) {
  const board = usePacerStore((s) => s.board);
  const selected = usePacerStore((s) => s.selectedControlId === controlId);
  const deviceMode = usePacerStore((s) => s.deviceMode);
  const handlers = useControlHandlers(controlId);

  const control = board.config.presets[board.activePresetIndex]?.controls[controlId];
  const display = getControlDisplayState(board, controlId);
  const led = getControlLedState(board, controlId);

  let look = specialPresetLook(deviceMode, controlId, name, badge);
  if (!look) {
    const legend = summarizeControl(control, "switch");
    const stepNote = display.sequencePointer !== undefined ? ` (sequence: next step ${display.sequencePointer})` : "";
    look = {
      legend,
      legendColor: control ? "#f4f4f5" : "#55555c",
      ledCss: led?.colorCode !== undefined ? ledColor(led.colorCode).css : LED_OFF,
      ledGlow: led?.lit ?? false,
      dimmed: !control,
      title: control ? `Switch ${name}: ${legend}${stepNote}` : `Switch ${name}: not configured on this preset`,
    };
  }

  return (
    <SwitchArt
      x={colX(col)}
      y={rowY}
      name={`SW ${name}`}
      legend={look.legend}
      legendColor={look.legendColor}
      ledCss={look.ledCss}
      ledGlow={look.ledGlow}
      ledBlink={look.ledBlink}
      pressed={deviceMode.mode === "user" && display.pressed}
      selected={selected}
      dimmed={look.dimmed}
      ariaLabel={`Switch ${name}: ${look.legend}`}
      title={look.title}
      handlers={handlers}
      marking={{ text: name, badge }}
    />
  );
}

function PresetSwitch() {
  const mode = usePacerStore((s) => s.deviceMode.mode);
  const held = usePacerStore((s) => s.deviceMode.presetButtonDown);
  const lastPreset = usePacerStore((s) => presetIndexToLabel(s.board.activePresetIndex));
  const handlers = useHoldHandlers(usePacerStore((s) => s.presetButtonDown), usePacerStore((s) => s.presetButtonUp));
  const inSpecial = mode !== "user";
  const holdHint = `hold ${PRESET_HOLD_MS / 1000}s: preset select (A-D bank, 1-6 preset)`;
  return (
    <SwitchArt
      x={colX(0)}
      y={BACK_ROW_Y}
      name="PRESET"
      legend="Preset"
      legendColor={PRESET_BLUE}
      ledCss={inSpecial ? PRESET_BLUE : LED_OFF}
      ledGlow={inSpecial}
      pressed={held}
      ariaLabel={inSpecial ? `Preset button (tap: back to ${lastPreset}; ${holdHint})` : `Preset button (${holdHint})`}
      title={inSpecial ? `Preset. Tap: back to ${lastPreset}. Hold ${PRESET_HOLD_MS / 1000}s: preset select.` : `Preset. ${holdHint}.`}
      handlers={handlers}
    />
  );
}

function Display() {
  const board = usePacerStore((s) => s.board);
  const deviceMode = usePacerStore((s) => s.deviceMode);
  const name = board.config.presets[board.activePresetIndex]?.name ?? "";
  const x = colX(5);
  const label = presetIndexToLabel(board.activePresetIndex);

  let line1 = name.padEnd(5, " ").slice(0, 5);
  let line2 = label;
  if (deviceMode.mode === "presetSelect") {
    line1 = "BANK";
    line2 = `${"ABCD"[deviceMode.pendingBank]}-`;
  } else if (deviceMode.mode === "track" || deviceMode.mode === "transport") {
    // Our own choice of display text; the real firmware's isn't documented. Line 2 shows the
    // remembered preset that [Preset] returns to.
    line1 = SPECIAL_PRESETS[deviceMode.mode].displayName;
    line2 = `↩${label}`;
  }

  return (
    <g transform={`translate(${x} ${BACK_ROW_Y})`} aria-live="polite">
      <rect width={HOUSING_W} height={130} rx={8} fill="#060606" stroke="#000" strokeWidth={4} />
      <g fill={DISPLAY_RED} filter="url(#display-glow)" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontWeight={700}>
        <text x={HOUSING_W / 2} y={56} textAnchor="middle" fontSize={40} letterSpacing={4} style={{ whiteSpace: "pre" }}>
          {line1}
        </text>
        <text
          x={HOUSING_W / 2}
          y={108}
          textAnchor="middle"
          fontSize={40}
          letterSpacing={4}
          className={deviceMode.mode === "presetSelect" ? "pacer-blink" : undefined}
          data-testid="display-line2"
        >
          {line2}
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

export function Faceplate() {
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full select-none touch-none" role="group" aria-label="Pacer faceplate">
      <defs>
        <filter id="led-glow" x="-30%" y="-200%" width="160%" height="500%">
          <feGaussianBlur stdDeviation="4" result="blur" />
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
      <rect x={12} y={12} width={WIDTH - 24} height={HEIGHT - 24} rx={20} fill="none" stroke="#5fa99b" strokeWidth={3} opacity={0.8} />

      <PresetSwitch />
      {BACK_ROW.map((sw, i) => (
        <StompSwitch key={sw.controlId} controlId={sw.controlId} name={sw.name} col={i + 1} rowY={BACK_ROW_Y} badge />
      ))}
      <Display />
      {FRONT_ROW.map((sw, i) => (
        <StompSwitch key={sw.controlId} controlId={sw.controlId} name={sw.name} col={i} rowY={FRONT_ROW_Y} badge={false} />
      ))}
    </svg>
  );
}
