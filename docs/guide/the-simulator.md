# The Simulator: Your Rig, Without the Pacer

The Pacer on screen runs your configuration the same way the Pacer's firmware
does. Step types, control modes, the lights, preset changes and the MIDI each
preset sends when it loads all behave as they would on the hardware (there are
a few exceptions, listed [at the end](#what-it-cant-do)). It can also send
that MIDI to your real gear.

So you can program a switch, press it on screen, and hear your modeller, synth
or DAW respond. You don't need a Pacer connected, nothing gets written to one,
and if you get it wrong nothing is lost. Once it does what you want,
[send it](saving-and-sending.md) to the Pacer.

## Connecting Your Gear

The simulator sends from your computer, so your gear needs a MIDI connection to
the computer. Many modellers, synths and controllers show up as a MIDI port
when you plug them in over USB. If yours only has DIN MIDI, cable a USB MIDI
interface's MIDI Out to its MIDI In, the same way you'd cable the Pacer. A DAW on
the same computer can listen on a virtual MIDI port (the IAC Driver on macOS,
loopMIDI on Windows).

Then:

1. Click **Connect MIDI** in the header, and allow MIDI (and SysEx) when the
   browser asks.
2. In Simulate, choose your gear as the **Simulated MIDI output**.

   ![Simulate's context bar, sending to a Quad Cortex](../images/context-simulate.png)

3. Press a switch. The [output log](../reference/simulate-mode.md#the-output-log)
   shows what was sent, ending with `→ sent to Quad Cortex`.

The output starts out as **Don't send**, so nothing reaches real gear until you
pick a port.

## Two MIDI Setups

The app talks MIDI in two directions, and it keeps them separate on purpose.

| | Simulated MIDI output | The Pacer |
|---|---|---|
| Direction | Out to your rig | To and from the Pacer |
| What goes over it | What a switch press sends: program changes, CCs, notes | SysEx: dumps and preset writes |
| Where you choose it | Simulate's context bar | The [device drawer](../reference/devices-and-files.md#the-device-drawer) |
| You need it for | Hearing what you program | Pulling and sending |

The simulator plays the Pacer's part. It sends your rig what the Pacer would
send, but it doesn't drive the Pacer, and the Pacer doesn't drive it. You can
use either one without the other.

## Working with It

The loop goes like this:

1. Open a switch in Program mode and set its steps.
2. Try it right there. The [switch editor](../reference/program-mode.md#the-switch-editor)
   has a live copy of the control, and pressing it fires, lights and sends
   just like it does in Simulate.
3. Switch to Simulate and play the preset for real, including the switches
   that move between presets. Check that every light is telling you the
   truth.
4. Repeat until it's right, then save and send.

Every edit can be undone, and nothing you do here touches the Pacer until you
send it. (Undo only changes what's on screen, though. Once something has been
sent, the Pacer keeps it until you send again.)

### It Remembers, Like the Pacer Does

It turns out the Pacer remembers the last value it sent on every controller,
note and program, and its toggles and lights both follow that memory. The
simulator does the same thing, across preset changes. So if a light looks
wrong, it might be right: something earlier set the value it's showing.
**Reset MIDI state** starts over from nothing, like the Pacer does when you
switch it on.

Of course, your gear has its own memory, and the simulator can't see it. If
you change something on the gear directly, the simulator and the gear can
disagree, just as the Pacer and the gear would.

### What It Can't Do

The simulator doesn't receive MIDI, doesn't send the firmware's DAW
integration commands, and doesn't follow External step select between
switches. The full list is in
[Simulate mode](../reference/simulate-mode.md#what-isnt-simulated).
