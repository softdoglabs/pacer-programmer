import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { usePacerStore } from "./store/pacerStore";
import { Faceplate } from "./ui/panel/Faceplate";
import { RearJacks } from "./ui/RearJacks";
import { ContextBar } from "./ui/ContextBar";
import { ConfigurationButton, DeviceDrawer } from "./ui/DeviceDrawer";
import { SwitchEditorView } from "./ui/editor/SwitchEditorView";
import { FirmwareModeNote } from "./ui/FirmwareModeNote";
import { MessageLog } from "./ui/MessageLog";
import { PresetPanel } from "./ui/PresetPanel";
import { MidiAccessControl } from "./ui/MidiControls";
import { ModeBar } from "./ui/ModeBar";

/** Panels that support the work but aren't it: kept together so the faceplate and editor own the width. */
function SupportPanels() {
  return (
    <Tabs defaultSelectedKey="log" className="min-h-0">
      <TabList aria-label="Panels">
        <Tab id="log">Output log</Tab>
      </TabList>
      <TabPanel id="log" className="min-h-64">
        <MessageLog />
      </TabPanel>
    </Tabs>
  );
}

export function App() {
  const sessionId = usePacerStore((s) => s.sessionId);
  const uiMode = usePacerStore((s) => s.uiMode);
  const selectedControlId = usePacerStore((s) => s.selectedControlId);
  // Programming a control takes over the faceplate's space: the faceplate is the overview, and a
  // switch's settings need the width more than the picture does.
  const programming = uiMode === "program" && selectedControlId !== undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <h1 className="text-base font-semibold">Pacer Programmer</h1>
        <ConfigurationButton />
        <ModeBar />
        {/* MIDI access is one grant for the whole app, so it's asked for here, not per mode. */}
        {/* The device slot: asks for MIDI access, then shows whether the Pacer is there. */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <MidiAccessControl />
        </div>
      </header>
      <ContextBar />
      <DeviceDrawer />

      <main className="mx-auto flex w-full max-w-[var(--page-max)] flex-1 flex-col gap-4 p-4">
        {/* Simulator views are keyed on the session, so a configuration switch remounts them. */}
        <Fragment key={`sim-${sessionId}`}>
          {programming ? (
            <SwitchEditorView controlId={selectedControlId} />
          ) : (
            <>
              {/* Scales down to fit, then scrolls: below this the switches get too small to hit. */}
              {/* `badge-room` keeps space for Edit mode's overhanging badges, in both modes, so
                  switching doesn't shift the layout or raise a scrollbar (see index.css). */}
              <FirmwareModeNote />
              <div className="overflow-x-auto overflow-y-hidden">
                <div className="badge-room min-w-[var(--faceplate-min)] space-y-3">
                  <Faceplate />
                  {/* Rear-jack controls are part of the hardware, so they stay with the faceplate. */}
                  <RearJacks />
                </div>
              </div>
              {uiMode === "program" && (
                <>
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/50 bg-primary/5 p-3">
                    <Badge>Program mode</Badge>
                    <span className="text-sm text-muted-foreground">
                      Tap a ✎ control to program it, or the display to rename the preset.
                    </span>
                  </div>
                  {/* Preset-level config, so it sits with the faceplate rather than in a switch's editor. */}
                  <PresetPanel />
                </>
              )}
            </>
          )}
        </Fragment>
        <SupportPanels />
      </main>
    </div>
  );
}
