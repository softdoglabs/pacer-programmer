# Pacer Programmer

A browser-based editor for the Nektar Pacer MIDI foot controller.

- **A real simulator.** The on-screen Pacer runs your configuration as the
  hardware would, and can drive your real rig over MIDI while you program —
  no Pacer needed until you're ready to send.
- **Plain programming.** Every switch, step, light and preset setting, with
  undo, snapshots, and sending only what changed.
- **The preset map.** Your presets drawn as the states and routes you
  designed, including the "go back to where I came from" routes the Pacer
  can only fake with copies — and the copies kept in step for you.
- **Your files, nothing else.** The configuration is the Pacer's own `.syx`
  dump, fully documented, so you (or an AI) can read and write it too.

It runs in Chrome, Edge, Opera or Brave. MIDI is only needed to reach real
gear and the Pacer.

## Where to start

- **New here:** [The simulator](guide/the-simulator.md), then
  [Editing a preset](guide/editing-a-preset.md).
- **Want to know why the map exists:** [Why a state machine](why-a-state-machine.md).
- **Building something:** the [tutorials](tutorials/) build a looper that
  returns to wherever you came from.
- **Looking something up:** the [reference](reference/) covers every control
  and every message.
- **Using an AI:** [Working with an AI](guide/working-with-ai.md) and the
  format it needs, [Programming the Pacer](reference/programming-the-pacer.md).

## Contents

**[Guide](guide/)** — how to get things done

- [The simulator](guide/the-simulator.md)
- [Editing a preset](guide/editing-a-preset.md)
- [Switches and steps](guide/switches-and-steps.md)
- [Lights and colours](guide/lights-and-colours.md)
- [MIDI sent when a preset loads](guide/preset-midi-on-load.md)
- [Saving and sending](guide/saving-and-sending.md)
- [Working with an AI](guide/working-with-ai.md)

**[Tutorials](tutorials/)** — a looper, step by step

1. [A looper preset](tutorials/1-a-looper-preset.md)
2. [A second way in](tutorials/2-a-second-way-in.md)
3. [Changing the looper](tutorials/3-changing-the-looper.md)
4. [Letting an AI build it](tutorials/4-letting-an-ai-build-it.md)

**[Reference](reference/)** — the manual

- [The window](reference/the-window.md)
- [The faceplate](reference/the-faceplate.md)
- [Simulate mode](reference/simulate-mode.md)
- [Program mode](reference/program-mode.md)
- [The preset map](reference/preset-map.md)
- [Devices and files](reference/devices-and-files.md)
- [Programming the Pacer](reference/programming-the-pacer.md)
- [Troubleshooting](reference/troubleshooting.md)
- [Glossary](reference/glossary.md)

**[Why a state machine](why-a-state-machine.md)** — the problem the preset
map solves.
