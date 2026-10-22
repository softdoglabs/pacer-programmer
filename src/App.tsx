// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { usePacerStore } from "./store/pacerStore";
import { Faceplate } from "./ui/panel/Faceplate";
import { FaceplateDefs } from "./ui/panel/FaceplateDefs";
import { RearJacks } from "./ui/RearJacks";
import { useAppHistory } from "./ui/appHistory";
import { AppTitle } from "./ui/AppTitle";
import { ContextBar } from "./ui/ContextBar";
import { ConfigurationButton, DeviceDrawer } from "./ui/DeviceDrawer";
import { DocsLink } from "./ui/DocsLink";
import { SourceLink } from "./ui/SourceLink";
import { SwitchEditorView } from "./ui/editor/SwitchEditorView";
import { FirmwareModeNote } from "./ui/FirmwareModeNote";
import { MessageLog } from "./ui/MessageLog";
import { PresetPanel } from "./ui/PresetPanel";
import { PresetMap } from "./ui/map/PresetMap";
import { MidiAccessControl } from "./ui/MidiControls";
import { ModeBar } from "./ui/ModeBar";

export function App() {
  useAppHistory();
  const sessionId = usePacerStore((s) => s.sessionId);
  const uiMode = usePacerStore((s) => s.uiMode);
  const selectedControlId = usePacerStore((s) => s.selectedControlId);
  // Programming a control takes over the faceplate's space: the faceplate is the overview, and a
  // switch's settings need the width more than the picture does.
  const programming = uiMode === "program" && selectedControlId !== undefined;

  return (
    <div className="flex h-dvh flex-col">
      {/* The switch glow filters, at the app root: a switch is also drawn in the editor, where the
          faceplate isn't on screen, and an element referencing a missing filter isn't drawn at all. */}
      <FaceplateDefs />
      {/* One row where there's room (xl). Narrower, the configuration and the modes move to a row of
          their own beneath, so the device slot keeps the top-right corner instead of wrapping to
          wherever there's space. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <AppTitle />
        <div className="order-3 flex w-full flex-wrap items-center gap-3 xl:order-none xl:w-auto">
          <ConfigurationButton />
          <ModeBar />
        </div>
        {/* MIDI access is one grant for the whole app, so it's asked for here, not per mode. */}
        {/* The device slot: asks for MIDI access, then shows whether the Pacer is there. */}
        <div className="order-2 ml-auto flex flex-wrap items-center gap-2 xl:order-none">
          <DocsLink />
          <SourceLink />
          <MidiAccessControl />
        </div>
      </header>
      <ContextBar />
      <DeviceDrawer />

      <div className="app-scroll flex-1">
        <main className="mx-auto flex w-full max-w-[var(--page-max)] flex-col gap-4 p-4">
          {/* Simulator views are keyed on the session, so a configuration switch remounts them. */}
          <Fragment key={`sim-${sessionId}`}>
            {uiMode === "map" ? (
              <PresetMap />
            ) : programming ? (
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
          {/* What the simulator has sent. The last of the support panels, so it's no longer a tab. */}
          <div className="min-h-64">
            <MessageLog />
          </div>
        </main>
      </div>
    </div>
  );
}
