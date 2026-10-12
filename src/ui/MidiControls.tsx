// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Soft Dog Labs, LLC

import { Button } from "@/components/ui/button";
import { usePacerStore } from "../store/pacerStore";
import { DeviceStatusButton } from "./DeviceDrawer";
import { PortSelect } from "./PortSelect";

/*
 * Web MIDI access is one grant for the whole app, so asking for it belongs in the header — but
 * where the MIDI *goes* is per mode. Simulate sends out to the rig (`MidiOutputSelect`, below);
 * programming talks to the Pacer through `pacerPorts`, which the device controls own. Keeping
 * those two apart is the point of the reorganization (see CLAUDE.md).
 */

/** The one grant, asked for wherever the lack of it is felt. */
export function ConnectMidiButton() {
  const status = usePacerStore((s) => s.midi.status);
  const connectMidi = usePacerStore((s) => s.connectMidi);
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
}

/**
 * Header control: asks for MIDI access, then hands its slot to the device status, so the question
 * turns into its answer in place.
 */
export function MidiAccessControl() {
  const status = usePacerStore((s) => s.midi.status);
  const error = usePacerStore((s) => s.midi.error);
  const connectMidi = usePacerStore((s) => s.connectMidi);

  switch (status) {
    case "disconnected":
    case "connecting":
      return <ConnectMidiButton />;
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
      return <DeviceStatusButton />;
  }
}

/**
 * Simulate mode's context bar: where a simulated press sends its MIDI. Named rather than left as a
 * bare port picker, because it sits near the Pacer's own connection and the two are easily read as
 * the same thing. Stays visible before MIDI is granted, so the idea is discoverable at all.
 */
export function MidiOutputSelect() {
  const midi = usePacerStore((s) => s.midi);
  const selectMidiOutput = usePacerStore((s) => s.selectMidiOutput);

  if (midi.status !== "connected") {
    // Its own button rather than a "connect first" sentence: the thing to do belongs where the
    // lack of it is noticed, even though the header offers the same grant.
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Simulated MIDI output</span>
        {midi.status === "disconnected" || midi.status === "connecting" ? (
          <ConnectMidiButton />
        ) : (
          <span className="text-xs text-warning">MIDI unavailable — see the header</span>
        )}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <PortSelect
        label="Simulated MIDI output"
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
