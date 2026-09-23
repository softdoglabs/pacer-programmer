import { useState } from "react";
import { Button, Dialog, DialogTrigger, Popover, Radio, RadioGroup } from "react-aria-components";
import { Titled } from "@/components/ui/titled";
import { ToggleGroup } from "@/components/ui/toggle-group";
import {
  LED_COLOR_DEFAULT,
  LED_COLOR_OFF,
  PACER_HUES,
  decodeLedColor,
  ledColorCode,
  ledColorName,
} from "../../pacer/protocol/ledColors";
import { colorCodeCss } from "../panel/palette";

type Brightness = "bright" | "dim";

/** The trigger has one line: Default's "(message type color)" gloss belongs in the popover, not here. */
function triggerName(code: number): string {
  return code === LED_COLOR_DEFAULT ? "Default" : ledColorName(code);
}

const SWATCH_CLASS =
  "grid size-9 cursor-pointer place-items-center rounded-full border border-white/15 text-[10px] font-semibold ring-focus outline-none data-[selected]:ring-2 data-[selected]:ring-offset-2 data-[selected]:ring-offset-popover data-[selected]:ring-foreground";

function HueSwatch({ code }: { code: number }) {
  return (
    <Radio
      value={String(code)}
      aria-label={ledColorName(code)}
      className={SWATCH_CLASS}
      style={{ background: colorCodeCss(code) }}
    />
  );
}

/** Default and Off have no bright/dim variant, so they're named chips rather than swatches. */
function ColorChip({ code, label }: { code: number; label: string }) {
  return (
    <Radio
      value={String(code)}
      aria-label={ledColorName(code)}
      className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs ring-focus outline-none data-[selected]:border-foreground data-[selected]:font-semibold"
    >
      <span
        aria-hidden
        className="size-4 rounded-full border border-white/15"
        style={{ background: code === LED_COLOR_OFF ? "transparent" : colorCodeCss(code) }}
      />
      {label}
    </Radio>
  );
}

/**
 * Picks a Pacer LED color code. The trigger shows the current color, and the popover offers the 12
 * hues once — a Bright/Dim toggle switches which variant of them you're choosing, since a hue and
 * its dim twin are one decision on the hardware ("A" and "b" of the same number), not two colors.
 * Default (the message type's own hue) and Off sit below as named chips.
 */
export function LedColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (code: number) => void;
}) {
  const decoded = decodeLedColor(value);
  const [browsing, setBrowsing] = useState<Brightness>("bright");
  // With a hue chosen, the swatches show that hue's brightness, so the chosen color is the
  // selected swatch. Default/Off have no brightness, so the toggle only says which band to browse.
  const brightness = decoded.kind === "hue" ? decoded.brightness : browsing;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <DialogTrigger>
        <Titled title={`${label} — currently ${ledColorName(value)}`}>
          <Button
            aria-label={`${label}: ${ledColorName(value)}`}
            className="flex h-9 w-full max-w-56 min-w-40 cursor-pointer items-center gap-2 rounded-md border bg-card px-3 text-sm ring-focus outline-none data-[hovered]:bg-accent"
          >
            <span
              aria-hidden
              className="size-4 shrink-0 rounded-full border border-white/15"
              style={{ background: value === LED_COLOR_OFF ? "transparent" : colorCodeCss(value) }}
            />
            <span className="truncate">{triggerName(value)}</span>
            <span aria-hidden className="ml-auto text-muted-foreground">
              ▾
            </span>
          </Button>
        </Titled>
        <Popover className="rounded-md border bg-popover p-3 shadow-lg">
          <Dialog aria-label={`${label} — choose a color`} className="space-y-3 outline-none">
            {({ close }) => (
              <>
                <ToggleGroup
                  label="Brightness"
                  options={[
                    { id: "bright", label: "Bright" },
                    { id: "dim", label: "Dim" },
                  ]}
                  value={brightness}
                  onChange={(next: Brightness) => {
                    setBrowsing(next);
                    // Switching brightness on a chosen hue is the shortcut: same hue, other variant.
                    if (decoded.kind === "hue") onChange(ledColorCode(decoded.hue, next));
                  }}
                />
                <RadioGroup
                  aria-label={label}
                  value={String(value)}
                  onChange={(v) => {
                    onChange(Number(v));
                    close();
                  }}
                  className="space-y-2"
                >
                  <div className="grid grid-cols-6 gap-2">
                    {PACER_HUES.map((hue) => (
                      <HueSwatch key={hue} code={ledColorCode(hue, brightness)} />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <ColorChip code={LED_COLOR_DEFAULT} label="Default" />
                    <ColorChip code={LED_COLOR_OFF} label="Off" />
                  </div>
                </RadioGroup>
              </>
            )}
          </Dialog>
        </Popover>
      </DialogTrigger>
    </div>
  );
}
