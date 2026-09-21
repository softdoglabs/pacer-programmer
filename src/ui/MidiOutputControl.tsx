import { Button } from "@/components/ui/button";
import { usePacerStore } from "../store/pacerStore";

/** Header control: connect Web MIDI, then choose where simulated presses are sent. */
export function MidiOutputControl() {
  const midi = usePacerStore((s) => s.midi);
  const connectMidi = usePacerStore((s) => s.connectMidi);
  const selectMidiOutput = usePacerStore((s) => s.selectMidiOutput);

  switch (midi.status) {
    case "disconnected":
    case "connecting":
      return (
        <Button variant="outline" size="sm" disabled={midi.status === "connecting"} onClick={() => void connectMidi()}>
          {midi.status === "connecting" ? "Connecting…" : "Connect MIDI"}
        </Button>
      );
    case "unsupported":
      return (
        <span className="text-xs text-warning">Web MIDI isn't available in this browser (use Chrome or Edge).</span>
      );
    case "denied":
      return (
        <span className="flex items-center gap-2 text-xs text-warning">
          MIDI access denied{midi.error ? `: ${midi.error}` : ""}
          <Button variant="ghost" size="sm" onClick={() => void connectMidi()}>
            Retry
          </Button>
        </span>
      );
    case "connected":
      return (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">MIDI out</span>
          <select
            className="h-8 rounded-md border bg-card px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={midi.outputId ?? ""}
            onChange={(e) => selectMidiOutput(e.target.value || undefined)}
          >
            <option value="">Don't send</option>
            {midi.outputs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          {midi.outputs.length === 0 && <span className="text-xs text-muted-foreground">no outputs found</span>}
          {!midi.sysexEnabled && (
            <span className="text-xs text-warning" title="MMC messages are SysEx and need the SysEx permission">
              SysEx off
            </span>
          )}
        </label>
      );
  }
}
