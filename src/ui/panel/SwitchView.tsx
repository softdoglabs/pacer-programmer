import type { CSSProperties, DOMAttributes } from "react";
import type { IndicatorSpec, SwitchSpec } from "@/pacer/hardware";
import type { SwitchPanelState } from "@/pacer/panel";
import { IconGlyph } from "./icons";
import { paintLight } from "./palette";

/** Housing size in the switch's own SVG units. */
export const HOUSING_W = 196;
export const HOUSING_H = 236;

/** The printed legend window; legend rows (text/icons) share it evenly, top to bottom. */
const LEGEND = { x: 12, y: 12, w: HOUSING_W - 24, h: 70 };
const BAR = { x: 20, y: 92, w: HOUSING_W - 40, h: 10 };

function LegendRow({
  indicator,
  state,
  y,
  rows,
}: {
  indicator: IndicatorSpec;
  state: SwitchPanelState;
  y: number;
  rows: number;
}) {
  const paint = paintLight(state.lights[indicator.id], indicator);
  const filter = paint.glow ? "url(#legend-glow)" : undefined;
  const className = paint.flashing ? "pacer-led-flash" : undefined;
  const face = indicator.face;

  if (face.kind === "text") {
    const size = rows > 1 ? 19 : face.text.length > 7 ? 20 : 24;
    return (
      <text
        x={HOUSING_W / 2}
        y={y}
        dy="0.35em"
        textAnchor="middle"
        fontSize={size}
        fontWeight={700}
        fontFamily="ui-sans-serif, system-ui"
        fill={paint.fill}
        filter={filter}
        className={className}
      >
        {face.text}
      </text>
    );
  }
  if (face.kind === "icons") {
    const scale = rows > 1 ? 0.95 : 1.25;
    const spacing = 30 * scale;
    const x0 = HOUSING_W / 2 - ((face.icons.length - 1) * spacing) / 2;
    return (
      <g filter={filter} className={className}>
        {face.icons.map((icon, i) => (
          <g key={`${icon}-${i}`} transform={`translate(${x0 + i * spacing} ${y}) scale(${scale})`}>
            <IconGlyph icon={icon} fill={paint.fill} />
          </g>
        ))}
      </g>
    );
  }
  return null;
}

function Bar({ indicator, state }: { indicator: IndicatorSpec; state: SwitchPanelState }) {
  const paint = paintLight(state.lights[indicator.id], indicator);
  return (
    <>
      <rect
        x={BAR.x}
        y={BAR.y}
        width={BAR.w}
        height={BAR.h}
        rx={BAR.h / 2}
        fill={paintLight(undefined, indicator).fill}
      />
      <rect
        x={BAR.x}
        y={BAR.y}
        width={BAR.w}
        height={BAR.h}
        rx={BAR.h / 2}
        fill={paint.fill}
        filter={paint.glow ? "url(#led-glow)" : undefined}
        className={paint.flashing ? "pacer-led-flash" : undefined}
      />
    </>
  );
}

export interface SwitchViewProps {
  spec: SwitchSpec;
  state: SwitchPanelState;
  /** Where the housing sits over the faceplate background (see Faceplate's overlayStyle). */
  style: CSSProperties;
  selected: boolean;
  ariaLabel: string;
  title: string;
  /** From React Aria's `usePress`. */
  pressProps: DOMAttributes<HTMLButtonElement>;
}

/**
 * One physical switch, rendered from its hardware spec (which lights it has, what's printed on
 * them) and its current panel state (what's lit). Knows nothing about presets or modes.
 */
export function SwitchView({ spec, state, style, selected, ariaLabel, title, pressProps }: SwitchViewProps) {
  const legendRows = spec.indicators.filter((i) => i.face.kind !== "bar");
  const bar = spec.indicators.find((i) => i.face.kind === "bar");
  const barLight = bar ? state.lights[bar.id] : undefined;

  return (
    <button
      type="button"
      className="pacer-switch absolute rounded-[7%] p-0"
      style={style}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={state.pressed}
      data-pressed={state.pressed}
      data-selected={selected}
      data-led={barLight?.brightness ?? "off"}
      data-led-flashing={barLight?.flashing ?? false}
      {...pressProps}
    >
      <svg viewBox={`0 0 ${HOUSING_W} ${HOUSING_H}`} className="block size-full" aria-hidden>
        <rect
          className="housing"
          width={HOUSING_W}
          height={HOUSING_H}
          rx={14}
          fill="#111113"
          stroke="#000"
          strokeWidth={4}
        />
        <rect x={LEGEND.x} y={LEGEND.y} width={LEGEND.w} height={LEGEND.h} rx={6} fill="#050506" />
        {legendRows.map((indicator, i) => (
          <LegendRow
            key={indicator.id}
            indicator={indicator}
            state={state}
            rows={legendRows.length}
            y={LEGEND.y + (LEGEND.h * (i + 0.5)) / legendRows.length}
          />
        ))}
        {bar && <Bar indicator={bar} state={state} />}
        <g className="pad">
          <rect
            x={22}
            y={114}
            width={HOUSING_W - 44}
            height={108}
            rx={12}
            fill={state.pressed ? "#141416" : "#1d1d20"}
            stroke="#000"
            strokeWidth={3}
          />
          <rect x={34} y={126} width={HOUSING_W - 68} height={84} rx={9} fill={state.pressed ? "#1a1a1d" : "#27272b"} />
        </g>
      </svg>
    </button>
  );
}
