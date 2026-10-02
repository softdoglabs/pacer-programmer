# The simulator: your rig, without the Pacer

The on-screen Pacer isn't a picture. It runs your configuration the way the
Pacer's firmware does — every step type, every control mode, the lights,
preset changes, the MIDI each preset sends when it loads — and it can send
that MIDI to **your real gear**.

So you can program a switch, press it on screen, and hear your amp modeller,
synth or DAW respond. No Pacer needs to be connected, nothing is written to
one, and nothing is lost if you get it wrong. When it does what you want,
[send it](saving-and-sending.md) to the Pacer.

## Connecting your gear

The simulator sends from your computer, so your gear needs a MIDI connection
to the computer:

- **USB MIDI devices** — many modellers, synths and controllers show up as a
  MIDI port when plugged in over USB.
- **DIN MIDI** — a USB MIDI interface's MIDI Out, cabled to your gear's MIDI
  In, exactly as the Pacer's MIDI Out would be.
- **A DAW** — on the same computer, through a virtual MIDI port (the IAC
  Driver on macOS, loopMIDI on Windows).

Then:

1. Click **Connect MIDI** in the header and allow MIDI (and SysEx) when the
   browser asks.
2. In **Simulate**, choose your gear as the **Simulated MIDI output**.

   ![Simulate's context bar, sending to a Quad Cortex](../images/context-simulate.png)

3. Press a switch. The [output log](../reference/simulate-mode.md#the-output-log)
   shows what was sent, ending `→ sent to Quad Cortex`.

**Don't send** is the default, so nothing reaches real gear until you pick a
port.

## Two MIDI setups, and why

The app talks MIDI in two directions, and keeps them apart:

| | Simulated MIDI output | The Pacer |
|---|---|---|
| Direction | Out to your rig | To and from the Pacer |
| What goes over it | What a switch press sends: program changes, CCs, notes | SysEx: dumps and preset writes |
| Where it's chosen | Simulate's context bar | The [device drawer](../reference/devices-and-files.md#the-device-drawer) |
| Needed for | Hearing what you program | Pulling and sending |

The simulator plays *the Pacer's part*: it sends to your rig what the Pacer
would. It doesn't drive the Pacer, and the Pacer doesn't drive it. You can
use either without the other.

## Working with it

The loop that makes this worth having:

1. **Program** a switch: open it in Program mode and set its steps.
2. **Try it** right there: the [switch editor](../reference/program-mode.md#the-switch-editor)
   has a live copy of the control. Press it and it fires, lights and sends,
   exactly as in Simulate.
3. **Play the preset** in Simulate, including the switches that move you
   between presets, and check that every light tells you the truth.
4. Repeat until it's right, then **Save** and **Send**.

Everything is undoable until you send, and nothing you do in the simulator
touches the Pacer.

### It remembers, like the Pacer

The Pacer remembers the last value it sent on every controller, note and
program, and both its toggles and its lights follow that memory. The
simulator does the same, across preset changes. If a light looks wrong, it
may be right: something earlier set the value it's showing. **Reset MIDI
state** starts from scratch, as the Pacer does when it's switched on.

Your gear has its own memory, which the simulator can't see. If you've
changed something on the gear directly, the simulator and the gear can
disagree, exactly as the Pacer and the gear would.

### What it can't do

The simulator doesn't receive MIDI, doesn't send the firmware's DAW
integration commands, and doesn't follow External step select between
switches. The full list is in
[Simulate mode](../reference/simulate-mode.md#what-isnt-simulated).
