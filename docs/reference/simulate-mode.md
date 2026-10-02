# Simulate mode

Simulate mode turns the on-screen Pacer into a working one. Press its switches
and it does what the hardware does with the configuration that's open: it
lights, changes preset, and sends MIDI — to the log, and, if you choose, to
your real gear.

That last part is the point. Pick your guitar processor, synth or DAW as the
**simulated MIDI output** and the on-screen Pacer drives it exactly as the real
one would. You can program a preset in [Program mode](program-mode.md), switch
to Simulate, and hear the result on your rig — before the Pacer has been sent
anything, and without one plugged in at all. See
[The simulator](../guide/the-simulator.md) for working that way.

## What's on screen

- **The context bar** — the simulated MIDI output, and **Reset MIDI state**.
  See [The window › In Simulate](the-window.md#in-simulate).
- **The faceplate** — the Pacer itself. See [The faceplate](the-faceplate.md).
- **The rear jacks** — external footswitches and expression pedals.
- **The output log** — what each press sent.

## The output log

![The output log after three presses](../images/output-log.png)

Each press gets an entry, **newest first**:

| Line | Meaning |
|---|---|
| **Stomp 1 — press** (blue) | What you did: the control and press or release. |
| `CH1 Program Change 6 [c0 06]` | A MIDI message the press sent, decoded, with its bytes. |
| **Preset changed: A1 → A2** (teal) | The press changed preset. A preset's load-time MIDI follows it. |
| `→ sent to Quad Cortex` | The messages above went out to your simulated MIDI output. Missing when the output is *Don't send*. |
| *(warning)* … (amber) | Something didn't go as the configuration asked — a message that couldn't be sent, or a press the Pacer would handle in a way worth knowing about (two jumps on one press: only the first is taken). |
| `(not sent) the Pacer is being written to…` | You've chosen the Pacer's own port as the output, and a send is in progress. Presses are dropped, not queued, so they can't corrupt the write. |

**Clear** empties it.

The firmware's own presets appear here too: entering preset select, Track or
Transport, and the DAW commands those presets send (by name — see
[What isn't simulated](#what-isnt-simulated)).

## What the simulator remembers

Like the Pacer, the simulator remembers the last value it sent on every
controller, note and program, per channel. That memory decides:

- what a **toggle** sends next — a CC Toggle sends its second value if the
  controller already holds its first, whichever switch sent it;
- what **colour** each switch shows — bright when "on", dim when "off".

The memory survives changing preset, as it does on the hardware: a program
selected on A1 is still lit when you come back to A1. **Reset MIDI state**
forgets it all, as if the Pacer had just been switched on. Opening another
configuration does the same.

Where each **expression pedal** sits is remembered too, the way a real pedal
stays where your foot left it.

## Loading presets

Every way of reaching a preset is a recall, and fires the preset's
[MIDI sent on load](program-mode.md#midi-sent-on-load) before anything else:

- a switch that jumps or steps there;
- the firmware's preset select (hold [Preset], then a bank and a number);
- the [preset chooser](the-faceplate.md#the-preset-chooser), and clicking a
  preset on the [map](preset-map.md).

Opening a configuration is *not* a recall: nothing is sent when a file is
loaded.

## What's simulated

- Every step type, in all three control modes, on press and release.
- Lights: which light, which colour, bright or dim, by the rules the hardware
  follows (see
  [Programming the Pacer › Lights](programming-the-pacer.md#lights)).
- Preset Select and Preset Inc/Dec, including wrapping D6 → A1.
- The firmware's preset select, with hold timing, and its Track and
  Transport presets.
- A preset's load-time MIDI.
- Expression pedals, swept between their minimum and maximum, with pitch bend
  spread over 14 bits as the hardware does.
- Relay actions, in the log.

## What isn't simulated

- **DAW commands** from the Track and Transport presets are logged by name but
  not sent: the bytes of Nektar's DAW integration aren't known.
- **Incoming MIDI.** The app has no MIDI input, so a light set to be
  [lit by incoming MIDI](program-mode.md#lit-by-incoming-midi) shows what the
  Pacer shows before anything answers.
- **External step select** — which step another switch picks for a switch in
  External step mode — isn't followed across switches.
- **The Pacer's setup menus** and global settings (the encoder does nothing).
