import { ChevronDown, Usb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { usePacerStore } from "../store/pacerStore";
import { ConfigurationsPanel } from "./ConfigurationsPanel";

/*
 * Everything about the physical Pacer and the library of snapshots lives in one drawer: pulling,
 * importing, the device's MIDI ports, its firmware, and the saved configurations. All of it is
 * occasional — you visit it, you don't work in it — so it holds no permanent screen space. Two
 * things open it, and both are ordinary buttons rather than decoration: the open configuration's
 * name, and the device status in the header's right-hand slot.
 *
 * Whether it's open is session state (see `freshSession`), so loading a configuration closes it as
 * a consequence of the session changing rather than through separate bookkeeping.
 */

function useOpenDrawer() {
  const setOpen = usePacerStore((s) => s.setDeviceDrawerOpen);
  return () => setOpen(true);
}

/** Header: the open configuration's name, which opens the drawer at its list. */
export function ConfigurationButton() {
  const configSource = usePacerStore((s) => s.configSource);
  const open = useOpenDrawer();
  return (
    <Button
      size="sm"
      variant="outline"
      className="font-mono"
      title="Open configurations and the Pacer connection"
      onPress={open}
    >
      {configSource}
      <ChevronDown aria-hidden className="size-3.5 opacity-60" />
    </Button>
  );
}

/**
 * Header: whether the app can talk to the Pacer. It takes the same slot the "Connect MIDI" button
 * occupied, so granting access turns the question into its answer instead of leaving a gap.
 */
export function DeviceStatusButton() {
  const found = usePacerStore((s) => s.pacerPorts.inputId !== undefined && s.pacerPorts.outputId !== undefined);
  const open = useOpenDrawer();
  return (
    <Button
      size="sm"
      variant="outline"
      title={
        found
          ? "The Pacer's MIDI ports are chosen, so it can be pulled from and written to. Opens the device panel."
          : "No Pacer port is chosen, so it can't be pulled from or written to. Opens the device panel to pick them."
      }
      onPress={open}
    >
      <Usb aria-hidden className="size-4" />
      <span className={found ? "text-success" : "text-warning"}>{found ? "Pacer connected" : "No Pacer found"}</span>
      <ChevronDown aria-hidden className="size-3.5 opacity-60" />
    </Button>
  );
}

export function DeviceDrawer() {
  const isOpen = usePacerStore((s) => s.deviceDrawerOpen);
  const setOpen = usePacerStore((s) => s.setDeviceDrawerOpen);
  return (
    <Drawer isOpen={isOpen} onOpenChange={setOpen} title="Device & configurations">
      <ConfigurationsPanel />
    </Drawer>
  );
}
