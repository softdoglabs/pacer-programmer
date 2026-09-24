import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { usePacerStore } from "../store/pacerStore";
import { ConfigurationsPanel } from "./ConfigurationsPanel";

/**
 * Everything about the physical Pacer and the library of snapshots, behind one panel: pulling,
 * importing, the device's MIDI ports, its firmware, and the saved configurations. All of it is
 * occasional — you visit it, you don't work in it — so it doesn't earn permanent screen space.
 * Opened from the header, either by the open configuration's name or by the Pacer status chip.
 */
export function DeviceDrawer() {
  const configSource = usePacerStore((s) => s.configSource);
  const sessionId = usePacerStore((s) => s.sessionId);
  /*
   * Which session it was opened in, rather than a plain boolean. Opening, importing or pulling a
   * configuration starts a new session, so the panel closes itself the moment its job is done and
   * leaves you looking at the faceplate it just loaded — derived, so no effect has to notice.
   */
  const [openedIn, setOpenedIn] = useState<number>();
  const open = openedIn === sessionId;
  const setOpen = (next: boolean) => setOpenedIn(next ? sessionId : undefined);
  const midiConnected = usePacerStore((s) => s.midi.status === "connected");
  const pacerFound = usePacerStore((s) => s.pacerPorts.inputId !== undefined && s.pacerPorts.outputId !== undefined);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="font-mono"
        title="Open configurations and the Pacer connection"
        onPress={() => setOpen(true)}
      >
        {configSource} ▾
      </Button>
      {/* Only once MIDI access is granted: before that the header's Connect MIDI button says more. */}
      {midiConnected && (
        <Button
          size="sm"
          variant="ghost"
          className={pacerFound ? "text-success" : "text-warning"}
          title={
            pacerFound
              ? "The Pacer's MIDI ports are chosen. Open the device panel."
              : "No Pacer port chosen, so it can't be pulled from or written to. Open the device panel to pick them."
          }
          onPress={() => setOpen(true)}
        >
          {pacerFound ? "Pacer ●" : "Pacer not found"}
        </Button>
      )}
      <Drawer isOpen={open} onOpenChange={setOpen} title="Device & configurations">
        <ConfigurationsPanel />
      </Drawer>
    </>
  );
}
