import { Button } from "@/components/ui/button";
import { isSendingToPacer, type DeviceInfoView } from "../../store/configurationsSlice";
import { usePacerStore } from "../../store/pacerStore";
import { PortSelect } from "../PortSelect";
import { describeIdentity } from "./describe";

export function DeviceInfo({ info }: { info: DeviceInfoView }) {
  switch (info.kind) {
    case "unknown":
      return null;
    case "querying":
      return <span className="text-xs text-muted-foreground">Asking the Pacer…</span>;
    case "identified":
      return <span className="text-xs">{describeIdentity(info.identity)}</span>;
    case "noReply":
      return (
        <span className="text-xs text-muted-foreground">
          The Pacer didn't answer a MIDI Device Inquiry, so its firmware version isn't available.
        </span>
      );
    case "error":
      return <span className="text-xs text-destructive">{info.message}</span>;
  }
}

/** Offers bytes as a file download. */

export function PullControls() {
  const midi = usePacerStore((s) => s.midi);
  const pacerPorts = usePacerStore((s) => s.pacerPorts);
  const pull = usePacerStore((s) => s.pull);
  const selectPacerPorts = usePacerStore((s) => s.selectPacerPorts);
  const cancelPull = usePacerStore((s) => s.cancelPull);
  const deviceInfo = usePacerStore((s) => s.deviceInfo);
  const checkFirmware = usePacerStore((s) => s.checkFirmware);
  const sending = usePacerStore(isSendingToPacer);

  if (midi.status !== "connected") {
    return (
      <p className="text-xs text-muted-foreground">Connect MIDI (top right) to pull a configuration from a Pacer.</p>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">Pacer ports:</span>
        <PortSelect
          label="in"
          ports={midi.inputs}
          value={pacerPorts.inputId}
          onChange={(inputId) => selectPacerPorts({ inputId })}
          noneLabel="—"
        />
        <PortSelect
          label="out"
          ports={midi.outputs}
          value={pacerPorts.outputId}
          onChange={(outputId) => selectPacerPorts({ outputId })}
          noneLabel="—"
        />
        {(!pacerPorts.inputId || !pacerPorts.outputId) && (
          <span className="text-xs text-warning">No Pacer found; connect it over USB or pick its ports.</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="ghost"
          isDisabled={!pacerPorts.inputId || !pacerPorts.outputId || deviceInfo.kind === "querying" || sending}
          onPress={() => void checkFirmware()}
        >
          Check firmware
        </Button>
        <DeviceInfo info={deviceInfo} />
      </div>
      {!midi.sysexEnabled && (
        <p className="text-xs text-warning">Pulling needs the SysEx permission, which wasn't granted.</p>
      )}
      {pull.status === "pulling" && (
        <div className="flex items-center gap-3">
          <progress className="h-2 flex-1" max={pull.expected} value={pull.received} aria-label="Pull progress" />
          <span className="text-xs tabular-nums text-muted-foreground">
            {pull.received} / {pull.expected}
          </span>
          <Button size="sm" variant="ghost" onPress={cancelPull}>
            Cancel
          </Button>
        </div>
      )}
      {pull.status === "error" && <p className="text-xs text-destructive">{pull.error}</p>}
    </div>
  );
}
