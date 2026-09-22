import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { usePacerStore } from "./store/pacerStore";
import { ConfigurationsPanel } from "./ui/ConfigurationsPanel";
import { Faceplate } from "./ui/panel/Faceplate";
import { RearJacks } from "./ui/RearJacks";
import { EditToolbar } from "./ui/editor/EditToolbar";
import { SwitchEditorView } from "./ui/editor/SwitchEditorView";
import { Inspector } from "./ui/Inspector";
import { MessageLog } from "./ui/MessageLog";
import { MidiOutputControl } from "./ui/MidiOutputControl";
import { PresetList } from "./ui/PresetList";

/** Panels that support the work but aren't it: kept together so the faceplate and editor own the width. */
function SupportPanels({ sessionId }: { sessionId: number }) {
  return (
    <Tabs defaultSelectedKey="log" className="min-h-0">
      <TabList aria-label="Panels">
        <Tab id="log">Output log</Tab>
        <Tab id="inspector">Inspector</Tab>
        <Tab id="presets">Presets</Tab>
        <Tab id="configs">Configurations</Tab>
      </TabList>
      <TabPanel id="log" className="min-h-64">
        <MessageLog />
      </TabPanel>
      <TabPanel id="inspector" className="rounded-lg border bg-card p-3">
        <Inspector />
      </TabPanel>
      <TabPanel id="presets">
        <PresetList key={sessionId} />
      </TabPanel>
      <TabPanel id="configs">
        <ConfigurationsPanel />
      </TabPanel>
    </Tabs>
  );
}

export function App() {
  const configSource = usePacerStore((s) => s.configSource);
  const sessionId = usePacerStore((s) => s.sessionId);
  const uiMode = usePacerStore((s) => s.uiMode);
  const selectedControlId = usePacerStore((s) => s.selectedControlId);
  const resetMidiState = usePacerStore((s) => s.resetMidiState);
  // Programming a control takes over the faceplate's space: the faceplate is the overview, and a
  // switch's settings need the width more than the picture does.
  const programming = uiMode === "edit" && selectedControlId !== undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
        <h1 className="text-base font-semibold">Pacer Programmer</h1>
        <Badge variant="outline" className="font-mono">
          {configSource}
        </Badge>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <EditToolbar />
          <MidiOutputControl />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-4 p-4">
        {/* Simulator views are keyed on the session, so a configuration switch remounts them. */}
        <Fragment key={`sim-${sessionId}`}>
          {programming ? (
            <SwitchEditorView controlId={selectedControlId} />
          ) : (
            <>
              {/* Scales down to fit, then scrolls: below this the switches get too small to hit. */}
              {/* The padding holds Edit mode's badges, which overhang their controls: reserved in
                  both modes so switching doesn't shift the layout or raise a scrollbar. */}
              <div className="overflow-x-auto overflow-y-hidden">
                <div className="min-w-[900px] space-y-3 px-3 pt-1 pb-4">
                  <Faceplate />
                  {/* Rear-jack controls are part of the hardware, so they stay with the faceplate. */}
                  <RearJacks />
                </div>
              </div>
              {uiMode === "edit" && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/50 bg-primary/5 p-3">
                  <Badge>Edit mode</Badge>
                  <span className="text-sm text-muted-foreground">
                    Tap a ✎ control to program it, or the display to rename the preset.
                  </span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Button size="sm" variant="outline" onPress={resetMidiState}>
                  Reset MIDI state
                </Button>
                <span>
                  The Pacer remembers the last program, CC values and notes it sent (they light switches across
                  presets). This forgets them.
                </span>
              </div>
            </>
          )}
        </Fragment>
        <SupportPanels sessionId={sessionId} />
      </main>
    </div>
  );
}
