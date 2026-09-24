import { Button } from "@/components/ui/button";
import { usePacerStore } from "../store/pacerStore";
import { PortSelect } from "./PortSelect";

/*
 * Web MIDI access is one grant for the whole app, so asking for it belongs in the header — but
 * where the MIDI *goes* is per mode. Simulate sends out to the rig (`MidiOutputSelect`, below);
 * programming talks to the Pacer through `pacerPorts`, which the device controls own. Keeping
 * those two apart is the point of the reorganization (see CLAUDE.md).
 */

/** Header control: asks for MIDI access, and shows nothing once it's granted. */
export function MidiAccessControl() {
  const status = usePacerStore((s) => s.midi.status);
  const error = usePacerStore((s) => s.midi.error);
  const connectMidi = usePacerStore((s) => s.connectMidi);

  switch (status) {
    case "disconnected":
    case "connecting":
      return (
        <Button
          variant="outline"
          size="sm"
          isDisabled={status === "connecting"}
          title="Ask the browser for MIDI access, so simulated presses can reach real gear and the Pacer can be read and written"
          onPress={() => void connectMidi()}
        >
          {status === "connecting" ? "Connecting…" : "Connect MIDI"}
        </Button>
      );
    case "unsupported":
      return (
        <span className="text-xs text-warning">Web MIDI isn't available in this browser (use Chrome or Edge).</span>
      );
    case "denied":
      return (
        <span className="flex items-center gap-2 text-xs text-warning">
          MIDI access denied{error ? `: ${error}` : ""}
          <Button variant="ghost" size="sm" title="Ask for MIDI access again" onPress={() => void connectMidi()}>
            Retry
          </Button>
        </span>
      );
    case "connected":
      return null;
  }
}

/** Simulate mode's context bar: where the simulator's own MIDI goes. Not the Pacer's ports. */
export function MidiOutputSelect() {
  const midi = usePacerStore((s) => s.midi);
  const selectMidiOutput = usePacerStore((s) => s.selectMidiOutput);
  if (midi.status !== "connected") return null;

  return (
    <span className="flex items-center gap-2">
      <PortSelect
        label="Output to"
        ports={midi.outputs}
        value={midi.outputId}
        onChange={selectMidiOutput}
        noneLabel="Don't send"
      />
      {midi.outputs.length === 0 && <span className="text-xs text-muted-foreground">no outputs found</span>}
      {!midi.sysexEnabled && (
        <span className="text-xs text-warning" title="MMC messages are SysEx and need the SysEx permission">
          SysEx off
        </span>
      )}
    </span>
  );
}
