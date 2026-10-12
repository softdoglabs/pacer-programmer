// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { Button } from "@/components/ui/button";
import { usePacerStore } from "../store/pacerStore";
import { EditingBar } from "./editor/EditingBar";
import { MidiOutputSelect } from "./MidiControls";
import { PresetChooserButton } from "./PresetChooser";

/**
 * The row under the mode bar, holding only the controls the current mode needs. Simulate gets the
 * simulator's own MIDI output and its remembered-value reset; Program and the preset map, which
 * both edit the working configuration, get undo/save/send. That split is what keeps "send to the
 * rig" and "talk to the Pacer" from being confused for each other — see "Planned UI
 * reorganization" in CLAUDE.md.
 */
export function ContextBar() {
  const uiMode = usePacerStore((s) => s.uiMode);
  const resetMidiState = usePacerStore((s) => s.resetMidiState);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2">
      {uiMode === "map" ? (
        <>
          {/* No faceplate here, so the preset lives on a button rather than on the display. */}
          <PresetChooserButton />
          {/* The map reroutes states, so it carries the same editing controls Program does. */}
          <EditingBar />
          <span className="text-xs text-muted-foreground">
            Presets that behave alike are one state; {"\u21A9\uFE0E"} marks a jump back to whatever entered it.
          </span>
        </>
      ) : uiMode === "simulate" ? (
        <>
          <MidiOutputSelect />
          <Button
            size="sm"
            variant="outline"
            title="Forget the programs, CC values and notes the simulator has sent, so switches light as they would from a fresh start"
            onPress={resetMidiState}
          >
            Reset MIDI state
          </Button>
          <span className="text-xs text-muted-foreground">
            Switches light from the values the Pacer last sent; this forgets them.
          </span>
        </>
      ) : (
        <EditingBar />
      )}
    </div>
  );
}
