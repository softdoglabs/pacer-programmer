import { Label, Radio, RadioGroup } from "react-aria-components";
import { LED_COLOR_DEFAULT, LED_COLOR_OFF, PACER_HUES, ledColorName } from "../../pacer/protocol/ledColors";
import { colorCodeCss } from "../panel/palette";

const HUE_CODES = PACER_HUES.map((_, i) => ({ bright: 1 + i * 2, dim: 2 + i * 2 }));

function Swatch({ code, label }: { code: number; label?: string }) {
  const css = colorCodeCss(code);
  return (
    <Radio
      value={String(code)}
      aria-label={ledColorName(code)}
      className="grid size-8 cursor-pointer place-items-center rounded-full border border-white/15 text-[10px] font-semibold text-muted-foreground ring-focus outline-none data-[selected]:ring-2 data-[selected]:ring-foreground"
      style={{ background: css === "transparent" ? undefined : css }}
    >
      {label}
    </Radio>
  );
}

/**
 * Picks a Pacer LED color code: every hue in its bright ("A") and dim ("b") variant, plus Default
 * (the message type's color) and Off. All choices are visible at once; no popover.
 */
export function SwatchPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (code: number) => void;
}) {
  return (
    <RadioGroup
      value={String(value)}
      onChange={(v) => onChange(Number(v))}
      orientation="horizontal"
      className="flex flex-col gap-1"
    >
      <Label className="text-xs text-muted-foreground">
        {label}: <span className="text-foreground">{ledColorName(value)}</span>
      </Label>
      <div className="flex flex-wrap items-start gap-1.5">
        <div className="flex flex-col gap-1.5">
          <Swatch code={LED_COLOR_DEFAULT} label="Def" />
          <Swatch code={LED_COLOR_OFF} label="Off" />
        </div>
        {/* Two bands of six hues, each hue's bright ("A") over its dim ("b") variant: fits a narrow panel. */}
        {[HUE_CODES.slice(0, 6), HUE_CODES.slice(6)].map((band, i) => (
          <div key={i} className="grid grid-flow-col grid-rows-2 gap-1.5">
            {band.flatMap(({ bright, dim }) => [
              <Swatch key={bright} code={bright} />,
              <Swatch key={dim} code={dim} />,
            ])}
          </div>
        ))}
      </div>
    </RadioGroup>
  );
}
